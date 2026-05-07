
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_demand_leads_quality_score
  ON public.demand_leads (quality_score);

CREATE INDEX IF NOT EXISTS idx_demand_leads_enrichment
  ON public.demand_leads (last_enriched_at NULLS FIRST, quality_score);

-- Source-quality summary (last 30 days)
CREATE OR REPLACE VIEW public.source_quality_stats
WITH (security_invoker = true)
AS
SELECT
  source::text AS source,
  COUNT(*) AS total_leads,
  ROUND(AVG(quality_score)::numeric, 1) AS avg_quality,
  COUNT(*) FILTER (WHERE quality_score >= 40) AS good_leads,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE quality_score >= 40) / NULLIF(COUNT(*), 0),
    1
  ) AS good_pct
FROM public.demand_leads
WHERE created_at > now() - interval '30 days'
GROUP BY source;

GRANT SELECT ON public.source_quality_stats TO authenticated;
