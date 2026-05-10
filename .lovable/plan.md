## Goal

Make the Mail page production-ready for bulk outreach: import recipients from CSV, schedule sends for later, view a per-lead email timeline, and send a test email to yourself to verify merge tags.

## 1. CSV import (bulk recipients)

- Add an "Import CSV" button next to the recipients filter on the Mail page.
- Accept a `.csv` file with flexible columns. Auto-detect headers like `email`, `lead_id`, `id`, `agency_name`, `contact_name`. Parse client-side with PapaParse (already a common dep — add if missing).
- Two import modes:
  - **Match by email / lead_id** → tick those rows in the existing recipient table (no new leads created).
  - **Add as ad-hoc recipients** → for emails not in `recruiter_leads`, insert a lightweight row in a new `mail_adhoc_recipients` table so they show up in the table and can be selected, sent to, and tracked.
- Show an import summary dialog: `X matched · Y added · Z skipped (invalid email/duplicate)`.
- Pre-select all imported rows.

## 2. Email scheduling

- Add a "Send now / Schedule for later" toggle in the composer.
- When scheduling, show a date+time picker (defaults to +1 hour, local time).
- Create table `scheduled_emails` (lead_id, to_email, subject, body, send_at, status, created_by, error, sent_at, message_id).
- New edge function `process-scheduled-emails` triggered by `pg_cron` every minute: pulls due rows, calls the existing `send-recruiter-email` flow per row, marks status (`sent` / `failed`), records errors.
- Add a "Scheduled" tab on the Mail page listing upcoming sends with cancel/edit-time actions.

## 3. Per-lead email timeline

- Build a `<LeadTimeline leadId>` component that reads from `email_events` (sent, delivered, opened, clicked, bounced, complained) plus `lead_outreach_log` and `scheduled_emails`, merged and sorted desc.
- Show as a vertical timeline with icon + event type + timestamp + recipient + truncated payload/error.
- Open it from:
  - the Mail page recipient row (new "Timeline" action in the row).
  - the existing preview dialog (new "Timeline" tab next to preview).
  - the Campaign page sent-leads table (replaces the current static delivery badge tooltip).
- Realtime: subscribe to `email_events` for the open lead so new webhook events appear live.

## 4. Send test email

- Add a "Send test" button in the composer header.
- Opens a small popover with an email input, default = current logged-in user's email (`supabase.auth.getUser`).
- Renders subject + body using the **first selected recipient** as the merge-tag source (or a dummy lead with all sample tag values if nothing is selected) so you see exactly what real recipients will get.
- Calls `send-recruiter-email` with `leadId: null` so it doesn't mutate any real lead, and prefixes the subject with `[TEST]`.
- Toast shows the Resend message id on success and the error body on failure.

## Technical notes

- New deps: `papaparse` + `@types/papaparse`.
- New tables (one migration):
  - `mail_adhoc_recipients(id, email, name, agency_name, source, created_by, created_at)` — RLS: team read/write.
  - `scheduled_emails(id, lead_id nullable, to_email, subject, body, send_at, status default 'pending', sent_at, message_id, error, created_by, created_at)` — RLS: team read/write, indexed on `(status, send_at)`.
- New edge function `process-scheduled-emails` (verify_jwt = false) + `pg_cron` job running every minute.
- Tweak `send-recruiter-email` to skip the lead-update / outreach-log writes when `leadId` is null (so test sends and ad-hoc sends don't break).
- Files touched: `src/pages/Mail.tsx`, `src/pages/Campaign.tsx`, new `src/components/LeadTimeline.tsx`, new `src/components/CsvImportDialog.tsx`, new `src/components/SendTestPopover.tsx`, new migration, new edge function, edited `send-recruiter-email`.

## Out of scope

- Recurring/drip campaigns.
- Reply detection / inbox sync (still manual via the existing "Mark replied" button).
- Rich-text/HTML editor (composer stays plain text with merge tags).
