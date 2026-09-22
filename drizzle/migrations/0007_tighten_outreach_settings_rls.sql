DROP POLICY IF EXISTS "Team can read outreach settings" ON public.outreach_settings;
DROP POLICY IF EXISTS "Team can insert outreach settings" ON public.outreach_settings;
DROP POLICY IF EXISTS "Team can update outreach settings" ON public.outreach_settings;

CREATE POLICY "Team can read outreach settings"
  ON public.outreach_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd'));

CREATE POLICY "Team can insert outreach settings"
  ON public.outreach_settings FOR INSERT TO authenticated
  WITH CHECK (id = 1 AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd')));

CREATE POLICY "Team can update outreach settings"
  ON public.outreach_settings FOR UPDATE TO authenticated
  USING (id = 1 AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd')))
  WITH CHECK (id = 1 AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bd')));
