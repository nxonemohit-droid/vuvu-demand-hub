ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS profile_summary text,
  ADD COLUMN IF NOT EXISTS programs text,
  ADD COLUMN IF NOT EXISTS trades text,
  ADD COLUMN IF NOT EXISTS workforce_size text,
  ADD COLUMN IF NOT EXISTS intake_info text,
  ADD COLUMN IF NOT EXISTS draft_subject text,
  ADD COLUMN IF NOT EXISTS draft_body text,
  ADD COLUMN IF NOT EXISTS drafted_at timestamptz;

CREATE INDEX IF NOT EXISTS vl_leads_drafted_at_idx ON public.leads (drafted_at);