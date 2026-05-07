## Scope verification

I checked the database before planning. A few key findings drive the plan:

**Schema realities:**
- `scrape_jobs` already has an `error` column (text). DiscoveryRuns.tsx already renders it via an `ErrorTooltip`. Task 1 is mostly polish (truncation length, copy button, row border).
- `quality_score` already exists on **`demand_leads`** (added in the previous turn) with a trigger and backfill. The Leads page reads from `demand_leads`, not `raw_signals`. Task 2's spec says to add it to `raw_signals` — but the UI portion of Task 2 (badge, filter, sort on the Leads page) operates on `demand_leads` rows. **I'll mirror the same column + trigger onto `raw_signals` as requested, and reuse the existing `demand_leads.quality_score` for the UI** so we don't double-store or rewrite the Leads query pipeline.
- `archived_leads` does not exist. Will create it.
- `raw_signals` columns: `id, job_id, source, source_url, source_id, raw_text, payload, fingerprint, structured, created_at, last_seen_at, seen_count, company_domain` — no `employer_name`/`role`/`contact_*` columns; those live in `payload` JSON or in `demand_leads`. So `compute_quality_score` for `raw_signals` must read from `payload` keys.
- I searched `src/` and `supabase/functions/` for `.delete()` calls on `raw_signals` — there are **none** today. Task 3's "replace hard-deletes with soft-archive" therefore creates the table + helper now, and we wire it in when/if a delete UI is added.

## Task 1 — Failed-run error UX (DiscoveryRuns.tsx)

- Replace `ErrorTooltip` with: truncated text (120 chars) + `ClipboardCopy` icon button. Tooltip max-w 400px, `whitespace-pre-wrap`. Click copies full error, `toast.success("Copied!")`.
- Add a `getRowBorderClass(status)` helper applied to each `<TableRow>`:
  - `succeeded`/`succeeded_empty` → `border-l-4 border-green-500`
  - `failed`/`quota_exceeded` → `border-l-4 border-red-500`
  - `running` → `border-l-4 border-yellow-400`
  - else → no border.

## Task 2 — Quality score

**DB migration** (additive only — does not touch existing `demand_leads.quality_score`):
- `ALTER TABLE raw_signals ADD COLUMN IF NOT EXISTS quality_score integer NOT NULL DEFAULT 0;`
- New SQL function `compute_raw_signal_quality_score(_payload jsonb, _source text)` returning int. Reads payload keys: `employer_name`/`employer`/`company`, `email`/`contact_email`, `phone`/`contact_phone`, `role`/`title`/`job_title`, `website`/`company_website`/`url`. Scoring rules per spec, capped 0–100.
- New trigger function `raw_signals_set_quality_score()` → `BEFORE INSERT OR UPDATE OF payload, source ON raw_signals`.
- Backfill: `UPDATE raw_signals SET quality_score = compute_raw_signal_quality_score(payload, source::text);`
- Index `idx_raw_signals_quality_score` on `quality_score DESC`.

**UI on Leads page** (uses existing `demand_leads.quality_score`):
- Add `quality_score` to the SELECT in `load()`.
- Add badge component `QualityBadge`: 70+ green ★, 40-69 yellow ◑, 0-39 red ✕. Render in card + table views.
- Add "Min Score" number input to the filter bar; default 0; filters list client-side.
- Add `quality_score` as a sortable column header in the table view (asc/desc toggle).

## Task 3 — Soft archive

**DB migration:**
```
CREATE TABLE public.archived_leads (
  id uuid PK default gen_random_uuid(),
  original_id uuid,
  archived_at timestamptz default now(),
  archived_reason text check (archived_reason in
    ('missing_contact','duplicate','low_quality','wrong_trade','manual')),
  archived_by text default 'system',
  payload jsonb
);
```
RLS enabled; team SELECT/INSERT policies (matching existing project pattern using `private.is_team_member`); admin DELETE.

**Helper SQL function** `archive_and_delete_raw_signal(_id uuid, _reason text, _by text)` that copies the row to `archived_leads` then deletes it — single call, atomic.

**Code wiring:** since no delete-on-raw_signals call sites exist yet, I won't invent UI. The helper is ready for the future quality-gate (score < 40) auto-archive job and any upcoming bulk-delete buttons. I'll note this in the migration comment.

## Files touched

- `supabase/migrations/<new>.sql` — raw_signals.quality_score + trigger + backfill, archived_leads table + RLS + helper fn.
- `src/pages/DiscoveryRuns.tsx` — copy button, tooltip styling, row border colors.
- `src/pages/Leads.tsx` — select quality_score, QualityBadge in card/table, Min Score filter, sortable column.

## Open question

Task 2 explicitly says `ALTER TABLE raw_signals`, but Task 3's "future quality gate auto-archiving (score < 40)" implies the score that gates archiving lives where deletes happen — on `raw_signals`. The previous turn already added the same column to `demand_leads`. **I'm proceeding with: add to `raw_signals` (per spec) AND keep the existing `demand_leads.quality_score` for the Leads UI.** If you'd rather I drop one of them, say which.
