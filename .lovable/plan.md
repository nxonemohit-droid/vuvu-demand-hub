## Goal

Add a **Recruiter Discovery** flow that finds active recruiters / labour-supply agencies / freelance HR consultants headquartered in your Balkan + wider EU target list who hire blue-collar workers from Nepal / India / Bangladesh, classifies them by recruitment-model tag, and surfaces them in a sortable UI.

The pipeline is:

```
[ Recruiter Discovery edge fn ]
        │  Firecrawl /search + /scrape (json schema extraction)
        ▼
[ raw_signals (source='recruiter_directory') ]
        │  structure-leads (already classifies by quality + dedupes)
        ▼
[ recruiter_leads (new table) ]   ──►   [ /recruiters page ]
```

Existing infra reused: Firecrawl is already wired (`firecrawl-search`, `firecrawl-webhook`), Lovable AI is available for tag classification, `archived_leads` for soft-archive, country meta lives in `_shared/constants.ts`.

---

## Data model (one new table, one enum)

```
recruitment_model_tag enum:
  'no_advance_after_visa'
  'no_advance_after_deployment'
  'free_recruitment'
  'company_recruitment'
  'unknown'

recruiter_leads
  id uuid pk
  agency_name text not null
  hq_country text          -- Serbia, Germany, …
  hq_city text
  operating_eu_country text
  contact_name text
  contact_email text
  contact_phone text        -- WhatsApp/phone
  contact_linkedin text
  recruitment_model recruitment_model_tag[]   -- multi-tag, must contain ≥1 of the 4 valid tags
  license_number text
  license_verified bool default false
  active_orders jsonb       -- [{role, country, headcount, salary_min, salary_max, currency, posted_at}]
  worker_origin_focus text[] default '{}'     -- 'NP','IN','BD'
  source_url text
  source_posted_at timestamptz   -- the date on the source page (if extracted)
  discovered_at timestamptz default now()
  last_seen_at timestamptz default now()
  raw_signal_id uuid
  excluded_reason text       -- 'upfront_fee','sub_agent','training_institute','stale','unknown_model'
  status text default 'active'   -- 'active' | 'excluded' | 'archived'
  quality_score int default 0
```

RLS mirrors `demand_leads` (team read/insert/update, admin delete). Triggers:
- `set_updated_at`
- `recruiter_leads_set_quality_score` (similar to demand_leads scorer + bonus for verified license, NP/IN/BD focus, ≥1 active order).

---

## Edge function: `recruiter-discover`

Inputs (all optional):
```
{
  countries?: string[],         // default: Balkan + wider EU lists from spec
  origins?: ('NP'|'IN'|'BD')[], // default: all three
  trades?: string[],            // default: full blue-collar list from spec
  recencyDays?: number,         // default: 90 (matches "exclude older than 90 days")
  maxQueries?: number,          // default 30, cap 60
  maxResultsPerQuery?: number   // default 15, cap 25
}
```

Pipeline per run:

1. **Build queries** — one per (country × trade × origin) sample, e.g.:
   ```
   ("recruitment agency" OR "manpower agency" OR "labour supply" OR "HR consultant")
   ("Nepal" OR "India" OR "Bangladesh") workers
   <trade> "<country>"
   ("free recruitment" OR "no advance" OR "company paid")
   -site:linkedin.com -site:indeed.com
   ```
   Use Firecrawl `tbs: "qdr:m"` (last month), then filter by extracted date for the 90-day rule.

2. **Search** via Firecrawl `/v2/search` with `country` hint and `limit: maxResultsPerQuery`.
   Drop aggregator domains (existing `AGGREGATOR_DOMAINS` set), drop already-excluded domains (lookup in `lead_blacklist`), de-dupe by domain within the run.

3. **Scrape & extract** each survivor with Firecrawl `/v2/scrape` using `formats: [{type:'json', schema}]` where schema asks for:
   ```
   agency_name, hq_country, hq_city, operating_country,
   contact_name, contact_email, contact_phone, contact_linkedin,
   license_number, posted_at,
   recruitment_model: enum (the 4 valid tags + 'upfront_fee','sub_agent','training_institute','unknown'),
   charges_upfront_candidate_fee: boolean,
   active_orders: [{role, country, headcount, salary_min, salary_max, currency}],
   worker_origin_focus: array<'NP'|'IN'|'BD'>
   ```

4. **Apply exclusions** in code (cheaper than re-prompting):
   - `charges_upfront_candidate_fee === true` → `excluded_reason = 'upfront_fee'`
   - model in {`sub_agent`,`training_institute`,`unknown`} or empty → `excluded_reason = 'unknown_model'` / matching value
   - `posted_at` older than `recencyDays` → `excluded_reason = 'stale'`
   - Drop entries that don't mention NP/IN/BD anywhere in the page text or origin focus.

5. **Persist**:
   - Insert raw page payload into `raw_signals (source='recruiter_directory', payload=…)` so we keep provenance.
   - Insert eligible rows into `recruiter_leads` with `status='active'`; excluded rows go in with `status='excluded'` + `excluded_reason` so we can audit and don't re-discover.
   - Upsert by `(agency_name, hq_country)` to refresh `last_seen_at` + merge new `active_orders`.

