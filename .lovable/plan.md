
# Local Job-Board Lead Discovery Engine

Build a country-by-country scraper that pulls live job postings from the **native** job boards of each Balkan/EU market, extracts the hiring employer, enriches contact details, and only surfaces a lead in the dashboard when **both an email AND a phone number** are available.

## 1. Curated local board list (per country)

We already have `COUNTRY_META` in `supabase/functions/_shared/constants.ts`. We'll expand and lock the per-country "primary local boards" — these are the ones that actually publish blue-collar/operational hiring with employer contact info.

| Country | Primary local boards |
|---|---|
| Serbia | poslovi.infostud.com, helloworld.rs, poslovi.rs |
| Croatia | mojposao.net, posao.hr, moj-posao.net |
| Slovenia | mojedelo.com, optius.com, zaposlitev.net |
| Bosnia | posao.ba, kolektiv.ba, boljiposao.com |
| Montenegro | posao.me, poslovi.me |
| N. Macedonia | vrabotuvanje.com.mk, mojakariera.com.mk |
| Albania | duapune.com, njoftime.com (Punë) |
| Bulgaria | jobs.bg, zaplata.bg, rabota.bg |
| Romania | ejobs.ro, bestjobs.eu, hipo.ro |
| Hungary | profession.hu, jobline.hu |
| Poland | pracuj.pl, olx.pl/praca, gowork.pl |
| Czechia | jobs.cz, prace.cz |
| Slovakia | profesia.sk, kariera.sk |
| Germany | stepstone.de, arbeitsagentur.de, meinestadt.de/jobs |
| Austria | karriere.at, stepstone.at |
| Netherlands | nationalevacaturebank.nl, werk.nl |
| Greece | kariera.gr, skywalker.gr, jobfind.gr |
| Italy | infojobs.it, subito.it/offerte-lavoro |
| Spain | infojobs.net, tablondeanuncios.com |
| Portugal | net-empregos.com, sapo.pt/emprego |
| Cyprus | ergodotisi.com, carierista.com |

User can edit/add boards via Settings → Sources later.

## 2. Architecture

```text
                 ┌─────────────────────────┐
   cron (daily) →│  discover-local-jobs    │  (orchestrator edge fn)
                 │  per country × board    │
                 └──────────┬──────────────┘
                            │  fans out per board
            ┌───────────────┴───────────────┐
            ▼                               ▼
   adapter-firecrawl                adapter-apify
   (search + scrape any              (board-specific actor
    public board with markdown)        when available)
            │                               │
            └──────────────┬────────────────┘
                           ▼
                 raw_signals  (existing table)
                           ▼
                 structure-leads (LLM extraction)
                           ▼
                 demand_leads (existing table)
                           ▼
            enrich-contacts (NEW pipeline)
                ├─ Hunter.io  (email by domain + name)
                ├─ Apollo / Snov fallback
                ├─ enrich-email (already exists, pattern guesser)
                └─ phone scraper (firecrawl scrape company site
                                  + regex for +XX phone numbers)
                           ▼
            qualified_leads VIEW  (email IS NOT NULL
                                  AND phone IS NOT NULL)
                           ▼
              Dashboard "Local Hiring" page
```

## 3. Data model changes (small)

- `demand_leads`: add `discovered_board text`, `posted_at_local timestamptz`, `local_lang text`, `phone_enriched bool`, `email_enriched bool`, `contact_qualified bool` (generated from email + phone presence).
- New table `source_boards`(country, board_domain, type ['firecrawl'|'apify_actor'|'rss'], actor_id, enabled, last_run_at, success_rate) — replaces the hardcoded `COUNTRY_META.boards` so it's editable from UI.
- New view `qualified_local_leads` = `demand_leads WHERE contact_qualified = true AND discovered_board IS NOT NULL`.

## 4. Scraping strategy per board

For each board we'll pick the cheapest viable path:

