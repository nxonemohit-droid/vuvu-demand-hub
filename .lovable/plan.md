## Demand Scout Pro — Phase 1 (Multi-Source Ingestion + Scoring + Admin Dashboard)

End state: a modular pipeline where any source (LinkedIn, Google Jobs, Indeed, career pages, official sites, Facebook, directories) plugs into the same `fetch → normalize → resolve → score` flow. First-party sources outrank aggregators by design.

---

### A. Current state (verified)

- Tables: `demand_leads`, `raw_signals`, `scrape_jobs`, `candidates`, `demand_matches`, `profiles`, `user_roles`.
- Functions: `apify-discover`, `structure-leads`, `hunter-enrich`, `match-candidates`.
- Enum `demand_source` = `{facebook, indeed, classifieds, career_page, other}` — **missing `linkedin`, `google_jobs`, `company_site`, `directory`**. Code already references `linkedin` → silently failing inserts.
- No scheduled jobs, no canonical company table, no normalization layer, no scoring layer, no run-event telemetry.

---

### B. Schema & migrations (in order)

**Mig 1 — extend `demand_source` enum**
Add: `linkedin`, `google_jobs`, `company_site`, `directory`. Existing rows untouched.

**Mig 2 — `source_registry`** (the heart of modularity)
```
id text pk                          -- 'linkedin_bebity', 'linkedin_official', 'google_jobs',
                                       'indeed', 'career_page_generic', 'company_site_firecrawl',
                                       'facebook_public', 'directory_generic'
source_family demand_source not null -- maps to enum
display_name text
adapter text not null               -- 'apify' | 'firecrawl' | 'http'
actor_or_endpoint text              -- e.g. 'bebity~linkedin-jobs-scraper'
default_input jsonb default '{}'    -- per-source defaults
trust_tier int not null             -- 1=first-party (career_page, company_site), 2=major boards (indeed, google_jobs), 3=supplemental (linkedin, facebook, directory)
confidence_weight numeric not null  -- 0.0–1.0, multiplier in scoring
enabled bool default true
schedule_cron text                  -- per-source cadence override, null=use default 6h
rate_limit_per_hour int default 60
created_at, updated_at
```
Seed with all 8 source rows + tier/weights:
- tier 1 (weight 1.00): `career_page_generic`, `company_site_firecrawl`
- tier 2 (weight 0.80): `indeed`, `google_jobs`
- tier 3 (weight 0.55): `linkedin_bebity`, `linkedin_official`, `facebook_public`, `directory_generic`

**Mig 3 — `companies`** (canonical entity)
```
id uuid pk
name text not null
website_domain text unique          -- normalized eTLD+1, primary key for resolution
linkedin_slug text unique
official_url text
careers_url text
country text
industry text
size_bucket text                    -- 'micro'|'sme'|'mid'|'large'|'enterprise'
employer_type text                  -- 'direct'|'staffing_agency'|'unknown'
metadata jsonb default '{}'
first_seen_at, last_seen_at, created_at, updated_at
```
Indexes on `website_domain`, `linkedin_slug`, `country`.

**Mig 4 — `normalized_demand`** (one row per real job posting, post-dedup)
```
id uuid pk
company_id uuid → companies(id)
role_title text not null
role_normalized text                -- lowercased, stop-words stripped, used in fingerprint
country text not null
city text
sector text                         -- construction|hospitality|logistics|healthcare|...
employment_type text                -- 'full_time'|'seasonal'|'contract'|...
salary_min, salary_max numeric, salary_currency text
visa_sponsorship bool
posted_at timestamptz
expires_at timestamptz
fingerprint text not null           -- sha256(company_domain|role_normalized|country|city)
seen_count int default 1
first_seen_at, last_seen_at timestamptz
unique(fingerprint)
```
Re-allow window enforced by trigger: if `last_seen_at < now() - 14 days` an upsert creates a new row instead of updating (captures reposts).

**Mig 5 — `demand_provenance`** (many-to-many: which sources contributed to a normalized_demand)
```
id uuid pk
normalized_demand_id uuid → normalized_demand(id)
source_id text → source_registry(id)
raw_signal_id uuid → raw_signals(id)
source_url text
first_seen_at, last_seen_at timestamptz
unique(normalized_demand_id, source_id, source_url)
```
This is what makes the review queue show "seen on Indeed + career page + LinkedIn".

**Mig 6 — extend `raw_signals`**
Add `source_id text`, `last_seen_at timestamptz`, `seen_count int default 1`, `company_domain text`.

**Mig 7 — extend `scrape_jobs`**
Add `source_id text → source_registry(id)`, `input jsonb`, `metrics jsonb` (e.g. `{fetched: 50, new_signals: 12, errors: 0}`).

**Mig 8 — `scrape_run_events`** (per-job telemetry)
```
id uuid pk
scrape_job_id uuid → scrape_jobs(id)
event_type text                     -- 'started'|'fetched_page'|'item_parsed'|'rate_limited'|'error'|'finished'
severity text                       -- 'info'|'warn'|'error'
message text
data jsonb
created_at timestamptz default now()
```