6. **License verification (best-effort, async)** — if `license_number` extracted and country is one of (RS, RO, PL, HR), enqueue a follow-up `verify-recruiter-license` job (separate edge fn, optional Phase 2) that hits the public registry URL pattern for that country and flips `license_verified=true` on match. Stub for now; structure leaves room.

7. Returns `{ ok, searched, discovered, inserted, excluded, breakdown_by_country }`.

---

## Edge function: `verify-recruiter-license` (Phase 2 stub)

Per-country registry URL templates (none of these need an API key — Firecrawl scrape):
- Serbia: `nszna.gov.rs` agency search
- Romania: `anofm.ro/agentii-de-plasare`
- Poland: `stor.praca.gov.pl/portal/#/kraz/wyszukiwarka` (KRAZ)
- Croatia: `mrosp.gov.hr` agency list

Implementation: Firecrawl `/scrape` with a search query → string-match the license number / agency name → flip flag. Build only after Phase 1 produces real data.

---

## UI: `/recruiters` page

New page in left nav (under "Demand Intelligence"). Mirrors the Leads page layout but with recruiter-specific columns:

| Agency | HQ | Operating EU | Contact | Active orders | Model tag | License | Source | Posted |

Features:
- **Default sort**: most recent `last_seen_at` → highest `sum(active_orders.headcount)` → `license_verified DESC`. Sort is user-toggleable.
- **Filters** (left rail):
  - HQ country (multi-select, default = full target list)
  - Operating EU country
  - Recruitment model (multi-select, defaults to the 4 allowed tags)
  - Worker origin focus (NP/IN/BD)
  - Trade (chips)
  - Min headcount
  - "License verified only" toggle
  - "Posted within 90/30/7 days"
- **Row details**: drawer with full active-orders table, raw extracted JSON, source URL preview, copy-to-clipboard for email/phone/LinkedIn.
- **Bulk actions** (admin): Mark excluded, send to outreach (writes to `lead_outreach_log`), soft-archive via `archive_and_delete_*` pattern.
- **"Run discovery" button** (admin) calls `recruiter-discover` with current filter set as overrides. Shows toast + auto-refresh on completion.

CSV / PDF export reuses `lib/lead-export.ts` with a recruiter-specific column map.

---

## Defaults baked into the edge fn

```ts
HQ_COUNTRIES = [
  // Balkan
  "Serbia","Croatia","Bosnia and Herzegovina","Slovenia","Montenegro",
  "North Macedonia","Albania","Kosovo","Bulgaria","Romania",
  // Wider EU
  "Germany","Poland","Czechia","Slovakia","Hungary","Portugal",
  "Malta","Cyprus","Greece","Netherlands","Austria",
];
TRADES = [
  "construction","welding","masonry","carpentry","steel fixing","plumbing",
  "warehouse","logistics","hospitality","cleaning","agriculture",
  "factory operator","driver",
];
ORIGINS = ["Nepal","India","Bangladesh"];
ALLOWED_MODELS = [
  "no_advance_after_visa","no_advance_after_deployment",
  "free_recruitment","company_recruitment",
];
```

(Kosovo isn't in `COUNTRY_META` today — I'll add it: `XK`, langs `["en","sq","sr"]`.)

---

## Files to add / change

### New
- `supabase/migrations/<ts>__recruiter_leads.sql` — enum + table + RLS + triggers + indexes (`hq_country`, `last_seen_at`, GIN on `recruitment_model`).
- `supabase/functions/recruiter-discover/index.ts` — orchestrator described above.
- `supabase/functions/verify-recruiter-license/index.ts` — Phase 2 stub (returns `{ok:true, queued:0}` until implemented).
- `src/pages/Recruiters.tsx` — page + filters + table + drawer.
- `src/components/recruiters/RecruiterCard.tsx`, `RunDiscoveryDialog.tsx`.
- `src/lib/recruiter-shape.ts` — shared types + scoring helpers.

### Edit
- `supabase/functions/_shared/constants.ts` — add Kosovo, add `RECRUITER_TRADES` + `WORKER_ORIGINS` + `RECRUITMENT_MODEL_VALUES` constants.
- `src/App.tsx` — `/recruiters` route.
- `src/components/AppLayout.tsx` — nav link.
- `src/integrations/supabase/types.ts` — auto-regenerated after migration.

---

## Open questions before building

1. **Schedule**: Run `recruiter-discover` nightly via pg_cron (like the enrichment job), or only on-demand from the UI button? I'd default to **on-demand + a weekly Sunday 04:00 UTC cron**.
2. **Default trade list**: spec lists 13 trades. Searching all (13 trades × 21 countries × 3 origins) would blow Firecrawl credits. I propose **sampling**: rotate through a different (country × origin) × top-3-trade set each run, and capping at `maxQueries = 30` per invocation. OK?
3. **Model classification**: if Firecrawl JSON extraction returns ambiguous text instead of one of the 4 enum values, do you want a follow-up Lovable AI call (`google/gemini-2.5-flash`) to re-classify, or just flag it `excluded_reason = 'unknown_model'`? AI call adds quality but ~2× cost.
4. **License verification**: build the Phase 2 verifier in this build, or ship discovery + UI first and add it once we have real recruiter data to test the registry scrapers against?
