CREATE TABLE public.lead_contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid,
  channel text NOT NULL DEFAULT 'note',
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_contact_log_lead_id ON public.lead_contact_log(lead_id, created_at DESC);

ALTER TABLE public.lead_contact_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read lead_contact_log" ON public.lead_contact_log
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));

CREATE POLICY "team insert lead_contact_log" ON public.lead_contact_log
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "team update own lead_contact_log" ON public.lead_contact_log
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin delete lead_contact_log" ON public.lead_contact_log
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "public read lead_contact_log" ON public.lead_contact_log
  FOR SELECT TO anon USING (true);