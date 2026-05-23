
DROP VIEW IF EXISTS public.qualified_local_leads;
CREATE VIEW public.qualified_local_leads
  WITH (security_invoker = true) AS
SELECT dl.*
FROM public.demand_leads dl
WHERE dl.contact_qualified = true
  AND dl.discovered_board_domain IS NOT NULL;
