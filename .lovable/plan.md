## What this delivers

1. Remove every recruiter lead with no email AND no phone AND no LinkedIn.
2. Group the rest into 3 priority blocks based on contact channels available.
3. Auto-schedule outreach for all 3 blocks at 50 emails/day in priority order.
4. Tighten the discovery pipeline so only blue-collar recruiters/companies are surfaced.

---

## 1. Hard-delete no-contact leads

A new admin-only edge function `recruiter-cleanup` will:
- Delete every `recruiter_leads` row where `contact_email`, `contact_phone`, AND `contact_linkedin` are all empty/null.
- Return the deleted count.
- Triggered by a "Clean up no-contact leads" button in the Recruiters page header (admin only), with a confirmation dialog.

## 2. Three priority blocks

Definitions (per your answer):

| Block | Criteria | Priority |
|-------|----------|----------|
| Block 1 | Email + Phone + LinkedIn | Highest |
| Block 2 | Email + exactly one of (Phone OR LinkedIn) | Medium |
| Block 3 | Email only | Lowest |

A new memoized "Outreach blocks" panel on the Recruiters page shows each block's count, with-email validity, and a one-click "Schedule outreach for this block" button. Filters to view leads in each block are also added.

## 3. Auto-schedule at 50/day (this batch only)

- Global `email_send_settings.daily_cap` stays at 200 (untouched).
- A new edge function `recruiter-schedule-outreach` will:
  - Take an optional template selection (defaults to most recent template).
  - Build the lead list in priority order: Block 1 → Block 2 → Block 3.
  - Skip leads already in `scheduled_emails` (pending/sent), already suppressed, or with invalid emails.
  - Render subject + body per lead using template variables (agency_name, contact_name, hq_country, etc.).
  - Insert into `scheduled_emails` with `send_at` staggered: 50 rows scheduled for today's send window start, next 50 for tomorrow, etc., respecting the configured send window timezone (`Europe/Belgrade` 08:00–19:00).
  - Distribute the 50/day evenly across the send window.
- The existing `process-scheduled-emails` cron (already running) will pick them up — no change needed there.
- UI surface:
  - "Schedule 50/day outreach" button on the new Outreach blocks panel.
  - Confirmation dialog showing: total leads to schedule, days needed (ceil(total/50)), template preview.
  - Toast on completion: "Scheduled X emails across Y days".

## 4. Blue-collar-only discovery filter

Two layers (per your answer — both query exclusions and LLM gate):

**A. Query-level exclusions** in `recruiter-discover/index.ts`:
- Append a shared block of negative terms to every Tier 0–6 query:
  `-software -developer -engineer -"IT recruitment" -finance -accounting -marketing -"sales executive" -doctor -nurse -lawyer -teacher -designer -"white collar" -"office staff" -"executive search" -"head hunter" -SaaS -fintech -consulting`
- (Trades list stays as-is — already blue-collar.)

**B. LLM extractor gate** in the JSON schema sent to Firecrawl scrape:
- Add `worker_collar` field to `RECRUITER_SCHEMA` with enum `["blue", "white", "mixed", "unknown"]` and a description anchoring to manual labour, trades, factory, hospitality, drivers, construction, etc.
- In `processOne`, after `is_recruiter` check, also reject when `worker_collar === "white"`. Allow `blue`, `mixed`, `unknown` (keep loose to avoid false negatives).
- Persist `worker_collar` into `recruiter_leads` as a new column so the UI can filter/badge it.

**C. Schema change**:
- New column `recruiter_leads.worker_collar text` (nullable), indexed.
- Recruiters page: new filter dropdown (`All / Blue-collar / Mixed / Unknown`) defaulting to "Blue-collar + Mixed + Unknown" (i.e., hide white).

---

## Technical details

**Database migration**
```sql
ALTER TABLE public.recruiter_leads
  ADD COLUMN IF NOT EXISTS worker_collar text;
CREATE INDEX IF NOT EXISTS recruiter_leads_worker_collar_idx
  ON public.recruiter_leads (worker_collar);
```

**New edge functions** (CORS-enabled, service-role, admin-only via JWT check):
- `recruiter-cleanup` — POST, deletes no-contact leads, returns `{deleted}`.
- `recruiter-schedule-outreach` — POST `{templateId?, dailyCap?:50}`, returns `{scheduled, days}`.

**Edge function edits**
- `recruiter-discover/index.ts`:
  - Add `EXCLUDE_WHITE_COLLAR` constant; append to every query string in `buildQueries`.
  - Extend `RECRUITER_SCHEMA` with `worker_collar` enum.
  - Reject `worker_collar === "white"` in `processOne`.
  - Persist `worker_collar: extracted.worker_collar ?? null` on insert (preserve on update).

**Frontend (`src/pages/Recruiters.tsx`)**
- New `outreachBlocks` useMemo computing the 3 buckets.
- New "Outreach blocks" Card panel with counts + per-block Schedule button.
- "Clean up no-contact leads" admin button (with confirm dialog).
- "Schedule 50/day outreach" master button → calls `recruiter-schedule-outreach` with the full prioritized list.
- New worker-collar filter dropdown.
- Refresh `rows` after each action.

**No changes needed to**
- `process-scheduled-emails` (already enforces daily_cap, send window, per-domain cap).
- `email_send_settings` (global cap stays at 200; scheduling itself caps at 50/day).
- Any other discovery providers.

---

## Out of scope (flag for later if you want)

- Retroactively re-classifying existing leads as blue/white. New runs only — existing rows get `worker_collar = null` and remain visible under "Unknown".
- Drip/follow-up sequences. Each lead gets exactly one outreach email in this batch.
- Per-domain cap tuning (stays at 25/day per domain).
