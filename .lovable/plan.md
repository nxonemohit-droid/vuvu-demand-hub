# Plan: Personalized outreach to 422 demand leads

## Goal
Send one personalized email per demand lead that has a `contact_email` (422 recipients), embedding links to:
- https://voynovaglobal.com (main site)
- https://voy-nova-profiles.live/company-profile (company profile)

Throughput controlled by the existing send queue + per-domain caps (no spam, no bulk blasts).

## Approach

### 1. New email template (demand-lead outreach)
Add `voynova_demand_outreach` template to `email_templates` table with merge tokens:
- `{{contact_name}}` → falls back to "Hiring Manager"
- `{{employer_name}}` → falls back to "your company"
- `{{role}}` → e.g. "welders", "drivers"
- `{{country}}`, `{{city}}`
- `{{trade_category}}`

Subject: `Skilled {{role}} for {{employer_name}} — vetted workers, fast deployment`

Body (plain text + light HTML, B1–B2 English):
- Personal opener referencing employer, role, country
- 3 short bullet points: vetted South Asian workforce, full compliance/visa handling, 7–14 day deployment
- Clear CTAs:
  - "Visit Voynova" → https://voynovaglobal.com
  - "View our company profile" → https://voy-nova-profiles.live/company-profile
- Signature with Voynova brand + reply-to
- System-managed unsubscribe footer (auto-appended)

Stored once in `email_templates`; reused for all 422 sends.

### 2. New edge function: `queue-demand-lead-outreach`
Admin-only function that:
1. Selects all `demand_leads` where:
   - `contact_email IS NOT NULL`
   - email not in `email_suppressions`
   - no prior row in `scheduled_emails` for this `lead_id` + template (idempotent)
2. Renders the template per lead (server-side merge with the lead's fields)
3. Inserts one row per lead into `scheduled_emails` with:
   - `to_email`, `subject`, `body`, `lead_id`, `template_name='voynova_demand_outreach'`
   - `send_at` = staggered timestamp respecting the send window
4. Returns `{ queued, skipped_suppressed, skipped_duplicate }`

### 3. Reuse existing sender
The already-deployed `process-scheduled-emails` cron picks up rows from `scheduled_emails` and:
- Respects `email_send_settings` (daily cap 200, per-domain cap 25, send window 08:00–19:00 Europe/Belgrade)
- Logs to `lead_outreach_log` + `email_events`
- Handles bounces/suppression via existing webhook

At 200/day cap, 422 emails finish in ~3 business days. Per-domain cap of 25 prevents Gmail/Outlook throttling.

### 4. UI on `/local-hiring` (or new `/outreach` panel)
Add a single admin button: **"Queue all contactable demand leads (422)"**
- Confirmation dialog showing exact count + estimated send window
- Calls `queue-demand-lead-outreach`
- Toast with result: "Queued 422 emails — sending begins next cron cycle"

Also show a live progress card:
- Total queued / sent today / pending / bounced / suppressed
- Reads from `scheduled_emails` + `email_events`

### 5. Safety + compliance
- Send window enforced (no nights/weekends)
- Per-domain cap prevents bulk-to-Gmail flagging
- Suppression list honored
- Unsubscribe footer auto-appended by sender
- Idempotency: re-running the queue function never duplicates

## Technical details

**New files**
- `supabase/functions/queue-demand-lead-outreach/index.ts` (admin JWT check, batch insert into `scheduled_emails`)
- `src/components/outreach/QueueDemandOutreachCard.tsx` (button + confirm + progress)

**Edits**
- `src/pages/LocalHiring.tsx` — mount the new card at the top
- `email_templates` — insert one row via data tool (not migration)

**No schema changes required** — reuses `scheduled_emails`, `email_send_settings`, `email_suppressions`, `lead_outreach_log`, `email_events`.

**Stagger logic**
- 200/day cap → spread across send window (11 hours = 660 min)
- ~3.3 min between sends → `send_at = base + (i * 198 seconds)` rolling into next day after 200
- Per-domain cap enforced by existing sender, not at queue time

**Email render**
Server-side string replace on `{{token}}`. All values escaped. Links are static (no user-controlled URLs).

## Open question
Confirm sender address: should it be `outreach@voynovaglobal.com`, `hello@voynovaglobal.com`, or current `RESEND_FROM_EMAIL` secret value? (Default: use existing `RESEND_FROM_EMAIL`.)

## Out of scope (ask before adding)
- Follow-up sequences (2nd/3rd touch)
- Reply detection / auto-pause on reply
- Multilingual templates (currently English only)
- A/B subject testing
