ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_leads;
ALTER TABLE public.demand_leads REPLICA IDENTITY FULL;