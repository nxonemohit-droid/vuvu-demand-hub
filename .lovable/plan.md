# Goal
Get to **20+ Serbia-targeting recruiter leads with valid contact emails** in a single discovery run.

# Current bottlenecks (from the last run: only 8 inserted, 0 with emails)
1. **Hardcoded recency** — `fcSearch` ignores `recencyDays` and always passes `tbs: "qdr:m"` (30 days). Most agency pages are evergreen, so we cut ourselves off.
2. **Early break at 8 candidates** — pipeline stops searching once `candidates.size >= 8`, even when `maxScrapes=20+` is requested.
3. **Narrow trade pool** — 14 trades, sampled 1–2 per country. For a single-country run (Serbia) that yields only ~12 queries total.
4. **Single-URL scrape** — only the SERP URL is scraped. Blog/news pages rarely include the agency's contact email; the `/contact` page does.
5. **Strict model gating** — leads with `recruitment_model="unknown"` get `excluded_reason="unknown_model"` even when they look legit.
6. **No Google-style dorks** — we don't exploit `site:*.rs`, `intext:"send CV"`, `inurl:contact "Nepal" "Serbia"`, etc.
7. **No post-discovery email enrichment** — `hunter-enrich` exists but isn't auto-triggered for the new leads.

# Plan

## 1. `recruiter-discover` enhancements (single function, no schema changes)

**Recency wiring**
- Map `recencyDays` → Firecrawl `tbs`: `<=7` → `qdr:w`, `<=31` → `qdr:m`, `<=365` → `qdr:y`, else omit (all-time). Pass through `fcSearch`.
- Default for the Serbia re-run: `recencyDays = 365`.

**Bigger trade & query pool**
- Extend `TRADES` with: electrician, painter, scaffolder, HVAC, CNC operator, forklift, picker/packer, food processing, meat processing, butcher, baker, chef, kitchen helper, housekeeping, room attendant, waiter, security guard, landscaping, shipyard, automotive assembly, tyre fitter, tile setter, plasterer, roofer, ironworker.
- When `countries.length === 1`, use **all** trades (don't sample) and bump `maxQueries` cap to 80.

**Boolean / Google dorks (new tier 3 + tier 4)**
- Tier 3 — Serbia-hosted agency sites: `("manpower" OR "recruitment" OR "labour supply" OR "agencija za zapošljavanje") (Nepal OR India OR Bangladesh) site:rs`
- Tier 4 — contact-page intent: `("workers to Serbia" OR "deployment Serbia" OR "Serbia placement") (Nepal OR India OR Bangladesh) (intext:"contact us" OR intext:"send your CV" OR inurl:contact)`
- Tier 5 — origin-side agencies (India/Nepal/BD agencies advertising Serbia): `("recruitment agency" OR "manpower consultant") "Serbia" (Nepal OR India OR Bangladesh) (site:in OR site:np OR site:com.bd)`

**Remove the early `candidates.size >= 8` break**
- Replace with `>= maxScrapes * 2` so we always have enough headroom for the requested scrape count.

**Contact-page fallback scrape**
- After the SERP-URL scrape, if `contact_email` is missing, do a second `fcScrapeJson` against `https://{domain}/contact` (try `/contact-us`, `/about`, `/about-us` in order until one returns 200 with an email). Cap at 1 fallback attempt per lead to bound credit cost.

**Soften model gating**
- Leads with `model === "unknown"` → `status="active"` (no `excluded_reason`). Still exclude `upfront_fee`, `sub_agent`, `training_institute`.
- Drop the `stale` exclusion (we already filter via `tbs`).

## 2. Auto-trigger Hunter enrichment after discovery
- At the end of `runPipeline`, fetch newly inserted/updated leads from this run that still have `contact_email IS NULL` and a usable domain, then call `hunter-enrich` (existing edge function) with that batch. Max 30 leads per call.

## 3. Kick off the Serbia re-run
Invoke `recruiter-discover` with:
```json
{
  "countries": ["Serbia"],
  "recencyDays": 365,
  "maxQueries": 60,
  "maxScrapes": 40,
  "scrapeConcurrency": 6,
  "searchConcurrency": 8
}
```

## 4. Verify
- Poll `discovery_jobs.result` until `status='completed'`.
- Query `recruiter_leads where (operating_eu_country ilike 'serbia' or hq_country ilike 'serbia') and contact_email is not null and contact_email <> 'N/A'`.
- Report: total Serbia leads, with-email count, breakdown by HQ country, and any failures.

# Files to change
- `supabase/functions/recruiter-discover/index.ts` — all logic above.
- No DB migration. No frontend change.

# Risk / cost notes
- Firecrawl credits: ~60 searches + up to ~80 scrapes (40 SERP + 40 fallback) ≈ ~140 credit units. Acceptable for one targeted run.
- Hunter call: bounded to 30 leads.
- Auto-tune learning table (`discovery_query_stats`) still applies, so repeated runs self-prune dead queries.
