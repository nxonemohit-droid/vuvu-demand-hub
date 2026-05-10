ALTER TABLE public.recruiter_leads ADD COLUMN IF NOT EXISTS discovery_tier smallint;
CREATE INDEX IF NOT EXISTS recruiter_leads_discovery_tier_idx ON public.recruiter_leads (discovery_tier);