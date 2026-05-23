
-- ============================
-- Voynova Lead Discovery v2
-- ============================

-- 1) demand_leads new columns
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS lead_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vacancy_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_direct_employer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS repost_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trade_category text,
  ADD COLUMN IF NOT EXISTS email_source text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS outreach_queued boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outreach_queued_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_demand_leads_lead_score ON public.demand_leads (lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_demand_leads_trade_category ON public.demand_leads (trade_category);
CREATE INDEX IF NOT EXISTS idx_demand_leads_outreach_queued ON public.demand_leads (outreach_queued);
CREATE INDEX IF NOT EXISTS idx_demand_leads_dedup ON public.demand_leads (lower(employer_name), country, trade_category) WHERE employer_name IS NOT NULL;

-- 2) source_boards new columns
ALTER TABLE public.source_boards
  ADD COLUMN IF NOT EXISTS daily_cap int NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS search_queries text[] NOT NULL DEFAULT '{}'::text[];

-- 3) discovery_keywords
CREATE TABLE IF NOT EXISTS public.discovery_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('trade','agency_exclude','vacancy_phrase','whitecollar_exclude')),
  lang text NOT NULL DEFAULT 'en',
  keyword text NOT NULL,
  category text,
  weight int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, lang, keyword)
);
ALTER TABLE public.discovery_keywords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team read discovery_keywords" ON public.discovery_keywords;
DROP POLICY IF EXISTS "admin write discovery_keywords" ON public.discovery_keywords;
DROP POLICY IF EXISTS "admin update discovery_keywords" ON public.discovery_keywords;
DROP POLICY IF EXISTS "admin delete discovery_keywords" ON public.discovery_keywords;
CREATE POLICY "team read discovery_keywords" ON public.discovery_keywords FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin write discovery_keywords" ON public.discovery_keywords FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update discovery_keywords" ON public.discovery_keywords FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete discovery_keywords" ON public.discovery_keywords FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_discovery_keywords_updated_at
BEFORE UPDATE ON public.discovery_keywords
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) daily_discovery_summary
CREATE TABLE IF NOT EXISTS public.daily_discovery_summary (
  date date PRIMARY KEY,
  total_found int NOT NULL DEFAULT 0,
  qualified_count int NOT NULL DEFAULT 0,
  hot_count int NOT NULL DEFAULT 0,
  countries_count int NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_discovery_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team read daily_discovery_summary" ON public.daily_discovery_summary;
DROP POLICY IF EXISTS "admin write daily_discovery_summary" ON public.daily_discovery_summary;
DROP POLICY IF EXISTS "admin update daily_discovery_summary" ON public.daily_discovery_summary;
CREATE POLICY "team read daily_discovery_summary" ON public.daily_discovery_summary FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin write daily_discovery_summary" ON public.daily_discovery_summary FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update daily_discovery_summary" ON public.daily_discovery_summary FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 5) compute_lead_score
CREATE OR REPLACE FUNCTION public.compute_lead_score(_lead public.demand_leads)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  score int := 0;
  comp jsonb := '{}'::jsonb;
  tcat text := lower(coalesce(_lead.trade_category,''));
  hi_trades text[] := ARRAY['welding','construction','driver','factory','warehouse'];
  primary_markets text[] := ARRAY['Serbia','Romania','Croatia','Hungary'];
  has_website boolean := _lead.source_url IS NOT NULL AND btrim(_lead.source_url) <> '';
  email_ok boolean := _lead.contact_email IS NOT NULL AND position('@' in _lead.contact_email) > 0;
  email_verified boolean := email_ok AND _lead.email_source IN ('hunter','scraped');
  phone_ok boolean := _lead.phone_e164 IS NOT NULL AND _lead.phone_e164 ~ '^\+\d{8,15}$';
