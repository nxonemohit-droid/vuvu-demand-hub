## Scope (this pass)

Two of the four slices you approved, plus the candidates matcher debug. Single shared sender mailbox stays as-is (per-mailbox caps map to the existing global daily cap + per-domain cap in `email_send_settings`).

Out of scope this pass: full per-mailbox sequence engine, warmup, timezone-aware send windows, recruiters/HR-managers/companies tab rebuild, sequence-engine "weekend skip + reply-stop".

## Important finding (will surface in UI)

- `candidates` table has **0 rows**. `match-candidates` is not broken in logic — it has nothing to compare against. I will (a) tighten the matcher (current exact-role match is too strict; switch to case-insensitive substring + skill/trade overlap) and (b) show a clear empty-state on Candidates and in the matcher response. The ">0 matches against 3780 leads" criterion cannot be met until you seed candidate rows.
- "Pending Mails" lives in `scheduled_emails` today (20 pending, 4 failed with "Invalid recipient"). I will NOT create a parallel `pending_mail` table.

## What ships

### 1. Mail · Compose tab — eligibility & status pills

- Recipient query filters to **outreach-eligible**: `status='active'`, has valid email OR LinkedIn, email not in `email_suppressions`, `email_status NOT IN ('bounced','complained','unsubscribed')`, not already `sent` within the active sequence window.
- Status column shows a single pill from: **New · Queued · Sent · Replied · Bounced · Snoozed** derived from `recruiter_leads.email_status`, `replied_at`, suppressions, and the presence of a pending `scheduled_emails` row.
- Filter dropdown options: Eligible (default) · Queued · Sent · Replied · Bounced · All.

### 2. Mail · Pending Mails tab (replaces today's "Scheduled" tab)

New three-section table built on `scheduled_emails`:

- **Drafts** — `status='pending'` AND (`send_at` is null OR `send_at <= now()`).
- **Scheduled** — `status='pending'` AND `send_at > now()`.
- **Awaiting enrichment** — pending rows whose `to_email` is missing/invalid OR whose joined lead has `email_source='missing'`.
- **Blocked / Failed** — `status='failed'` plus the computed `blocking_reason`.

Computed `blocking_reason` per row (client-side derivation, also persisted via the migration column added in slice 2):

