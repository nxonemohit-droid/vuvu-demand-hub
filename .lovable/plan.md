# Personalized Outreach Drip — 893 leads, 200/day, paced sends

## Goal

Queue all 893 demand leads that now have a `contact_email` into the existing send pipeline so Resend delivers max **200 emails/day**, with a **safe time gap between each send**, fully personalized per lead, no bursts, no rate-limit errors.

At 200/day → **~5 business days** to clear the full backlog.

---

## How it will work

### 1. Queue all 893 in one click

Reuse the existing `queue-demand-lead-outreach` edge function and `QueueDemandOutreachCard` button on `/local-hiring`.

- Pulls every `demand_leads` row where `contact_email IS NOT NULL`, not in `email_suppressions`, and not already queued (idempotent — safe to re-click).
- Renders the personalized template per lead (employer, role, country, city, trade — derived fields already in place).
- Inserts one row per lead into `scheduled_emails` with a **staggered `send_at**`.

### 2. Staggering logic (the time gap)

Send window: **08:00–19:00 Europe/Belgrade = 660 minutes/day**.
At 200 sends/day → **1 email every 198 seconds (~3min 18s)**.

The queue function will compute `send_at` per lead:

- Lead #1 → first available slot today (or tomorrow 08:00 if outside window)
- Lead #N → previous `send_at` + 198s
- After 200 sends in a day → roll to next day 08:00 and continue
- 893 leads → spans days 1–5

This guarantees no two sends ever fire closer than ~3 minutes apart, which is well below Resend's per-second/per-minute thresholds.

### 3. Sender (already running)

`process-scheduled-emails` cron picks up due rows and sends via Resend through the Lovable connector gateway. It already enforces:

- Daily cap 200 (`email_send_settings`)
- Per-domain daily cap 25 (Gmail/Outlook safety)
- Send window 08:00–19:00 Belgrade
- Suppression list check before every send
- Bounce/complaint webhook → auto-suppress
- Retry on transient failure (max 3 attempts)

No code changes needed for the sender — it just drains the queue at the pace we wrote into `send_at`.

### 4. Live progress on `/local-hiring`

The existing `QueueDemandOutreachCard` already shows: queued / sent today / pending / bounced / suppressed, refreshed every few seconds.

---

## What I'll change

`**supabase/functions/queue-demand-lead-outreach/index.ts**`

- Replace the current stagger constant with a strict **198s gap** computed from `daily_cap` + send-window length (so it auto-adjusts if you change the cap later).
- Find the **latest `send_at` already in `scheduled_emails**` for `status='pending'` and start the new batch *after* that — prevents collisions if you re-queue or add new leads mid-drip.
- Skip outside-window slots (jump to next day 08:00 Belgrade).
- Return `{ queued, first_send_at, last_send_at, estimated_days }` so the UI can show "Sending Mon 08:00 → Fri 17:42".

`**src/components/outreach/QueueDemandOutreachCard.tsx**`

- Show the estimated send window from the response ("893 emails queued — sending Mon 08:00 to Fri ~17:42").
- Confirm dialog with exact count + window before queuing.

**No DB schema changes, no new cron, no new secrets.**

---

## Safety summary

- 198s between every send → no Resend rate-limit risk
- 200/day hard cap → keeps domain reputation clean while warming up
- Per-domain 25/day cap → no Gmail/Outlook bulk flagging
- Suppression + unsubscribe footer already wired
- Idempotent queue → re-running never duplicates
- Stoppable: setting `status='cancelled'` on pending rows pauses the drip instantly

## Open question

**Sender address** — confirmed `outreach@voynovaglobal.com` previously? Or keep current `RESEND_FROM_EMAIL` value? (Default: keep current.)

Approve and I'll ship it. send today the first batch staright after the que 