BEGIN
  IF tcat = ANY(hi_trades) THEN score := score + 20; comp := comp || jsonb_build_object('trade_high', 20); END IF;
  IF coalesce(_lead.vacancy_count,1) >= 3 THEN score := score + 15; comp := comp || jsonb_build_object('vacancy_3plus', 15); END IF;
  IF _lead.posted_at_local IS NOT NULL AND _lead.posted_at_local > now() - interval '7 days' THEN
    score := score + 15; comp := comp || jsonb_build_object('freshness_7d', 15);
  ELSIF _lead.created_at > now() - interval '7 days' THEN
    score := score + 10; comp := comp || jsonb_build_object('freshness_created_7d', 10);
  END IF;
  IF has_website THEN score := score + 10; comp := comp || jsonb_build_object('has_website', 10); END IF;
  IF email_verified THEN score := score + 10; comp := comp || jsonb_build_object('email_verified', 10);
  ELSIF email_ok THEN score := score + 4; comp := comp || jsonb_build_object('email_guessed', 4);
  END IF;
  IF phone_ok THEN score := score + 10; comp := comp || jsonb_build_object('phone_valid', 10); END IF;
  IF _lead.is_direct_employer THEN score := score + 10; comp := comp || jsonb_build_object('direct_employer', 10); END IF;
  IF _lead.country = ANY(primary_markets) THEN score := score + 10; comp := comp || jsonb_build_object('primary_market', 10); END IF;
  IF coalesce(_lead.repost_count,1) >= 3 THEN score := score + 10; comp := comp || jsonb_build_object('repost_3plus', 10); END IF;

  IF score > 100 THEN score := 100; END IF;
  RETURN jsonb_build_object('score', score, 'components', comp);
END;
$$;

-- 6) trigger to populate lead_score
CREATE OR REPLACE FUNCTION public.demand_leads_set_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  result := public.compute_lead_score(NEW);
  NEW.lead_score := (result->>'score')::int;
  NEW.score_components := result->'components';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_leads_lead_score ON public.demand_leads;
CREATE TRIGGER trg_demand_leads_lead_score
BEFORE INSERT OR UPDATE ON public.demand_leads
FOR EACH ROW EXECUTE FUNCTION public.demand_leads_set_lead_score();

-- 7) Seed trade keywords
INSERT INTO public.discovery_keywords (kind, lang, keyword, category) VALUES
  ('trade','en','welder','welding'),
  ('trade','en','welding','welding'),
  ('trade','en','construction','construction'),
  ('trade','en','mason','construction'),
  ('trade','en','carpenter','construction'),
  ('trade','en','plumber','construction'),
  ('trade','en','electrician','construction'),
  ('trade','en','painter','construction'),
  ('trade','en','roofer','construction'),
  ('trade','en','scaffolder','construction'),
  ('trade','en','steel fixer','construction'),
  ('trade','en','concretor','construction'),
  ('trade','en','tiler','construction'),
  ('trade','en','HVAC','construction'),
  ('trade','en','factory worker','factory'),
  ('trade','en','warehouse','warehouse'),
  ('trade','en','forklift','warehouse'),
  ('trade','en','driver','driver'),
  ('trade','en','truck driver','driver'),
  ('trade','en','machine operator','manufacturing'),
  ('trade','en','manufacturing','manufacturing'),
  ('trade','en','meat processing','manufacturing'),
  ('trade','en','agriculture','agriculture'),
  ('trade','en','kitchen helper','hospitality'),
  ('trade','en','housekeeping','hospitality'),
  ('trade','en','dishwasher','hospitality'),
  ('trade','en','cleaner','cleaning'),
  ('trade','en','security guard','security'),
  ('trade','en','labourer','construction'),
  ('trade','en','caregiver','caregiving'),
  ('trade','en','nurse aide','caregiving'),
  ('trade','sr','radnik građevina','construction'),
  ('trade','sr','varilac','welding'),
  ('trade','sr','vozač','driver'),
  ('trade','sr','vozač kamiona','driver'),
  ('trade','sr','zidar','construction'),
  ('trade','sr','tesar','construction'),
  ('trade','sr','električar','construction'),
  ('trade','sr','vodoinstalater','construction'),
  ('trade','sr','radnik u skladištu','warehouse'),
  ('trade','sr','viljuškarista','warehouse'),
  ('trade','ro','muncitor construcții','construction'),
  ('trade','ro','sudor','welding'),
  ('trade','ro','șofer','driver'),
  ('trade','ro','zidar','construction'),
  ('trade','ro','electrician','construction'),
  ('trade','ro','operator stivuitor','warehouse'),
  ('trade','hr','radnik građevina','construction'),
  ('trade','hr','varilac','welding'),
  ('trade','hr','vozač','driver'),
  ('trade','hu','építőipari munkás','construction'),
  ('trade','hu','hegesztő','welding'),
  ('trade','hu','sofőr','driver'),
  ('trade','hu','raktáros','warehouse'),
  ('trade','bg','строителен работник','construction'),
  ('trade','bg','шофьор','driver'),
  ('trade','pl','pracownik budowlany','construction'),
  ('trade','pl','spawacz','welding'),
  ('trade','pl','kierowca','driver'),
  ('trade','de','bauarbeiter','construction'),
  ('trade','de','schweißer','welding'),
  ('trade','de','lkw-fahrer','driver'),
  ('trade','el','εργάτης οικοδομής','construction'),
  ('trade','el','οδηγός','driver')