1. **Firecrawl `/search`** with `site:<board>` + role keyword (welder, nurse, driver…) and `tbs=qdr:w` for last-week postings. Cheapest, works on 90% of boards.
2. **Firecrawl `/scrape`** on each result URL with our existing `FIRECRAWL_JOB_SCHEMA` to pull title, company, city, contact_email, contact_phone, posted_at.
3. **Apify actor** when a board is JS-heavy or geo-walled (pracuj.pl, jobs.bg, stepstone.de) — use existing `adapter-apify` pattern; we register `actor_id` per board in `source_boards`.
4. Respect robots.txt; throttle 1 req/2s per domain.

## 5. Contact enrichment pipeline (NEW edge fn `enrich-contacts`)

Run after `structure-leads` populates `demand_leads`. For each lead missing email or phone:

1. Resolve company domain (reuse logic from `enrich-email`).
2. **Email**: try Hunter.io domain search → fallback Apollo → fallback pattern guess.
3. **Phone**: Firecrawl-scrape the company homepage + `/contact`, regex `\+?\d[\d\s().-]{7,}` filtered by country dial code; pick the most frequent.
4. Write back `contact_email`, `contact_phone`, set `email_enriched` / `phone_enriched`.
5. `contact_qualified` flips true only when **both** are present and email passes basic MX check (DNS lookup from edge fn).

**New secrets needed (we'll request when build starts):**
- `HUNTER_API_KEY` (primary email finder)
- `APOLLO_API_KEY` (optional fallback)

If user prefers, we can skip Apollo and only use Hunter + pattern guess + site-scrape.

## 6. Dashboard UI — new page `Local Hiring`

Route: `/local-hiring`, added to sidebar under Demand Intelligence.

- **Filters**: country (multi), board (multi), role keyword, posted-within (24h / 7d / 30d), only-qualified toggle (default ON).
- **Table columns**: Company · Country · City · Role · Posted · Email · Phone · Board · Score · Actions (View, Push to Outreach).
- **Hard filter**: by default only rows where `contact_qualified = true` are shown. A "Show unqualified" switch reveals the rest in a muted style with a "Try Enrich" button per row.
- **Bulk actions**: Enrich selected, Push to Campaign, Export CSV.
- **Per-row drawer**: full job post markdown, all extracted fields, enrichment audit trail.

## 7. Scheduling

- pg_cron job `discover-local-jobs-daily` at 06:00 UTC: iterates `source_boards WHERE enabled = true`, queues per-board discovery.
- pg_cron job `enrich-contacts-hourly`: scans `demand_leads WHERE contact_qualified = false` (limit 200/run).
- Manual triggers from the Local Hiring page: "Run discovery now (country X)" and "Re-enrich selected".

## 8. Rollout phases

1. **Phase 1 (this build)**: schema + `source_boards` seeded with table above, `discover-local-jobs` edge fn using Firecrawl search/scrape, `enrich-contacts` with Hunter + pattern-guess + site-phone-scrape, qualified view, new dashboard page with strict email+phone gating, daily cron.
2. **Phase 2 (later)**: per-board Apify actors for the JS-heavy boards (pracuj.pl, jobs.bg, stepstone), Apollo fallback, LinkedIn company-page enrichment via existing LinkedIn-Official actor for decision-maker name.
3. **Phase 3 (later)**: auto-push qualified leads into the existing Voynova outreach campaign engine.

## 9. Open questions before build

- Confirm Hunter.io as the email finder (cheapest, 50 free/mo, then $34/mo for 500). OK to request the API key?
- Should "qualified" require a **valid** phone (libphonenumber parse + country match), or just any digit string ≥ 8 chars?
- Daily volume cap per country to control Firecrawl spend? (suggest 50 postings/country/day to start.)
- Include white-collar postings or filter strictly to blue-collar trades (welder, driver, nurse, caregiver, construction, hospitality, factory, warehouse)?
