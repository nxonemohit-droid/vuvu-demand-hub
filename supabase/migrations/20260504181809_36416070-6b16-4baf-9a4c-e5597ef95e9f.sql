-- Remove public anon read policies on sensitive tables
DROP POLICY IF EXISTS "public read demand_leads" ON public.demand_leads;
DROP POLICY IF EXISTS "public read candidates" ON public.candidates;
DROP POLICY IF EXISTS "public read raw_signals" ON public.raw_signals;
DROP POLICY IF EXISTS "public read scrape_jobs" ON public.scrape_jobs;
DROP POLICY IF EXISTS "public read firecrawl_jobs" ON public.firecrawl_jobs;
DROP POLICY IF EXISTS "public read scrape_run_events" ON public.scrape_run_events;
DROP POLICY IF EXISTS "public read source_registry" ON public.source_registry;

-- Also remove other anon read policies on related tables for consistency
DROP POLICY IF EXISTS "public read companies" ON public.companies;
DROP POLICY IF EXISTS "public read demand_provenance" ON public.demand_provenance;
DROP POLICY IF EXISTS "public read normalized_demand" ON public.normalized_demand;
DROP POLICY IF EXISTS "public read lead_crm" ON public.lead_crm;
DROP POLICY IF EXISTS "public read lead_contact_log" ON public.lead_contact_log;
DROP POLICY IF EXISTS "public read lead_outreach_log" ON public.lead_outreach_log;
DROP POLICY IF EXISTS "public read lead_blacklist" ON public.lead_blacklist;

-- Add INSERT policy for profiles so authenticated users can create their own profile
CREATE POLICY "users insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);