- `missing_email` · `missing_first_name` · `unresolved_template_var` (scans subject/body for unrendered `{{…}}`) · `over_daily_cap` (count of today's `sent` ≥ `email_send_settings.daily_cap`) · `suppressed` · `bounced` · `provider_error: <text>`.

Bulk actions on selected rows:

- **Enrich now** → invokes `enrich-email` (bulk mode) for the linked recruiter leads, then re-queries.
- **Reassign sender** → disabled with a tooltip ("single mailbox — change in Settings → Email"). Kept in UI for future.
- **Reschedule** → datetime picker → bulk `UPDATE send_at, status='pending', error=null`.
- **Discard** → bulk `UPDATE status='cancelled', error='discarded by user'`.

### 3. Pending Mails health banner

Above the table:

```text
Awaiting enrichment: 7   Sender cap: 0   Unresolved vars: 3   Provider error: 1
[ Resolve all auto-fixable ]
```

"Resolve all auto-fixable":
- For `missing_email` rows → invoke `enrich-email` bulk for those leads.
- For `unresolved_template_var` rows that resolve once the lead is re-fetched → re-render and update.
- For permanently broken rows (no lead, no email, lead deleted) → discard.

### 4. Enrichment write-back polish

- `enrich-email` already writes `contact_email`, `email_enriched`, `email_source`. Add: write `last_enrichment_error` and `last_enrichment_at` on failure rather than silently moving on, and a small in-memory domain→best-candidate cache per invocation. Resend's monthly cost cap is a no-op here (Hunter is the paid hop) — I'll add a soft `HUNTER_MONTHLY_CAP` env-var guard inside `hunter-enrich`.
- Per-lead enrichment status & last error surfaced on the Leads tab status pill tooltip and on `LeadDetail`.

### 5. Migrations (slice 2)

Single migration, idempotent:

- `scheduled_emails`: add `blocking_reason text`, `blocked_at timestamptz`, index on `(status, send_at)`.
- `recruiter_leads`: add `normalized_domain text`, `role_classification text`, `confidence numeric`, `last_signal_at timestamptz`, `company_id uuid`, `last_enrichment_error text`, `last_enrichment_at timestamptz`.
- `demand_leads`: add `normalized_domain text`, `role_classification text`, `confidence numeric`, `last_signal_at timestamptz` (company_id already exists).
- Backfill `normalized_domain` from `source_url`/`website`/`contact_email` via a one-time `UPDATE`.
- Add FK `recruiter_leads.company_id → companies.id ON DELETE SET NULL`, `demand_leads.company_id → companies.id ON DELETE SET NULL`. (No `pending_mail` table; `scheduled_emails.lead_id` is heterogeneous — recruiter OR demand — so no FK there to avoid breaking inserts.)
- RLS: new columns inherit the existing team-member policies on each table. No new policies needed. Verified all touched tables already have `is_team_member` SELECT/INSERT/UPDATE coverage.

### 6. /admin/diagnostics page

New route `/admin/diagnostics`, admin-gated. Single-page dashboard:

- **Pipeline counts**: raw_signals (total / structured / unstructured), demand_leads by `review_status`, recruiter_leads by `status`, candidates total.
- **Last run per source**: max(`finished_at`) per `source_boards.id` and per `scrape_jobs.source`.
- **Error rates (last 24h)**: scrape_jobs failed/total, scheduled_emails failed/sent, hunter-enrich attempts (from `recruiter_leads.last_enrichment_error` non-null in 24h).
- **Queue depths**: pending scheduled_emails, awaiting-enrichment count, WhatsApp pending today.

### 7. Candidates matcher fix

- `match-candidates/index.ts`: case-insensitive substring matching on role, OR overlap between candidate `skills` and lead trades. Threshold lowered to 30. Returns `{ ok, matched, candidate_count }` and surfaces a `note: "no candidates in database"` when zero.
- Candidates page: empty-state banner with a one-click "Run reverse-matching" button (disabled when candidates=0, with explanation).

### 8. CHANGELOG + Security memory

- New `CHANGELOG.md` entry dated 2026-05-31 listing the above.
- Append to security-memory: confirmation that new columns inherit existing RLS (no new findings expected) and that `scheduled_emails.lead_id` deliberately has no FK because it points to either `recruiter_leads` or `demand_leads`.

## File map

```text
NEW
  src/pages/Diagnostics.tsx
  src/components/outreach/PendingMailsPanel.tsx
  src/components/outreach/PendingMailsHealthBanner.tsx
  src/lib/outreach-status.ts          // status pill + blocking_reason derivation
  CHANGELOG.md
  supabase/migrations/<ts>_outreach_pending_and_pipeline.sql

EDIT
  src/App.tsx                          // add /admin/diagnostics route
  src/components/AppLayout.tsx         // add nav link (admin-only)
  src/pages/Mail.tsx                   // eligibility query, status pills, new tab
  src/pages/Candidates.tsx             // empty-state + matcher trigger
  src/pages/LeadDetail.tsx             // surface last_enrichment_error
  supabase/functions/enrich-email/index.ts        // write-back error + at
  supabase/functions/hunter-enrich/index.ts       // soft monthly cap guard
  supabase/functions/match-candidates/index.ts    // looser matching + candidate_count
```

## Acceptance against your original list

| Criterion | Status this pass |
|---|---|
| Leads tab shows only outreach-eligible | ✅ |
| Status pills New/Queued/Sent/Replied/Bounced/Snoozed | ✅ |
| Pending Mails split with blocking reason + bulk actions | ✅ (Reassign sender disabled — single mailbox) |
| Enrich emails flow: retries + cost cap + cache + write-back + per-lead status | ✅ (retries already in send path; soft Hunter cap added; per-invocation cache; write-back error+at) |
| Sequence engine: timezone, per-mailbox caps, weekend, reply-stop | ❌ deferred (separate pass) |
| Fix Queued-with-no-scheduled_at | ✅ surfaced as "Drafts" and rescheduleable |
| Pending Mails health banner + Resolve all auto-fixable | ✅ |
| New columns/indexes + backfill | ✅ |
| FKs recruiter/lead → company | ✅ (scheduled_emails.lead_id deliberately not FK'd — heterogeneous) |
| RLS mirroring demand_leads | ✅ inherited |
| /admin/diagnostics | ✅ |
| Recruiters / HR Managers / Companies tabs populated | ❌ deferred |
| Candidates reverse-matching > 0 results | ⚠️ matcher tightened, but blocked by 0 candidates in DB |
| CHANGELOG + security-memory updated | ✅ |
| All in one commit | ✅ |
