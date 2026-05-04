CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','bd','viewer')
  )
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_team_member(uuid) TO authenticated;

ALTER POLICY "admin delete candidates" ON public.candidates USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read candidates" ON public.candidates USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update candidates" ON public.candidates USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write candidates" ON public.candidates WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete companies" ON public.companies USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read companies" ON public.companies USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update companies" ON public.companies USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write companies" ON public.companies WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete leads" ON public.demand_leads USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read leads" ON public.demand_leads USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update leads" ON public.demand_leads USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write leads" ON public.demand_leads WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete matches" ON public.demand_matches USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read matches" ON public.demand_matches USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write matches" ON public.demand_matches WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete demand_provenance" ON public.demand_provenance USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read demand_provenance" ON public.demand_provenance USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update demand_provenance" ON public.demand_provenance USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write demand_provenance" ON public.demand_provenance WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete firecrawl_jobs" ON public.firecrawl_jobs USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read firecrawl_jobs" ON public.firecrawl_jobs USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update firecrawl_jobs" ON public.firecrawl_jobs USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write firecrawl_jobs" ON public.firecrawl_jobs WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete lead_blacklist" ON public.lead_blacklist USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team insert lead_blacklist" ON public.lead_blacklist WITH CHECK (private.is_team_member(auth.uid()));
ALTER POLICY "team read lead_blacklist" ON public.lead_blacklist USING (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete lead_contact_log" ON public.lead_contact_log USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team insert lead_contact_log" ON public.lead_contact_log WITH CHECK (private.is_team_member(auth.uid()));
ALTER POLICY "team read lead_contact_log" ON public.lead_contact_log USING (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete lead_crm" ON public.lead_crm USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team insert lead_crm" ON public.lead_crm WITH CHECK (private.is_team_member(auth.uid()));
ALTER POLICY "team read lead_crm" ON public.lead_crm USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update lead_crm" ON public.lead_crm USING (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete lead_outreach_log" ON public.lead_outreach_log USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team insert lead_outreach_log" ON public.lead_outreach_log WITH CHECK (private.is_team_member(auth.uid()));
ALTER POLICY "team read lead_outreach_log" ON public.lead_outreach_log USING (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete normalized_demand" ON public.normalized_demand USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read normalized_demand" ON public.normalized_demand USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update normalized_demand" ON public.normalized_demand USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write normalized_demand" ON public.normalized_demand WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "team can view profiles" ON public.profiles USING (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete raw_signals" ON public.raw_signals USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read raw_signals" ON public.raw_signals USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update raw_signals" ON public.raw_signals USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write raw_signals" ON public.raw_signals WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete scrape_jobs" ON public.scrape_jobs USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read scrape_jobs" ON public.scrape_jobs USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update scrape_jobs" ON public.scrape_jobs USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write scrape_jobs" ON public.scrape_jobs WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete scrape_run_events" ON public.scrape_run_events USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read scrape_run_events" ON public.scrape_run_events USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write scrape_run_events" ON public.scrape_run_events WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admin delete source_registry" ON public.source_registry USING (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team read source_registry" ON public.source_registry USING (private.is_team_member(auth.uid()));
ALTER POLICY "team update source_registry" ON public.source_registry USING (private.is_team_member(auth.uid()));
ALTER POLICY "team write source_registry" ON public.source_registry WITH CHECK (private.is_team_member(auth.uid()));

ALTER POLICY "admins manage roles" ON public.user_roles USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "team can read roles" ON public.user_roles USING (private.is_team_member(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;