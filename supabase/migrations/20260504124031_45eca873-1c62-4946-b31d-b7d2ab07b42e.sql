ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS sponsorship_signals text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_demand_leads_sponsorship_signals
  ON public.demand_leads USING gin (sponsorship_signals);

CREATE INDEX IF NOT EXISTS idx_demand_leads_sector_tags
  ON public.demand_leads USING gin (sector_tags);

CREATE INDEX IF NOT EXISTS idx_demand_leads_worker_origin_focus
  ON public.demand_leads USING gin (worker_origin_focus);