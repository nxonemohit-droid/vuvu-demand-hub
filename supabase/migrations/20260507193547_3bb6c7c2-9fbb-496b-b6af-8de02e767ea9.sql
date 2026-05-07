
REVOKE EXECUTE ON FUNCTION public.archive_and_delete_demand_lead(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.archive_low_quality_demand_leads(int, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_archived_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_and_delete_demand_lead(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_low_quality_demand_leads(int, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_archived_lead(uuid) TO authenticated;
