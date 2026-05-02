-- firecrawl_jobs: track async Firecrawl operations
CREATE TABLE public.firecrawl_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firecrawl_job_id TEXT UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('scrape','map','crawl','search','batch_scrape')),
  target_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  page_count INTEGER NOT NULL DEFAULT 0,
  pages_persisted INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER,
  scrape_job_id UUID REFERENCES public.scrape_jobs(id) ON DELETE SET NULL,
  source_id TEXT REFERENCES public.source_registry(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_firecrawl_jobs_status ON public.firecrawl_jobs(status);
CREATE INDEX idx_firecrawl_jobs_firecrawl_id ON public.firecrawl_jobs(firecrawl_job_id);
CREATE INDEX idx_firecrawl_jobs_company ON public.firecrawl_jobs(company_id);
CREATE INDEX idx_firecrawl_jobs_started ON public.firecrawl_jobs(started_at DESC);

ALTER TABLE public.firecrawl_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read firecrawl_jobs" ON public.firecrawl_jobs
  FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "public read firecrawl_jobs" ON public.firecrawl_jobs
  FOR SELECT TO anon USING (true);
CREATE POLICY "team write firecrawl_jobs" ON public.firecrawl_jobs
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "team update firecrawl_jobs" ON public.firecrawl_jobs
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "admin delete firecrawl_jobs" ON public.firecrawl_jobs
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER firecrawl_jobs_updated_at
  BEFORE UPDATE ON public.firecrawl_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- companies: recrawl scheduling
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS recrawl_interval_hours INTEGER NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crawl_priority INTEGER NOT NULL DEFAULT 3 CHECK (crawl_priority BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS discovery_source TEXT;

CREATE INDEX IF NOT EXISTS idx_companies_next_crawl
  ON public.companies(crawl_priority, last_crawled_at NULLS FIRST)
  WHERE careers_url IS NOT NULL OR official_url IS NOT NULL;

-- scrape_jobs: link company-driven crawls
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS parent_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_parent_company ON public.scrape_jobs(parent_company_id);