-- Per-run cost (filled in by adapter once Apify reports it)
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS cost_usd numeric;

-- Per-source priority, budget, smart caps, running spend
ALTER TABLE public.source_registry
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS monthly_budget_usd numeric,
  ADD COLUMN IF NOT EXISTS monthly_spend_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spend_cycle_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  ADD COLUMN IF NOT EXISTS max_items_per_run integer NOT NULL DEFAULT 30;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS scrape_jobs_dedup_idx
  ON public.scrape_jobs (source_id, country, keyword, status, started_at DESC);
CREATE INDEX IF NOT EXISTS scrape_jobs_cost_idx
  ON public.scrape_jobs (started_at DESC) WHERE cost_usd IS NOT NULL;
