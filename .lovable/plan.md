## Current state (verified against the database)

- `demand_leads`: **1,012 rows total**
  - 737 with `quality_score < 40`
  - 822 with **no email AND no phone**
  - 923 with no phone, 828 with no email
  - Only 2 with no employer at all
- Infrastructure already in place from prior turns:
  - `compute_quality_score(employer, role, email, phone)` + trigger on `demand_leads`
  - `archived_leads` table + `archive_and_delete_raw_signal()` helper (raw_signals only)
  - `qualityTier()` UI badge + Min-quality filter on the Leads page

So the cleanup is essentially: apply the existing quality gate to `demand_leads` and route the losers to `archived_leads` instead of hard-deleting.

---

## Part A — Clean up "leads with no information"

### A1. Define the gate
Use the existing `quality_score` (already computed by trigger):
- **Archive** any `demand_leads` row where `quality_score < 40` **AND** (no email AND no phone). This protects employer-only or role-only signals that may still be valuable.
- Threshold and rule are admin-configurable via the cleanup dialog (default 40 / require-no-contact = on).

### A2. Soft-archive, never hard-delete
Extend the existing soft-archive pattern from `raw_signals` to `demand_leads`:

- New SQL helper `archive_and_delete_demand_lead(_id uuid, _reason text, _by text)`:
  1. `INSERT INTO archived_leads (original_id, archived_reason, archived_by, payload) SELECT id, _reason, _by, to_jsonb(dl.*) FROM demand_leads dl WHERE id = _id`
  2. `DELETE FROM demand_leads WHERE id = _id`
  Atomic, `SECURITY DEFINER`, admin-only via RLS check inside the function.
- Bulk variant `archive_low_quality_demand_leads(_min_score int, _require_no_contact bool, _by text) RETURNS int` returning the count archived.

### A3. UI: "Clean up low-quality leads" action (admin only)
On `src/pages/Leads.tsx`, add a destructive button next to the existing filter bar:
- Opens a confirm dialog showing: threshold input (default 40), "also require missing email & phone" toggle (default on), and a **live preview count** (client-side filter of already-loaded rows + a quick `head: count` Supabase query for accuracy).
- On confirm, call the bulk RPC, toast `Archived N leads`, refresh list.
- Single-row archive button on each card / detail page using `archive_and_delete_demand_lead`.
- All archive actions write to `lead_contact_log` so we have an audit trail.

### A4. Restore path
Small `/archived` route (admin-only) listing `archived_leads` with a "Restore" button that re-inserts the JSONB payload back into `demand_leads` and removes the archive row.

---

## Part B — Increase lead quality going forward

The cleanup is a one-shot fix. Quality has to be improved **upstream** so we don't refill the bucket with junk next week.

### B1. Quality at ingestion (block junk before it lands)
In `supabase/functions/structure-leads` (and any other writer into `demand_leads`):
- Compute `quality_score` in the edge function before insert.
- If score `< 25` → write straight to `archived_leads` with reason `low_quality_at_ingest` instead of `demand_leads`.
- If `25 ≤ score < 40` → insert into `demand_leads` but mark `review_status = 'needs_enrichment'` (new enum value) so the UI can surface them in a separate queue.
- Score `≥ 40` → normal insert.

### B2. Stronger scoring signals
Extend `compute_quality_score` (additive, backwards-compatible):
- `+10` if employer has a resolvable website domain (`raw_signals.company_domain` not null).
- `+10` if `country` and `city` both present.
- `+10` if `source` is in a trusted set (`linkedin`, `indeed`, `bebity`).
- `+5` if `salary_min` or `demand_size` is populated.
- Cap at 100. Re-backfill via UPDATE after migration.

### B3. Auto-enrichment pass (cheap wins first)
Nightly cron edge function `enrich-low-quality-leads`:
1. Pick `demand_leads` where `quality_score BETWEEN 25 AND 60` and `last_enriched_at IS NULL OR > 7d`.
2. If employer has a website → run a Firecrawl single-page scrape of `/contact` / `/about` to extract email + phone (regex), populate `contact_email` / `contact_phone`.
3. If still no email and we have an employer + domain → call existing `hunter-enrich` function.
4. Trigger re-scores the row automatically.

Add a `last_enriched_at timestamptz` and `enrichment_attempts int` column to `demand_leads` so we don't loop on the same dead-end leads.

### B4. Source-quality feedback loop
- New view `source_quality_stats` aggregating, per `source`: total leads, % `quality_score ≥ 40`, % archived, avg score over last 30 days.
- Surface on `ActorHealth.tsx` as a "Source quality" panel.
- Auto-action: if a source's 30-day "% archived" exceeds 70%, flip `source_registry.enabled = false` and log a `scrape_run_event` so the team can review before re-enabling.

### B5. Dedupe hardening
Today `dedupeAndEnrich` runs client-side. Promote it to the DB:
- Add a generated column `dedupe_fingerprint` on `demand_leads` = lower(employer_name) || '|' || lower(role) || '|' || country.
- Unique partial index where `dedupe_fingerprint IS NOT NULL`.
- `structure-leads` does an `ON CONFLICT (dedupe_fingerprint) DO UPDATE` that bumps `seen_count` and merges contact fields (COALESCE) — this naturally upgrades a low-quality lead when a richer duplicate arrives instead of creating a second junk row.

### B6. Discovery-time keyword tightening
The discovery prompts/keywords feeding Firecrawl/Apify are the root cause of garbage. Add to `KeywordAudit.tsx`:
- Per-keyword "yield" metric = leads with `quality_score ≥ 40` / total leads produced.
- Sort keywords by yield ascending; flag bottom-quartile for review or removal.

---

## Technical details

### Migrations
1. `archive_and_delete_demand_lead(uuid, text, text)` + `archive_low_quality_demand_leads(int, bool, text)`.
2. Extend `compute_quality_score` with the new signals; re-run backfill `UPDATE demand_leads SET quality_score = compute_quality_score(...)`.
3. `ALTER TABLE demand_leads ADD COLUMN last_enriched_at timestamptz, ADD COLUMN enrichment_attempts int NOT NULL DEFAULT 0`.
4. `dedupe_fingerprint` generated column + partial unique index.
5. `source_quality_stats` view.
6. New enum value `'needs_enrichment'` for `review_status` (it's a text column today — just a CHECK / constant).

### Edge functions
- New: `enrich-low-quality-leads` (cron, daily 03:00 UTC).
- Modify: `structure-leads` (compute score before insert, route by tier, ON CONFLICT merge).

### Frontend
- `Leads.tsx`: Clean-up dialog, single-row archive button, "Needs enrichment" tab/filter.
- New `ArchivedLeads.tsx` page + nav entry (admin only).
- `ActorHealth.tsx`: Source quality panel.
- `KeywordAudit.tsx`: Yield column.

---

## Open questions before I start

1. **Cleanup gate** — go with `quality_score < 40 AND no email AND no phone` (strict, ~600 leads), or just `quality_score < 40` (737 leads)?
2. **Auto-archive at ingest threshold** — is `< 25` the right cutoff for hard rejection, or do you want everything below 40 to be reviewable?
3. **Scope of this build** — implement everything (A + B), or land Part A (cleanup + soft-archive UI) first and Part B (upstream quality) in a follow-up?