ON CONFLICT (kind, lang, keyword) DO NOTHING;

-- Agency exclusion keywords
INSERT INTO public.discovery_keywords (kind, lang, keyword) VALUES
  ('agency_exclude','en','recruitment agency'),
  ('agency_exclude','en','staffing agency'),
  ('agency_exclude','en','temp agency'),
  ('agency_exclude','en','manpower agency'),
  ('agency_exclude','sr','agencija za zapošljavanje'),
  ('agency_exclude','sr','posredovanje'),
  ('agency_exclude','sr','agencija'),
  ('agency_exclude','ro','agenție de recrutare'),
  ('agency_exclude','ro','agenție de plasare'),
  ('agency_exclude','hr','agencija za posredovanje'),
  ('agency_exclude','hr','agencija za zapošljavanje'),
  ('agency_exclude','hu','munkaerő-kölcsönző'),
  ('agency_exclude','hu','munkaerőkölcsönző'),
  ('agency_exclude','bg','агенция за подбор'),
  ('agency_exclude','pl','agencja pracy'),
  ('agency_exclude','de','arbeitsvermittlung'),
  ('agency_exclude','de','personalvermittlung'),
  ('agency_exclude','de','zeitarbeit'),
  ('agency_exclude','el','γραφείο ευρέσεως εργασίας')
ON CONFLICT (kind, lang, keyword) DO NOTHING;

-- White-collar exclusions
INSERT INTO public.discovery_keywords (kind, lang, keyword) VALUES
  ('whitecollar_exclude','en','software'),
  ('whitecollar_exclude','en','developer'),
  ('whitecollar_exclude','en','engineer'),
  ('whitecollar_exclude','en','marketing'),
  ('whitecollar_exclude','en','sales manager'),
  ('whitecollar_exclude','en','analyst'),
  ('whitecollar_exclude','en','consultant'),
  ('whitecollar_exclude','en','accountant'),
  ('whitecollar_exclude','en','lawyer'),
  ('whitecollar_exclude','en','designer'),
  ('whitecollar_exclude','en','product manager'),
  ('whitecollar_exclude','en','hr manager'),
  ('whitecollar_exclude','en','finance'),
  ('whitecollar_exclude','en','controller')
ON CONFLICT (kind, lang, keyword) DO NOTHING;

-- Vacancy count phrases (regex-friendly)
INSERT INTO public.discovery_keywords (kind, lang, keyword) VALUES
  ('vacancy_phrase','en','(\d+)\s+workers?\s+(needed|required|wanted)'),
  ('vacancy_phrase','en','hiring\s+(\d+)'),
  ('vacancy_phrase','sr','potrebno\s+(\d+)\s+radnika'),
  ('vacancy_phrase','sr','tražimo\s+(\d+)\s+radnika'),
  ('vacancy_phrase','ro','căutăm\s+(\d+)\s+angajați'),
  ('vacancy_phrase','ro','angajăm\s+(\d+)'),
  ('vacancy_phrase','hr','tražimo\s+(\d+)\s+radnika'),
  ('vacancy_phrase','hu','keresünk\s+(\d+)\s+munkást'),
  ('vacancy_phrase','pl','zatrudnimy\s+(\d+)'),
  ('vacancy_phrase','de','wir suchen\s+(\d+)')
ON CONFLICT (kind, lang, keyword) DO NOTHING;

-- 8) Seed/upsert source_boards
-- helper UPSERT via INSERT ... ON CONFLICT on (country_iso2, board_domain) — add unique constraint first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'source_boards_country_domain_uk'
  ) THEN
    ALTER TABLE public.source_boards
      ADD CONSTRAINT source_boards_country_domain_uk UNIQUE (country_iso2, board_domain);
  END IF;
END$$;

