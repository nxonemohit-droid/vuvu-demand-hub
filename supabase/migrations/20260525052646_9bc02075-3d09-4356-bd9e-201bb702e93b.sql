
DROP POLICY IF EXISTS "team can read discovery stats" ON public.discovery_query_stats;
CREATE POLICY "team can read discovery stats"
ON public.discovery_query_stats
FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_source_spend(text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_low_quality_demand_leads(integer, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_archived_lead(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_and_delete_demand_lead(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_and_delete_raw_signal(uuid, text, text) FROM anon, authenticated;
