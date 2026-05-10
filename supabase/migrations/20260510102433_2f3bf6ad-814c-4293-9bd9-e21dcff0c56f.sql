CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  subject text NOT NULL,
  body text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read email_templates" ON public.email_templates
  FOR SELECT TO authenticated USING (private.is_team_member(auth.uid()));

CREATE POLICY "team insert email_templates" ON public.email_templates
  FOR INSERT TO authenticated WITH CHECK (private.is_team_member(auth.uid()));

CREATE POLICY "team update email_templates" ON public.email_templates
  FOR UPDATE TO authenticated USING (private.is_team_member(auth.uid()));

CREATE POLICY "admin delete email_templates" ON public.email_templates
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_email_events_lead_created ON public.email_events (lead_id, created_at DESC);

-- Seed a couple of starter templates
INSERT INTO public.email_templates (name, subject, body, description) VALUES
('Default outreach',
 'Vetted {{trades}} from Nepal / India / Bangladesh — ready for {{country}}',
 'Hi {{first_name}},

I''m reaching out from Voynova Global Solutions. We supply pre-screened, document-ready blue-collar workers ({{trades}}) from Nepal, India and Bangladesh to employers and licensed agencies across Europe.

I noticed {{agency_name}} is active in {{country}}. We currently have candidates ready for deployment with full medicals, police clearance and EU-recognised trade certificates — and we operate strictly on no-advance / employer-paid terms.

Would you be open to a 15-minute call this week to align on your active orders?

Best regards,
Mohit
Voynova Global Solutions
mohit@voynovaglobal.com',
 'Standard first-touch outreach to recruitment agencies'),
('Short follow-up',
 'Following up — {{trades}} candidates for {{agency_name}}',
 'Hi {{first_name}},

Just floating my note above to the top of your inbox. Happy to send 3–5 sample profiles relevant to your active orders in {{country}} — no obligation.

Would Tuesday or Thursday work for a quick call?

Best,
Mohit
Voynova Global Solutions',
 'Polite 3-5 day follow-up')
ON CONFLICT (name) DO NOTHING;