**Mig 9 — extend `demand_leads`** (becomes the scored/qualified surface)
Add:
- `company_id uuid → companies(id)`
- `normalized_demand_id uuid → normalized_demand(id)`
- `score numeric` (0–100)
- `tier text` (`A`|`B`|`C`)
- `score_breakdown jsonb` (subscores: recency, frequency, role_fit, geo_fit, employer_size, source_trust)
- `ai_rationale text` (one paragraph from gemini-2.5-flash-lite)
- `review_status text default 'new'` (`new`|`approved`|`snoozed`|`rejected`)
- `snoozed_until timestamptz`

**Mig 10 — RLS** for all new tables: same pattern as existing (public read, team write, admin delete).

---

### C. Backend / functions

Refactor `apify-discover` into a **clean dispatcher** plus per-adapter modules:

```
supabase/functions/
  ingest-dispatch/      # NEW. Reads source_registry, fans out per source.
  adapter-apify/        # NEW. Generic Apify run+drain. Used by linkedin, indeed, google_jobs, facebook, directory.
  adapter-firecrawl/    # NEW. Used by career_page + company_site (high-fidelity extraction).
  normalize-signals/    # NEW. raw_signals → normalized_demand + companies (entity resolution).
  score-leads/          # NEW. normalized_demand → demand_leads with rule-based score + AI rationale.
  apify-discover/       # KEPT as thin shim for back-compat, delegates to ingest-dispatch.
  structure-leads/      # KEPT, used as fallback parser inside normalize-signals.
  hunter-enrich/        # KEPT, called from score-leads when contact_email missing.
  match-candidates/     # KEPT.
```

**1. `ingest-dispatch`**
- Input: `{ source_ids?: string[], countries?: string[], keywords?: string[] }`. Defaults: all enabled sources, all priority countries.
- For each `(source_id × country × keyword)` tuple: insert `scrape_jobs` row, route to correct adapter (`apify` or `firecrawl`), respect `rate_limit_per_hour`.
- Writes `scrape_run_events` throughout.

**2. `adapter-apify`**
- Generic. Reads `source_registry.actor_or_endpoint` + merges `default_input` with runtime overrides.
- Handles all current Apify sources + Google Jobs (`hKByXkMQaC5N1pqsT` Google Jobs scraper) + Facebook Pages (`apify~facebook-pages-scraper`, **public pages only**, with explicit ToS comment).
- Streams results in batches (max 50 per insert) → `raw_signals` with `source_id`, `company_domain` (extracted from posting URL or company URL), fingerprint.

**3. `adapter-firecrawl`** (new connector — Firecrawl)
- For `career_page_generic`: uses Firecrawl `scrape` with `formats: [{ type: 'json', prompt: '...extract all open job postings...' }]` against each company's `careers_url`.
- For `company_site_firecrawl`: uses Firecrawl `map` to find /careers /jobs /work-with-us /vacancies pages, then scrape each.
- Higher signal, higher cost — only runs against companies in `companies` where `careers_url` is known OR resolved via AI.
- Will require Firecrawl connector — **agent will call `standard_connectors--connect` for `firecrawl` during build**.

**4. `normalize-signals`** (the entity resolution + dedup core)
For each unprocessed `raw_signal`:
1. Extract: company name, website URL, role, location, posted date, salary, description.
2. Resolve company:
   - Normalize domain (strip `www.`, lowercase, eTLD+1).
   - Lookup `companies` by `website_domain` → else by `linkedin_slug` → else by fuzzy name+country.
   - If miss: insert new company row, mark `employer_type='unknown'`.
   - If `careers_url` empty and source is LinkedIn/Indeed: enqueue lightweight Lovable AI call (`gemini-2.5-flash-lite`) to resolve the careers URL. Cached in `companies.careers_url`.
3. Compute `fingerprint = sha256(domain | role_normalized | country | city)`.
4. Upsert `normalized_demand`:
   - Hit + `last_seen_at >= now()-14d` → update `last_seen_at`, increment `seen_count`.
   - Hit + `last_seen_at < now()-14d` → insert new row (repost = signal).
   - Miss → insert.
5. Insert `demand_provenance` row linking normalized_demand ↔ source ↔ raw_signal.
6. Mark `raw_signals.structured = true`.

**5. `score-leads`** (deterministic + AI rationale)
For each `normalized_demand` not yet in `demand_leads`:

```
recency_score    = max(0, 100 - days_since_posted * 5)        # 0..100
frequency_score  = min(100, company.posting_count_30d * 10)
role_fit_score   = lookup(sector → target sectors, 0..100)
geo_fit_score    = lookup(country → target countries, 0..100)
employer_size    = bucket_score(company.size_bucket)
source_trust     = max(provenance[*].source.confidence_weight) * 100
                   + 10 bonus per additional distinct source family

score = weighted_sum:
        recency 0.20 + frequency 0.20 + role_fit 0.20
      + geo_fit 0.15 + employer_size 0.10 + source_trust 0.15

tier = A if score>=75, B if >=55, else C
```

