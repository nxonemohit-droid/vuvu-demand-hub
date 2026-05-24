-- 1. Add WhatsApp fields to demand_leads
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_source text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS whatsapp_enriched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_enrich_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_last_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_queued boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_demand_leads_whatsapp_number ON public.demand_leads(whatsapp_number) WHERE whatsapp_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demand_leads_whatsapp_enrich ON public.demand_leads(whatsapp_enriched, whatsapp_enrich_attempts);

-- 2. WhatsApp outreach queue
CREATE TABLE IF NOT EXISTS public.whatsapp_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  to_number text NOT NULL,              -- digits only, no +
  display_number text NOT NULL,         -- +XX... pretty
  message text NOT NULL,
  wa_link text NOT NULL,
  queue_date date NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued | sent | skipped | failed
  sent_at timestamptz,
  opened_at timestamptz,
  template_name text NOT NULL DEFAULT 'voynova_demand_whatsapp',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_outreach_lead_template_unique UNIQUE (lead_id, template_name)
);

CREATE INDEX IF NOT EXISTS idx_wa_outreach_queue_date_status ON public.whatsapp_outreach(queue_date, status);
CREATE INDEX IF NOT EXISTS idx_wa_outreach_status ON public.whatsapp_outreach(status);
CREATE INDEX IF NOT EXISTS idx_wa_outreach_lead ON public.whatsapp_outreach(lead_id);

ALTER TABLE public.whatsapp_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read whatsapp_outreach"
  ON public.whatsapp_outreach FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "admin insert whatsapp_outreach"
  ON public.whatsapp_outreach FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin update whatsapp_outreach"
  ON public.whatsapp_outreach FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin delete whatsapp_outreach"
  ON public.whatsapp_outreach FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_wa_outreach_updated_at
  BEFORE UPDATE ON public.whatsapp_outreach
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Settings
CREATE TABLE IF NOT EXISTS public.whatsapp_send_settings (
  id integer PRIMARY KEY DEFAULT 1,
  daily_cap integer NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_send_settings_single CHECK (id = 1)
);

INSERT INTO public.whatsapp_send_settings (id, daily_cap) VALUES (1, 50)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_send_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read whatsapp_send_settings"
  ON public.whatsapp_send_settings FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "admin update whatsapp_send_settings"
  ON public.whatsapp_send_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));