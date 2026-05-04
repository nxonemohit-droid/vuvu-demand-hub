-- Add new job_status enum values
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'quota_exceeded';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'succeeded_empty';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'skipped_quota';

-- Provider quota state (singleton-ish, keyed by provider name)
CREATE TABLE IF NOT EXISTS public.provider_quota_state (
  provider text PRIMARY KEY,
  monthly_usage_usd numeric,
  monthly_limit_usd numeric,
  usage_pct numeric,
  cycle_start_at timestamptz,
  cycle_end_at timestamptz,
  exhausted_at timestamptz,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_quota_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read provider_quota_state"
  ON public.provider_quota_state FOR SELECT TO authenticated
  USING (private.is_team_member(auth.uid()));

CREATE POLICY "admin write provider_quota_state"
  ON public.provider_quota_state FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin update provider_quota_state"
  ON public.provider_quota_state FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin delete provider_quota_state"
  ON public.provider_quota_state FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Seed apify row
INSERT INTO public.provider_quota_state (provider) VALUES ('apify')
ON CONFLICT (provider) DO NOTHING;
