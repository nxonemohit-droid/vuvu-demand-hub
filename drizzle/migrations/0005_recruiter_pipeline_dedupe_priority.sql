ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'qualified';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'meeting_booked';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'partner_onboarded';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS partner_type text,
  ADD COLUMN IF NOT EXISTS supply_capacity text,
  ADD COLUMN IF NOT EXISTS priority_score integer,
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE INDEX IF NOT EXISTS vl_leads_priority_score_idx ON public.leads (priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS vl_leads_merged_into_idx ON public.leads (merged_into) WHERE merged_into IS NOT NULL;
CREATE INDEX IF NOT EXISTS vl_leads_dedupe_key_idx ON public.leads (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS vl_leads_partner_type_idx ON public.leads (partner_type) WHERE partner_type IS NOT NULL;