# Voynova Lead Discovery Engine v2

Implementation plan for the 10 enhancements + 4 confirmed answers.

## 1. Database schema (single migration)

**`demand_leads` — add columns:**
- `lead_score` int default 0 (0-100, computed by trigger)
- `score_components` jsonb default '{}' (transparent breakdown)
- `vacancy_count` int default 1
- `is_direct_employer` boolean default true
- `repost_count` int default 1
- `trade_category` text (welding, construction, driver, factory, warehouse, hospitality, caregiving, cleaning, security, agriculture, logistics, manufacturing, other)
- `email_source` text default 'missing' ('hunter','guessed','scraped','missing')
- `phone_e164` text (validated E.164)
- `outreach_queued` boolean default false
- `outreach_queued_at` timestamptz
- Unique index on `(lower(employer_name), country, trade_category)` partial where employer_name not null — for soft dedup
- Trigger `demand_leads_score_trigger` BEFORE INSERT/UPDATE → recomputes `lead_score` + `score_components`, `contact_qualified`

**`source_boards` — add columns:**
- `daily_cap` int default 75
- `search_queries` text[] (per-board localized queries)
- Seed/upsert ~35 new boards across SRB, ROU, HRV, HUN, BIH, MNE, BGR, POL, AUT, DEU, GRC

**New table `discovery_keywords`:**
- `id`, `kind` ('trade'|'agency_exclude'|'vacancy_phrase'), `lang` text, `keyword` text, `weight` int default 0, `enabled` bool, timestamps
- RLS: team read, admin write
- Seeded with the blue-collar trades + agency keywords + vacancy-count regex phrases per language

**New table `daily_discovery_summary`:**
- `date` (PK), `total_found`, `qualified_count`, `hot_count`, `countries_count`, `breakdown` jsonb

**SQL function `public.compute_lead_score(_lead demand_leads)`:**
- Returns int 0-100 using the rubric: trade match +20, vacancy≥3 +15, freshness 7d +15, website +10, email verified +10, phone valid +10, direct employer +10, primary market (RS/RO/HR/HU) +10
- Also produces `score_components` jsonb

## 2. Edge functions

**`discover-local-jobs` (rewrite):**
- Pull enabled boards from `source_boards` ordered by priority
- For each board: pull `search_queries` (or fallback to defaults), run Firecrawl `/v2/search` with `site:<board_domain>` + query, scrape top N with structured JSON schema requesting: employer_name, role, city, vacancy_count, salary, posted_at, description, email, phone, website
- Detect trade_category via keyword match on title+description
- Detect direct_employer by scanning for agency exclusion keywords (multilingual from `discovery_keywords`)
- Parse vacancy_count from description (regex per language)
- Smart dedup: lookup existing `demand_leads` matching (employer_name_normalized, country, trade_category) within 30d → if found, UPDATE `last_seen_at`, `repost_count++`, refresh `vacancy_count`; else INSERT
- Honor `daily_cap` per board per day
- Strict blue-collar filter — reject if title matches white-collar keywords (developer, manager, analyst, marketing, sales, designer, engineer-software, accountant, lawyer)
- Write `daily_discovery_summary` at end of run

**`enrich-contacts` (update):**
- Hunter.io first (if HUNTER_API_KEY present) → mark email_source='hunter', email_verified=true
- Fallback: pattern guess (info@, hr@, contact@, jobs@, careers@) → email_source='guessed'
- Phone validation: use a lightweight E.164 normalizer for country dial codes (+381 RS, +40 RO, +385 HR, +36 HU, +387 BA, +382 ME, +359 BG, +48 PL, +43 AT, +49 DE, +30 GR, +357 CY, +373 MD, +375 BY, +90 TR). Reject phones <9 digits or wrong country prefix. Store in `phone_e164`.

**`push-lead-to-outreach` (new):**
- Body: { lead_id }
- Validates admin/team role
- Reads `demand_leads` row, inserts into `recruiter_leads` (agency_name, contact_email, contact_phone, operating_eu_country, trades=[trade_category], discovery_tier=2, notes="Pushed from Local Hiring lead {id}")
- Updates `demand_leads.outreach_queued=true`, `outreach_queued_at=now()`
- Returns the new recruiter_lead id

**`daily-discovery-summary` (new, cron 22:00 UTC):**
- Computes today's counts → upserts `daily_discovery_summary`

## 3. Frontend

**`src/pages/LocalHiring.tsx` upgrades:**
- New columns: Score (colored badge), Vacancy, Direct?, Reposts, Trade (colored tag), Posted (relative time via date-fns)
- Toggles: "Hot leads only (≥60)", "Direct employers only", trade multi-select Popover, country multi-select (existing), qualified-only (existing)
- Default sort: `lead_score DESC`
- Summary bar: "{hot} hot leads (≥60) across {countries} countries today · {qualified} qualified · {total} total"
- "Push to Outreach" button per row (visible when score≥60 && !outreach_queued) → calls edge function → toast + grey "Queued" badge
- "Export CSV" button → downloads filtered rows

**`src/pages/DiscoverySettings.tsx` (new, route `/settings/discovery`):**
- Admin-only
- Tabs: Trade keywords | Agency exclusions | Vacancy phrases | Source boards
- Add/remove keywords (per-language)
- Per-country daily cap inputs
- Toggle enabled per board

**Dashboard widget (existing `/` page):**
- Add "Today's Lead Discovery" card reading from `daily_discovery_summary`

**Routing/nav:**
- Add `/settings/discovery` to `App.tsx` and AppLayout sidebar (admin only)

## 4. Secrets
- Request `HUNTER_API_KEY` via `secrets--add_secret` (user already confirmed)

## 5. Verification
- Run migration
- Deploy edge functions
- Manually invoke `discover-local-jobs` against a few seeded boards, confirm `lead_score` populated and dedup behaves
- Invoke `push-lead-to-outreach` on a sample → confirm row appears in recruiter_leads
- Visit `/local-hiring` and `/settings/discovery` to QA the UI

## Out of scope (explicit)
- Real libphonenumber library (using lightweight country-prefix regex to keep edge bundle small; sufficient for the listed countries)
- Notification email/push delivery (only in-app summary card for now)
- White-label CSV templating (basic CSV export only)

## Technical notes
- Trigger uses `SECURITY INVOKER` + `SET search_path = public`
- Score trigger marked `BEFORE INSERT OR UPDATE` so insert path doesn't need application changes
- `outreach_queued` flag prevents double-push; UI disables button after click
- Backfill: one-time UPDATE to recompute `lead_score` on existing demand_leads after migration
