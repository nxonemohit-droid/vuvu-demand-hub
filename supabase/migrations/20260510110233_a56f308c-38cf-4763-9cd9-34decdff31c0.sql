-- 1) SCHEDULED EMAILS
CREATE TABLE public.scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed | cancelled | suppressed
  attempts int NOT NULL DEFAULT 0,
  error text,
  sent_at timestamptz,
  message_id text,
  template_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sched_due ON public.scheduled_emails (status, send_at);
CREATE INDEX idx_sched_lead ON public.scheduled_emails (lead_id);

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read scheduled_emails" ON public.scheduled_emails
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin insert scheduled_emails" ON public.scheduled_emails
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin update scheduled_emails" ON public.scheduled_emails
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin delete scheduled_emails" ON public.scheduled_emails
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER scheduled_emails_set_updated
  BEFORE UPDATE ON public.scheduled_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) EMAIL SUPPRESSIONS (bounces / complaints / unsubscribes / manual)
CREATE TABLE public.email_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL,           -- bounce | complaint | unsubscribe | manual
  source text,                    -- webhook | user
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read suppressions" ON public.email_suppressions
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team insert suppressions" ON public.email_suppressions
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "admin delete suppressions" ON public.email_suppressions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- 3) SENDING SETTINGS (single row, daily caps + send window)
CREATE TABLE public.email_send_settings (
  id int PRIMARY KEY DEFAULT 1,
  daily_cap int NOT NULL DEFAULT 200,
  per_domain_daily_cap int NOT NULL DEFAULT 25,
  send_window_start_hour int NOT NULL DEFAULT 8,   -- inclusive, local time
  send_window_end_hour int NOT NULL DEFAULT 19,    -- exclusive
  send_window_timezone text NOT NULL DEFAULT 'Europe/Belgrade',
  respect_send_window boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT only_one_row CHECK (id = 1)
);
INSERT INTO public.email_send_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.email_send_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read send_settings" ON public.email_send_settings
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin update send_settings" ON public.email_send_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- 4) Helper view: today's sent count (UTC bucket — good enough for cap checks)
CREATE OR REPLACE VIEW public.email_sent_today AS
SELECT
  count(*) AS sent_today,
  count(*) FILTER (WHERE created_at >= now() - interval '1 hour') AS sent_last_hour
FROM public.lead_outreach_log
WHERE channel = 'email' AND created_at::date = (now() AT TIME ZONE 'UTC')::date;

-- 5) Enable extensions for cron (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;