INSERT INTO public.source_boards (country, country_iso2, board_domain, board_name, lang, board_type, enabled, priority, daily_cap, search_queries) VALUES
  ('Serbia','RS','helloworld.rs','HelloWorld','sr','firecrawl',true,1,75,ARRAY['radnik','vozač','varilac','građevina','skladište']),
  ('Serbia','RS','oglasi.rs','Oglasi','sr','firecrawl',true,2,75,ARRAY['posao radnik','potrebni radnici','vozač','građevina']),
  ('Serbia','RS','infostud.com','Infostud','sr','firecrawl',true,1,75,ARRAY['radnik','građevina','skladište','vozač']),
  ('Serbia','RS','joberty.rs','Joberty','sr','firecrawl',true,3,50,ARRAY['radnik','operater','vozač']),
  ('Romania','RO','bestjobs.eu','BestJobs','ro','firecrawl',true,1,75,ARRAY['muncitor','sudor','șofer','construcții']),
  ('Romania','RO','ejobs.ro','eJobs','ro','firecrawl',true,1,75,ARRAY['muncitor','șofer','depozit','sudor']),
  ('Romania','RO','hipo.ro','Hipo','ro','firecrawl',true,3,50,ARRAY['muncitor','operator']),
  ('Romania','RO','jobuti.ro','JobuTi','ro','firecrawl',true,4,50,ARRAY['muncitor','construcții']),
  ('Croatia','HR','moj-posao.net','MojPosao','hr','firecrawl',true,1,75,ARRAY['radnik','vozač','građevina','skladište']),
  ('Croatia','HR','posao.hr','Posao.hr','hr','firecrawl',true,2,75,ARRAY['radnik','vozač','varilac']),
  ('Croatia','HR','oglasnik.hr','Oglasnik','hr','firecrawl',true,3,50,ARRAY['posao radnik','građevina']),
  ('Hungary','HU','profession.hu','Profession','hu','firecrawl',true,1,75,ARRAY['munkás','hegesztő','sofőr','raktár']),
  ('Hungary','HU','jobs.hu','Jobs.hu','hu','firecrawl',true,2,75,ARRAY['munkás','építőipar','raktár']),
  ('Hungary','HU','jobline.hu','Jobline','hu','firecrawl',true,3,50,ARRAY['munkás','sofőr']),
  ('Bosnia and Herzegovina','BA','posao.ba','Posao.ba','hr','firecrawl',true,1,75,ARRAY['radnik','vozač','građevina']),
  ('Bosnia and Herzegovina','BA','oglasnik.ba','Oglasnik.ba','hr','firecrawl',true,3,50,ARRAY['posao radnik']),
  ('Bosnia and Herzegovina','BA','infozaposlenje.ba','InfoZaposlenje','hr','firecrawl',true,4,50,ARRAY['radnik']),
  ('Montenegro','ME','posao.me','Posao.me','sr','firecrawl',true,1,50,ARRAY['radnik','vozač','građevina']),
  ('Montenegro','ME','oglasi.me','Oglasi.me','sr','firecrawl',true,3,50,ARRAY['posao radnik']),
  ('Bulgaria','BG','jobs.bg','Jobs.bg','bg','firecrawl',true,1,75,ARRAY['работник','шофьор','строителен']),
  ('Bulgaria','BG','zaplata.bg','Zaplata','bg','firecrawl',true,2,50,ARRAY['работник','склад']),
  ('Poland','PL','pracuj.pl','Pracuj','pl','firecrawl',true,1,75,ARRAY['pracownik','spawacz','kierowca','magazyn']),
  ('Poland','PL','olx.pl','OLX Praca','pl','firecrawl',true,2,75,ARRAY['praca budowa','kierowca','magazyn']),
  ('Austria','AT','karriere.at','Karriere','de','firecrawl',true,1,75,ARRAY['bauarbeiter','schweißer','lkw-fahrer','lager']),
  ('Austria','AT','jobs.at','Jobs.at','de','firecrawl',true,2,50,ARRAY['bauarbeiter','lager']),
  ('Germany','DE','stepstone.de','StepStone','de','firecrawl',true,2,75,ARRAY['bauarbeiter','schweißer','lkw-fahrer']),
  ('Germany','DE','indeed.de','Indeed DE','de','firecrawl',true,2,75,ARRAY['bauarbeiter','schweißer','helfer']),
  ('Greece','GR','kariera.gr','Kariera','el','firecrawl',true,1,75,ARRAY['εργάτης','οδηγός','αποθήκη']),
  ('Greece','GR','skywalker.gr','Skywalker','el','firecrawl',true,2,50,ARRAY['εργάτης','οδηγός'])
ON CONFLICT (country_iso2, board_domain) DO UPDATE
SET board_name = EXCLUDED.board_name,
    lang = EXCLUDED.lang,
    board_type = EXCLUDED.board_type,
    priority = EXCLUDED.priority,
    daily_cap = EXCLUDED.daily_cap,
    search_queries = EXCLUDED.search_queries,
    updated_at = now();

-- 9) Backfill lead_score on existing leads via no-op update
UPDATE public.demand_leads SET updated_at = updated_at;
