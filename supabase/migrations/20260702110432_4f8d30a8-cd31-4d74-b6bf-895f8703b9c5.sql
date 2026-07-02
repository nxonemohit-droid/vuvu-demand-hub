
-- Enums
DO $$ BEGIN
  CREATE TYPE public.hm_lead_type AS ENUM ('institute','consultancy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hm_lead_status AS ENUM ('new','enriched','queued','sent','replied','admitted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hm_admission_stage AS ENUM ('lead','interested','docs_sent','application','offer','visa','admitted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hm_source AS ENUM ('gcse','firecrawl','apify','hunter','manual','csv');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. hm_leads
CREATE TABLE IF NOT EXISTS public.hm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.hm_lead_type NOT NULL,
  name text NOT NULL,
  website text,
  country text NOT NULL DEFAULT 'India',
  region text,
  state text,
  city text,
  contact_name text,
  contact_role text,
  email text,
  phone text,
  linkedin text,
  students_meta jsonb DEFAULT '{}'::jsonb,
  source public.hm_source NOT NULL DEFAULT 'manual',
  source_url text,
  dedup_hash text UNIQUE,
  status public.hm_lead_status NOT NULL DEFAULT 'new',
  admission_stage public.hm_admission_stage NOT NULL DEFAULT 'lead',
  score int DEFAULT 0,
  notes text,
  tags text[] DEFAULT '{}',
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hm_leads TO authenticated;
GRANT ALL ON public.hm_leads TO service_role;
ALTER TABLE public.hm_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hm_leads team read" ON public.hm_leads FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "hm_leads team write" ON public.hm_leads FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_leads team update" ON public.hm_leads FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_leads admin delete" ON public.hm_leads FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS hm_leads_type_idx ON public.hm_leads(type);
CREATE INDEX IF NOT EXISTS hm_leads_region_idx ON public.hm_leads(region);
CREATE INDEX IF NOT EXISTS hm_leads_stage_idx ON public.hm_leads(admission_stage);
CREATE INDEX IF NOT EXISTS hm_leads_status_idx ON public.hm_leads(status);
CREATE INDEX IF NOT EXISTS hm_leads_email_idx ON public.hm_leads(email);

CREATE TRIGGER hm_leads_updated_at BEFORE UPDATE ON public.hm_leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. hm_campaigns
CREATE TABLE IF NOT EXISTS public.hm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_1_subject text,
  template_1_body text,
  template_2_subject text,
  template_2_body text,
  template_3_subject text,
  template_3_body text,
  daily_cap int NOT NULL DEFAULT 50,
  gap_seconds int NOT NULL DEFAULT 90,
  send_window_start_hour int NOT NULL DEFAULT 9,
  send_window_end_hour int NOT NULL DEFAULT 18,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  skip_weekends boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft', -- draft|scheduled|running|paused|completed
  total_queued int DEFAULT 0,
  total_sent int DEFAULT 0,
  total_failed int DEFAULT 0,
  total_replied int DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hm_campaigns TO authenticated;
GRANT ALL ON public.hm_campaigns TO service_role;
ALTER TABLE public.hm_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hm_campaigns team read" ON public.hm_campaigns FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "hm_campaigns team write" ON public.hm_campaigns FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_campaigns team update" ON public.hm_campaigns FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_campaigns admin delete" ON public.hm_campaigns FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER hm_campaigns_updated_at BEFORE UPDATE ON public.hm_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. hm_campaign_sends
CREATE TABLE IF NOT EXISTS public.hm_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.hm_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.hm_leads(id) ON DELETE CASCADE,
  template_variant int NOT NULL CHECK (template_variant IN (1,2,3)),
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending', -- pending|sending|sent|failed|skipped|replied
  personalized_subject text,
  personalized_body text,
  to_email text NOT NULL,
  resend_message_id text,
  error text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, lead_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hm_campaign_sends TO authenticated;
GRANT ALL ON public.hm_campaign_sends TO service_role;
ALTER TABLE public.hm_campaign_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hm_sends team read" ON public.hm_campaign_sends FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "hm_sends team write" ON public.hm_campaign_sends FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_sends team update" ON public.hm_campaign_sends FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_sends admin delete" ON public.hm_campaign_sends FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS hm_sends_scheduled_idx ON public.hm_campaign_sends(scheduled_for) WHERE status='pending';
CREATE INDEX IF NOT EXISTS hm_sends_campaign_idx ON public.hm_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS hm_sends_status_idx ON public.hm_campaign_sends(status);

CREATE TRIGGER hm_sends_updated_at BEFORE UPDATE ON public.hm_campaign_sends
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. hm_scrape_jobs
CREATE TABLE IF NOT EXISTS public.hm_scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL, -- discover|enrich|apify
  provider text NOT NULL, -- gcse|firecrawl|apify|hunter
  bucket public.hm_lead_type,
  regions text[] DEFAULT '{}',
  keywords text[] DEFAULT '{}',
  input_url text,
  status text NOT NULL DEFAULT 'queued', -- queued|running|completed|failed
  urls_found int DEFAULT 0,
  leads_created int DEFAULT 0,
  cost_estimate_usd numeric DEFAULT 0,
  error text,
  meta jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hm_scrape_jobs TO authenticated;
GRANT ALL ON public.hm_scrape_jobs TO service_role;
ALTER TABLE public.hm_scrape_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hm_jobs team read" ON public.hm_scrape_jobs FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "hm_jobs team write" ON public.hm_scrape_jobs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_jobs team update" ON public.hm_scrape_jobs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "hm_jobs admin delete" ON public.hm_scrape_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS hm_jobs_status_idx ON public.hm_scrape_jobs(status);

CREATE TRIGGER hm_jobs_updated_at BEFORE UPDATE ON public.hm_scrape_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