Then call Lovable AI (`gemini-2.5-flash-lite`) with the structured lead + provenance list → one-paragraph `ai_rationale` ("Why this lead matters: …"). Cached per lead, never re-generated unless score changes ≥10 points.

Insert into `demand_leads` with `review_status='new'`.

**6. Idempotency & retries**
- `scrape_jobs` has unique `(source_id, country, keyword, started_at::date)` for the same calendar day to prevent accidental re-runs from cron flapping.
- `normalized_demand.fingerprint` unique → safe re-processing of `raw_signals`.
- All adapters write `scrape_run_events` so reruns are auditable.

---

### D. Scheduling (pg_cron, every 6h, source-aware)

Inserted via the **insert tool** (contains URL + anon key, not a migration):

```sql
-- Master tick: every 6h, dispatch all enabled sources
select cron.schedule(
  'demand-scout-master-6h',
  '7 */6 * * *',
  $$ select net.http_post(
       url := 'https://tqzuluaukgwnqbeyvvkc.supabase.co/functions/v1/ingest-dispatch',
       headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);

-- Normalization: every 10 min, drain unprocessed raw_signals
select cron.schedule(
  'demand-scout-normalize-10m',
  '*/10 * * * *',
  $$ select net.http_post(url:='.../normalize-signals', ...); $$
);

-- Scoring: every 15 min, score new normalized_demand
select cron.schedule(
  'demand-scout-score-15m',
  '*/15 * * * *',
  $$ select net.http_post(url:='.../score-leads', ...); $$
);
```

Per-source cadence overrides live in `source_registry.schedule_cron` and `ingest-dispatch` honours them.

---

### E. Frontend (Demand Intelligence section)

New routes under existing app shell:

1. **`/demand`** — Overview dashboard
   - KPIs: new leads (24h/7d), by tier, by source family, by country
   - Trends: 14-day sparkline of leads/day stacked by source family
   - "First-party vs aggregator" ratio gauge

2. **`/demand/sources`** — Source registry admin
   - Table of all sources: enabled toggle, tier, weight, last run, success rate, items found 24h
   - Edit cadence + rate limit inline
   - "Run now" button → calls `ingest-dispatch` with single source_id

3. **`/demand/runs`** — Scrape runs telemetry
   - Filterable list of `scrape_jobs` (source, country, status, items_found, duration)
   - Drilldown opens `scrape_run_events` timeline

4. **`/demand/queue`** — Review queue (the daily driver)
   - Cards grouped by company, sorted by score desc within each tier
   - Each card shows: company, role(s), country, score + breakdown (radar mini), AI rationale, **provenance chips** (source family icons + URLs, first-party badges shown larger and ranked first)
   - Actions: Approve / Snooze (1d/3d/7d) / Reject
   - Filters: source family, tier, country, sector, "first-party only" toggle
   - **Provenance ranking rule in UI**: chips ordered tier 1 → tier 2 → tier 3 with visual weight (filled vs outlined badge).

5. **`/keyword-audit`** — keep existing, add "Source" column.

Reuse existing shadcn primitives, Voynova brand tokens (#0052CC primary, #36B37E accent), Inter font, rounded-xl cards. Mobile-first.

---

### F. Connectors required

- **Firecrawl** — for first-party career-page + company-site extraction. Will prompt user to connect during build.
- All other sources use existing `APIFY_API_TOKEN` + `LOVABLE_API_KEY`.

No Twilio / Resend / Email work in Phase 1 (that's Outreach Studio = Phase 2).

---

### G. Build order (small, reviewable chunks)

1. **Schema chunk**: migrations 1–10 + seed `source_registry`. Pause, summarize.
2. **Backend chunk A**: `ingest-dispatch`, `adapter-apify`, refactor of `apify-discover` into shim. Pause, summarize.
3. **Backend chunk B**: connect Firecrawl, build `adapter-firecrawl`, build `normalize-signals`. Pause, summarize.
4. **Backend chunk C**: `score-leads` (rules + AI rationale), pg_cron schedules. Pause, summarize.
5. **Frontend chunk**: `/demand` overview, `/demand/sources`, `/demand/runs`, `/demand/queue`. Pause, summarize.
6. **Final chunk**: wire nav, smoke test one full cycle (run dispatch → see signals → see normalized → see scored leads in queue), document "how to add a new source" in code comments.

---

### H. How to add a new source later (designed-in extensibility)

1. Insert one row into `source_registry` (id, family, adapter, actor_or_endpoint, trust_tier, weight).
2. If adapter is `apify` or `firecrawl` and the input shape fits → **zero code changes**.
3. If exotic: add a 30-line module under `supabase/functions/adapter-<name>/` and add one `case` in `ingest-dispatch`.
4. The source automatically appears in the Sources admin page and starts being scheduled.

---

### I. Out of scope (Phase 2)

- Outreach Studio (Email via Lovable Emails, LinkedIn drafts, WhatsApp via Twilio).
- Inngest migration.
- Candidate auto-matching expansion.
- LinkedIn/Facebook ToS note: scrapers are configured for **public content only**; comments in code make compliance responsibility explicit.
