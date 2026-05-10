ALTER TABLE public.recruiter_leads
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_status text;

CREATE INDEX IF NOT EXISTS idx_recruiter_leads_email_status
  ON public.recruiter_leads (email_status, replied_at, converted_at);