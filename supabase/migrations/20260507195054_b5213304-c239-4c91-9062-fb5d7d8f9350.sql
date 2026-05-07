
-- Recruitment model tag enum
DO $$ BEGIN
  CREATE TYPE public.recruitment_model_tag AS ENUM (
    'no_advance_after_visa',
    'no_advance_after_deployment',
    'free_recruitment',
    'company_recruitment',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.recruiter_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name text NOT NULL,
  hq_country text,
  hq_city text,
  operating_eu_country text,
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_linkedin text,
  recruitment_model public.recruitment_model_tag[] NOT NULL DEFAULT '{}',
  license_number text,
  license_verified boolean NOT NULL DEFAULT false,
  active_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  worker_origin_focus text[] NOT NULL DEFAULT '{}',
  trades text[] NOT NULL DEFAULT '{}',
  source_url text,
  source_posted_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw_signal_id uuid,
  excluded_reason text,
  status text NOT NULL DEFAULT 'active',
  quality_score int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recruiter_leads_unique_agency
  ON public.recruiter_leads (lower(agency_name), coalesce(hq_country,''));
CREATE INDEX IF NOT EXISTS recruiter_leads_hq_country_idx ON public.recruiter_leads (hq_country);
CREATE INDEX IF NOT EXISTS recruiter_leads_last_seen_idx ON public.recruiter_leads (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS recruiter_leads_status_idx ON public.recruiter_leads (status);
CREATE INDEX IF NOT EXISTS recruiter_leads_model_gin ON public.recruiter_leads USING gin (recruitment_model);
CREATE INDEX IF NOT EXISTS recruiter_leads_origin_gin ON public.recruiter_leads USING gin (worker_origin_focus);

ALTER TABLE public.recruiter_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read recruiter_leads" ON public.recruiter_leads
  FOR SELECT TO authenticated USING (private.is_team_member(auth.uid()));
CREATE POLICY "team write recruiter_leads" ON public.recruiter_leads
  FOR INSERT TO authenticated WITH CHECK (private.is_team_member(auth.uid()));
CREATE POLICY "team update recruiter_leads" ON public.recruiter_leads
  FOR UPDATE TO authenticated USING (private.is_team_member(auth.uid()));
CREATE POLICY "admin delete recruiter_leads" ON public.recruiter_leads
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER recruiter_leads_set_updated_at
  BEFORE UPDATE ON public.recruiter_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- quality scoring
CREATE OR REPLACE FUNCTION public.compute_recruiter_quality_score(_lead public.recruiter_leads)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  s int := 0;
  has_allowed boolean := false;
  m public.recruitment_model_tag;
  allowed public.recruitment_model_tag[] := ARRAY[
    'no_advance_after_visa','no_advance_after_deployment',
    'free_recruitment','company_recruitment'
  ]::public.recruitment_model_tag[];
BEGIN
  IF _lead.contact_email IS NOT NULL AND position('@' in _lead.contact_email) > 0 THEN s := s + 20; END IF;
  IF _lead.contact_phone IS NOT NULL AND btrim(_lead.contact_phone) <> '' THEN s := s + 10; END IF;
  IF _lead.contact_linkedin IS NOT NULL AND btrim(_lead.contact_linkedin) <> '' THEN s := s + 5; END IF;
  IF _lead.license_number IS NOT NULL AND btrim(_lead.license_number) <> '' THEN s := s + 10; END IF;
  IF _lead.license_verified THEN s := s + 15; END IF;
  IF jsonb_array_length(coalesce(_lead.active_orders,'[]'::jsonb)) > 0 THEN s := s + 15; END IF;
  IF array_length(_lead.worker_origin_focus,1) > 0 THEN s := s + 10; END IF;
  FOREACH m IN ARRAY _lead.recruitment_model LOOP
    IF m = ANY(allowed) THEN has_allowed := true; END IF;
  END LOOP;
  IF has_allowed THEN s := s + 15; END IF;
  IF s > 100 THEN s := 100; END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.recruiter_leads_set_quality_score()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.quality_score := public.compute_recruiter_quality_score(NEW);
  RETURN NEW;
END $$;

CREATE TRIGGER recruiter_leads_score_trg
  BEFORE INSERT OR UPDATE ON public.recruiter_leads
  FOR EACH ROW EXECUTE FUNCTION public.recruiter_leads_set_quality_score();
