# Changelog

## 2026-06-02 — Outreach UI + Pending Mails health, schema fields, diagnostics

### Mail / Outreach
- Recipients tab now filters to outreach-eligible leads (has valid email or LinkedIn, not suppressed, bounced, or unsubscribed).
- Status pill column now derives a single status from: New · Queued · Sent · Replied · Bounced · Snoozed · Suppressed · Unsubscribed.
- Filter dropdown: Eligible (default) / Queued / Sent / Replied / Bounced / All.
- Pending Mails tab replaces the old Scheduled tab. Splits rows into Drafts / Scheduled / Awaiting enrichment / Blocked + Failed, with a derived `blocking_reason` per row.
- Bulk actions: Enrich now · Reschedule · Discard. (Reassign sender disabled — single mailbox.)
- Health banner with counts of blocked-by-enrichment, sender-cap, unresolved-template-vars, provider-error, plus one-click "Resolve all auto-fixable" that enriches missing-email leads and discards permanently-broken rows.

### Enrichment
- `enrich-email` now accepts `lead_ids` for targeted bulk enrichment, writes `last_enrichment_at` and `last_enrichment_error` on every attempt, and caches per-domain candidate lists for the duration of a single invocation.
- `hunter-enrich` supports a soft `HUNTER_MONTHLY_CAP` env-var spend guard (returns 429 once exceeded).
- Per-lead enrichment status surfaced on the Leads tab status pill tooltip.

### Candidates
- Empty-state banner clearly explains why reverse matching returns zero.
- `match-candidates` returns `candidate_count` + a `note` when the table is empty.
- Matcher loosened: case-insensitive substring on role, skill overlap with sector tags / trades / role, threshold dropped from 40 → 30.

### Schema (one migration)
- `scheduled_emails`: `blocking_reason`, `blocked_at`, `(status, send_at)` index.
- `recruiter_leads`: `normalized_domain`, `role_classification`, `confidence`, `last_signal_at`, `company_id`, `last_enrichment_error`, `last_enrichment_at`.
- `demand_leads`: `normalized_domain`, `role_classification`, `confidence`, `last_signal_at` (company_id already existed).
- Foreign keys: `recruiter_leads.company_id → companies.id ON DELETE SET NULL`, `demand_leads.company_id → companies.id ON DELETE SET NULL`.
- Backfilled `normalized_domain` from website / source_url / email domain, and `last_signal_at` from most recent timestamp.
- All new columns inherit existing team-member RLS on their respective tables; no new tables, no new policies.
- `scheduled_emails.lead_id` deliberately not foreign-keyed because it can reference either `recruiter_leads` or `demand_leads`.

### New page
- `/admin/diagnostics` (admin-only): pipeline counts (raw signals, demand, recruiters, candidates), mail queue depth, failure rates over 24h, last finished run per source.

### Deferred (not in this pass)
- Full sequence engine: per-mailbox daily/hourly caps, warmup, recipient-country timezone-aware send windows, weekend skip, reply-stop.
- Recruiters / HR Managers / Companies dedicated tabs.