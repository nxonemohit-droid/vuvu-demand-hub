
ALTER TABLE public.recruiter_leads
  ADD COLUMN IF NOT EXISTS resend_message_id text,
  ADD COLUMN IF NOT EXISTS email_delivery_status text,
  ADD COLUMN IF NOT EXISTS email_delivery_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_last_event text;

CREATE INDEX IF NOT EXISTS idx_recruiter_leads_resend_message_id
  ON public.recruiter_leads(resend_message_id);

CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  lead_id uuid,
  event_type text NOT NULL,
  recipient text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_message_id ON public.email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_lead_id ON public.email_events(lead_id);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read email_events"
  ON public.email_events FOR SELECT TO authenticated
  USING (private.is_team_member(auth.uid()));

CREATE POLICY "team insert email_events"
  ON public.email_events FOR INSERT TO authenticated
  WITH CHECK (private.is_team_member(auth.uid()));
