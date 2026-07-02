
-- OTHM leads: students, colleges, agencies, consultants for OTHM certificate outreach
CREATE TABLE public.othm_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL DEFAULT 'student' CHECK (entity_type IN ('student','college','agency','consultant')),
  full_name TEXT,
  institution_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  linkedin_url TEXT,
  website TEXT,
  country TEXT,
  city TEXT,
  course_level TEXT CHECK (course_level IS NULL OR course_level IN ('L3','L4','L5','L6','L7')),
  intake_month TEXT CHECK (intake_month IS NULL OR intake_month IN ('Jan','May','Sep')),
  preferred_country TEXT,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','interested','enrolled','rejected')),
  source TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  outreach_queued BOOLEAN NOT NULL DEFAULT false,
  quality_score INT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.othm_leads TO authenticated;
GRANT ALL ON public.othm_leads TO service_role;

ALTER TABLE public.othm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view othm leads"
  ON public.othm_leads FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can insert othm leads"
  ON public.othm_leads FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can update othm leads"
  ON public.othm_leads FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Admins can delete othm leads"
  ON public.othm_leads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_othm_leads_entity_type ON public.othm_leads(entity_type);
CREATE INDEX idx_othm_leads_stage ON public.othm_leads(stage);
CREATE INDEX idx_othm_leads_country ON public.othm_leads(country);
CREATE INDEX idx_othm_leads_email ON public.othm_leads(lower(email));

CREATE TRIGGER trg_othm_leads_updated_at
  BEFORE UPDATE ON public.othm_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend campaign tables to support the new lead_source and store othm_lead_id
ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_lead_source_check;

ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_lead_source_check
  CHECK (lead_source IN ('recruiter','demand','othm'));

ALTER TABLE public.campaign_emails
  ADD COLUMN IF NOT EXISTS othm_lead_id UUID REFERENCES public.othm_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_emails_othm_lead_id ON public.campaign_emails(othm_lead_id);
