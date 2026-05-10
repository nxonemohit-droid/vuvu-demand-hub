ALTER TABLE public.recruiter_leads
  ADD COLUMN IF NOT EXISTS worker_collar text;
CREATE INDEX IF NOT EXISTS recruiter_leads_worker_collar_idx
  ON public.recruiter_leads (worker_collar);