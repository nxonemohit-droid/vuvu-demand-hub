-- Enable trigram extension first (used for fuzzy company name match)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================================================
-- source_registry: catalogue of all data sources
-- =========================================================================
CREATE TABLE public.source_registry (
  id text PRIMARY KEY,
  source_family demand_source NOT NULL,
  display_name text NOT NULL,
  adapter text NOT NULL CHECK (adapter IN ('apify','firecrawl','http')),
  actor_or_endpoint text,
  default_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_tier int NOT NULL CHECK (trust_tier BETWEEN 1 AND 3),
  confidence_weight numeric NOT NULL CHECK (confidence_weight BETWEEN 0 AND 1),
  enabled boolean NOT NULL DEFAULT true,
  schedule_cron text,
  rate_limit_per_hour int NOT NULL DEFAULT 60,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.source_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read source_registry" ON public.source_registry
  FOR SELECT TO anon USING (true);
CREATE POLICY "team read source_registry" ON public.source_registry
  FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "team write source_registry" ON public.source_registry
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "team update source_registry" ON public.source_registry
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "admin delete source_registry" ON public.source_registry
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER source_registry_updated_at
  BEFORE UPDATE ON public.source_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- companies: canonical employer entity
-- =========================================================================
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_domain text UNIQUE,
  linkedin_slug text UNIQUE,
  official_url text,
  careers_url text,
  country text,
  industry text,
  size_bucket text CHECK (size_bucket IN ('micro','sme','mid','large','enterprise')),
  employer_type text NOT NULL DEFAULT 'unknown' CHECK (employer_type IN ('direct','staffing_agency','unknown')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_country ON public.companies(country);
CREATE INDEX idx_companies_name_trgm ON public.companies USING gin (name gin_trgm_ops);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read companies" ON public.companies
  FOR SELECT TO anon USING (true);
CREATE POLICY "team read companies" ON public.companies
  FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "team write companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "team update companies" ON public.companies
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "admin delete companies" ON public.companies
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- normalized_demand: deduped job postings
-- =========================================================================
CREATE TABLE public.normalized_demand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_title text NOT NULL,
  role_normalized text NOT NULL,
  country text NOT NULL,
  city text,
  sector text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  visa_sponsorship boolean,
  posted_at timestamptz,
  expires_at timestamptz,
  fingerprint text NOT NULL UNIQUE,
  seen_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_normdemand_company ON public.normalized_demand(company_id);
CREATE INDEX idx_normdemand_country ON public.normalized_demand(country);
CREATE INDEX idx_normdemand_last_seen ON public.normalized_demand(last_seen_at DESC);
CREATE INDEX idx_normdemand_sector ON public.normalized_demand(sector);

ALTER TABLE public.normalized_demand ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read normalized_demand" ON public.normalized_demand
  FOR SELECT TO anon USING (true);
CREATE POLICY "team read normalized_demand" ON public.normalized_demand
  FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "team write normalized_demand" ON public.normalized_demand
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "team update normalized_demand" ON public.normalized_demand
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "admin delete normalized_demand" ON public.normalized_demand
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER normalized_demand_updated_at
  BEFORE UPDATE ON public.normalized_demand
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- demand_provenance: source contributions
-- =========================================================================
CREATE TABLE public.demand_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_demand_id uuid NOT NULL REFERENCES public.normalized_demand(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES public.source_registry(id) ON DELETE RESTRICT,
  raw_signal_id uuid REFERENCES public.raw_signals(id) ON DELETE SET NULL,
  source_url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_demand_id, source_id, source_url)
);

CREATE INDEX idx_provenance_demand ON public.demand_provenance(normalized_demand_id);
CREATE INDEX idx_provenance_source ON public.demand_provenance(source_id);

ALTER TABLE public.demand_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read demand_provenance" ON public.demand_provenance
  FOR SELECT TO anon USING (true);
CREATE POLICY "team read demand_provenance" ON public.demand_provenance
  FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "team write demand_provenance" ON public.demand_provenance
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "team update demand_provenance" ON public.demand_provenance
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "admin delete demand_provenance" ON public.demand_provenance
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- =========================================================================
-- scrape_run_events: per-job telemetry timeline
-- =========================================================================
CREATE TABLE public.scrape_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_job_id uuid NOT NULL REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error')),
  message text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_runevents_job ON public.scrape_run_events(scrape_job_id);
CREATE INDEX idx_runevents_created ON public.scrape_run_events(created_at DESC);

ALTER TABLE public.scrape_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read scrape_run_events" ON public.scrape_run_events
  FOR SELECT TO anon USING (true);
CREATE POLICY "team read scrape_run_events" ON public.scrape_run_events
  FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "team write scrape_run_events" ON public.scrape_run_events
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "admin delete scrape_run_events" ON public.scrape_run_events
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- =========================================================================
-- raw_signals extensions
-- =========================================================================
ALTER TABLE public.raw_signals
  ADD COLUMN IF NOT EXISTS source_id text REFERENCES public.source_registry(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS seen_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS company_domain text;

CREATE INDEX IF NOT EXISTS idx_rawsignals_unstructured ON public.raw_signals(structured) WHERE structured = false;
CREATE INDEX IF NOT EXISTS idx_rawsignals_source_id ON public.raw_signals(source_id);

-- =========================================================================
-- scrape_jobs extensions
-- =========================================================================
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS source_id text REFERENCES public.source_registry(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_scrapejobs_source_id ON public.scrape_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_scrapejobs_started ON public.scrape_jobs(started_at DESC);

-- =========================================================================
-- demand_leads extensions: scoring + review
-- =========================================================================
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS normalized_demand_id uuid REFERENCES public.normalized_demand(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('A','B','C')),
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_rationale text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'new'
    CHECK (review_status IN ('new','approved','snoozed','rejected')),
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_demandleads_normalized
  ON public.demand_leads(normalized_demand_id) WHERE normalized_demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demandleads_review_status ON public.demand_leads(review_status);
CREATE INDEX IF NOT EXISTS idx_demandleads_tier ON public.demand_leads(tier);
CREATE INDEX IF NOT EXISTS idx_demandleads_score ON public.demand_leads(score DESC);

-- =========================================================================
-- Helper view: company posting frequency (used by scoring layer)
-- =========================================================================
CREATE OR REPLACE VIEW public.company_demand_stats AS
SELECT
  c.id AS company_id,
  c.name,
  c.country,
  COUNT(nd.id) FILTER (WHERE nd.first_seen_at >= now() - interval '30 days') AS posting_count_30d,
  COUNT(nd.id) FILTER (WHERE nd.first_seen_at >= now() - interval '7 days')  AS posting_count_7d,
  MAX(nd.last_seen_at) AS most_recent_posting
FROM public.companies c
LEFT JOIN public.normalized_demand nd ON nd.company_id = c.id
GROUP BY c.id, c.name, c.country;