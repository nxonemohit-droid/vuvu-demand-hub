-- 1. Add new facet columns to demand_leads
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS worker_origin_focus text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS target_audience_type text,
  ADD COLUMN IF NOT EXISTS sector_tags text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_demand_leads_worker_origin_focus
  ON public.demand_leads USING GIN (worker_origin_focus);

CREATE INDEX IF NOT EXISTS idx_demand_leads_sector_tags
  ON public.demand_leads USING GIN (sector_tags);

CREATE INDEX IF NOT EXISTS idx_demand_leads_target_audience_type
  ON public.demand_leads (target_audience_type);

CREATE INDEX IF NOT EXISTS idx_demand_leads_country
  ON public.demand_leads (country);

CREATE INDEX IF NOT EXISTS idx_demand_leads_priority
  ON public.demand_leads (priority);

CREATE INDEX IF NOT EXISTS idx_demand_leads_created_at
  ON public.demand_leads (created_at DESC);

-- 3. Heuristic backfill helper (immutable, no side effects)
-- Builds a single lowercase haystack from common fields for matching.
CREATE OR REPLACE FUNCTION public._lead_haystack(
  _employer text, _role text, _notes text, _source_url text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_employer,'') || ' ' || coalesce(_role,'') || ' ' ||
               coalesce(_notes,'')    || ' ' || coalesce(_source_url,''));
$$;

-- 4. Backfill worker_origin_focus
UPDATE public.demand_leads l
SET worker_origin_focus = sub.tags
FROM (
  SELECT id,
    ARRAY(
      SELECT DISTINCT t FROM (
        SELECT CASE WHEN h ~ '\b(india|indian|bharat|mumbai|delhi|kerala|punjab)\b' THEN 'India' END AS t
        UNION ALL
        SELECT CASE WHEN h ~ '\b(nepal|nepali|nepalese|kathmandu)\b' THEN 'Nepal' END
        UNION ALL
        SELECT CASE WHEN h ~ '\b(bangladesh|bangladeshi|dhaka|bengali)\b' THEN 'Bangladesh' END
        UNION ALL
        SELECT CASE WHEN h ~ '\b(south\s*asia|south-asian|south\s*asian)\b'
                     THEN 'India' END  -- treat generic south-asia as India primary
      ) z WHERE t IS NOT NULL
    ) AS tags
  FROM (
    SELECT id, public._lead_haystack(employer_name, role, notes, source_url) AS h
    FROM public.demand_leads
  ) s
) sub
WHERE l.id = sub.id
  AND (l.worker_origin_focus IS NULL OR array_length(l.worker_origin_focus,1) IS NULL);

-- 5. Backfill target_audience_type
UPDATE public.demand_leads l
SET target_audience_type = CASE
  WHEN h ~ '\b(recruitment\s+agenc|staffing\s+agenc|manpower\s+agenc|placement\s+agenc)\b' THEN 'recruitment_agency'
  WHEN h ~ '\b(staffing|labour\s+hire|labor\s+hire|temp\s+agency)\b' THEN 'staffing'
  WHEN h ~ '\b(freelance\s+recruiter|independent\s+recruiter|solo\s+recruiter)\b' THEN 'freelance_recruiter'
  WHEN h ~ '\b(hr\s+manager|head\s+of\s+hr|chief\s+people|people\s+ops)\b' THEN 'hr_manager'
  WHEN h ~ '\b(hiring\s+manager|talent\s+acquisition|ta\s+lead)\b' THEN 'hiring_manager'
  WHEN h ~ '\b(recruiter|headhunter|talent\s+sourcer)\b' THEN 'recruiter'
  ELSE 'employer_direct'
END
FROM (
  SELECT id, public._lead_haystack(employer_name, role, notes, source_url) AS h
  FROM public.demand_leads
) sub
WHERE l.id = sub.id
  AND l.target_audience_type IS NULL;

-- 6. Backfill sector_tags
UPDATE public.demand_leads l
SET sector_tags = sub.tags
FROM (
  SELECT id,
    ARRAY(
      SELECT DISTINCT t FROM (
        SELECT CASE WHEN h ~ '\b(construction|builder|mason|brick|carpenter|plumber|electrician|welder|scaffold|civil)\b' THEN 'construction' END AS t
        UNION ALL SELECT CASE WHEN h ~ '\b(hotel|hospitality|chef|cook|waiter|housekeep|reception|kitchen|barista|restaurant)\b' THEN 'hospitality' END
        UNION ALL SELECT CASE WHEN h ~ '\b(nurse|caregiver|care\s+worker|healthcare|hospital|elderly|pflege)\b' THEN 'healthcare' END
        UNION ALL SELECT CASE WHEN h ~ '\b(driver|trucker|logistic|warehouse|forklift|delivery|courier|lager)\b' THEN 'logistics' END
        UNION ALL SELECT CASE WHEN h ~ '\b(factory|production|assembly|manufactur|operator|machine\s+operator|cnc)\b' THEN 'manufacturing' END
        UNION ALL SELECT CASE WHEN h ~ '\b(farm|agricultur|harvest|seasonal|picker|greenhouse)\b' THEN 'agriculture' END
        UNION ALL SELECT CASE WHEN h ~ '\b(cleaner|cleaning|housekeep|janitor|sanitation)\b' THEN 'cleaning' END
        UNION ALL SELECT CASE WHEN h ~ '\b(security|guard|doorman)\b' THEN 'security' END
        UNION ALL SELECT CASE WHEN h ~ '\b(retail|cashier|shop\s+assistant|sales\s+assistant|store)\b' THEN 'retail' END
      ) z WHERE t IS NOT NULL
    ) AS tags
  FROM (
    SELECT id, public._lead_haystack(employer_name, role, notes, source_url) AS h
    FROM public.demand_leads
  ) s
) sub
WHERE l.id = sub.id
  AND (l.sector_tags IS NULL OR array_length(l.sector_tags,1) IS NULL);