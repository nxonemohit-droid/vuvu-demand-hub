-- Allow public (anon) read access to discovery data so the dashboard works without sign-in.
-- Writes/updates/deletes remain restricted to team members.

CREATE POLICY "public read demand_leads"
ON public.demand_leads FOR SELECT
TO anon
USING (true);

CREATE POLICY "public read scrape_jobs"
ON public.scrape_jobs FOR SELECT
TO anon
USING (true);

CREATE POLICY "public read raw_signals"
ON public.raw_signals FOR SELECT
TO anon
USING (true);

CREATE POLICY "public read candidates"
ON public.candidates FOR SELECT
TO anon
USING (true);
