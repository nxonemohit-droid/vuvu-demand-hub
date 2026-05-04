CREATE TYPE public.lead_crm_status AS ENUM ('new','contacted','in_progress','converted','rejected');

CREATE TABLE public.lead_crm (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL UNIQUE,
  status public.lead_crm_status NOT NULL DEFAULT 'new',
  notes TEXT,
  bookmarked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_crm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read lead_crm"
  ON public.lead_crm FOR SELECT TO anon USING (true);

CREATE POLICY "team read lead_crm"
  ON public.lead_crm FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "team insert lead_crm"
  ON public.lead_crm FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "team update lead_crm"
  ON public.lead_crm FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "admin delete lead_crm"
  ON public.lead_crm FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_lead_crm_updated_at
  BEFORE UPDATE ON public.lead_crm
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_lead_crm_bookmarked ON public.lead_crm(bookmarked) WHERE bookmarked = true;
CREATE INDEX idx_lead_crm_status ON public.lead_crm(status);