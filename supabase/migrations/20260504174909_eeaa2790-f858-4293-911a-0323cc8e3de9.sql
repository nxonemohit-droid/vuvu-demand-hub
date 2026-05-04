CREATE TABLE public.lead_outreach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid,
  channel text NOT NULL DEFAULT 'email',
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_outreach_log_lead ON public.lead_outreach_log(lead_id, created_at DESC);
CREATE INDEX idx_lead_outreach_log_recent ON public.lead_outreach_log(created_at DESC);
ALTER TABLE public.lead_outreach_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read lead_outreach_log" ON public.lead_outreach_log FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "public read lead_outreach_log" ON public.lead_outreach_log FOR SELECT TO anon USING (true);
CREATE POLICY "team insert lead_outreach_log" ON public.lead_outreach_log FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "user update own lead_outreach_log" ON public.lead_outreach_log FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin delete lead_outreach_log" ON public.lead_outreach_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.lead_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read lead_blacklist" ON public.lead_blacklist FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "public read lead_blacklist" ON public.lead_blacklist FOR SELECT TO anon USING (true);
CREATE POLICY "team insert lead_blacklist" ON public.lead_blacklist FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "admin delete lead_blacklist" ON public.lead_blacklist FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));