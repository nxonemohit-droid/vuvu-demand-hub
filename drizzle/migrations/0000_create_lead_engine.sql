-- ============ Voynova Lead Engine core schema ============

CREATE TYPE public.lead_kind AS ENUM ('employer', 'education');
CREATE TYPE public.lead_stage AS ENUM ('new', 'contacted', 'replied', 'interested', 'deal', 'rejected');
CREATE TYPE public.outreach_channel AS ENUM ('email', 'whatsapp');

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.lead_kind NOT NULL DEFAULT 'employer',
  company text NOT NULL,
  website text,
  country text NOT NULL,
  city text,
  sector text,
  role text,
  contact_name text,
  contact_role text,
  email text,
  phone text,
  whatsapp text,
  linkedin text,
  hiring_signal text,
  program_type text,
  visa_speed text,
  visa_fit_score integer NOT NULL DEFAULT 0,
  stage public.lead_stage NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'gcse',
  source_url text,
  dedup_hash text UNIQUE,
  notes text,
  enriched boolean NOT NULL DEFAULT false,
  enrich_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads team read" ON public.leads FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
CREATE POLICY "leads write" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "leads update" ON public.leads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "leads delete" ON public.leads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX vl_leads_country ON public.leads(country);
CREATE INDEX vl_leads_stage ON public.leads(stage);
CREATE INDEX vl_leads_kind ON public.leads(kind);
CREATE INDEX vl_leads_email ON public.leads(email) WHERE email IS NOT NULL;
CREATE INDEX vl_leads_created ON public.leads(created_at DESC);

CREATE TRIGGER vl_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- outreach queue ----------
CREATE TABLE public.outreach_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel public.outreach_channel NOT NULL,
  to_address text NOT NULL,
  subject text,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_sends TO authenticated;
GRANT ALL ON public.outreach_sends TO service_role;
ALTER TABLE public.outreach_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sends team read" ON public.outreach_sends FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
CREATE POLICY "sends write" ON public.outreach_sends FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "sends update" ON public.outreach_sends FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "sends delete" ON public.outreach_sends FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX vl_sends_pending ON public.outreach_sends(status, scheduled_for);
CREATE INDEX vl_sends_lead ON public.outreach_sends(lead_id);
CREATE UNIQUE INDEX vl_sends_unique_channel ON public.outreach_sends(lead_id, channel);

CREATE TRIGGER vl_sends_updated_at BEFORE UPDATE ON public.outreach_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- discovery jobs ----------
CREATE TABLE public.find_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.lead_kind NOT NULL DEFAULT 'employer',
  countries text[] NOT NULL DEFAULT '{}',
  sectors text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running',
  urls_found integer NOT NULL DEFAULT 0,
  leads_created integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.find_jobs TO authenticated;
GRANT ALL ON public.find_jobs TO service_role;
ALTER TABLE public.find_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs team read" ON public.find_jobs FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
CREATE POLICY "jobs write" ON public.find_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "jobs update" ON public.find_jobs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));
CREATE POLICY "jobs delete" ON public.find_jobs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER vl_find_jobs_updated_at BEFORE UPDATE ON public.find_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();