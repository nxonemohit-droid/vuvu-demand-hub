
-- Sequence engine: caps, warmup, weekend skip, country-aware windows, auto-unblock
ALTER TABLE public.email_send_settings
  ADD COLUMN IF NOT EXISTS hourly_cap integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_daily_increment integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS warmup_initial_cap integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS skip_weekends boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_unblock_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS country_window_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reply_stop_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.scheduled_emails
  ADD COLUMN IF NOT EXISTS recipient_country text,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS unblocked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_pending_send_at
  ON public.scheduled_emails (status, send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_blocked
  ON public.scheduled_emails (status, blocked_at)
  WHERE status = 'failed' OR blocking_reason IS NOT NULL;
