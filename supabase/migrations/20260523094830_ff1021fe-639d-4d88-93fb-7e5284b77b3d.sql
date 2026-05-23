
-- 1. source_boards table
CREATE TABLE IF NOT EXISTS public.source_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  country_iso2 text NOT NULL,
  board_domain text NOT NULL,
  board_name text,
  lang text,
  board_type text NOT NULL DEFAULT 'firecrawl', -- firecrawl | apify_actor | rss
  apify_actor_id text,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 5,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  total_runs integer NOT NULL DEFAULT 0,
  total_leads_found integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_iso2, board_domain)
);

ALTER TABLE public.source_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read source_boards" ON public.source_boards
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin insert source_boards" ON public.source_boards
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin update source_boards" ON public.source_boards
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin delete source_boards" ON public.source_boards
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_source_boards_updated_at
  BEFORE UPDATE ON public.source_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_source_boards_country ON public.source_boards(country_iso2);
CREATE INDEX IF NOT EXISTS idx_source_boards_enabled ON public.source_boards(enabled) WHERE enabled = true;

-- 2. Seed local boards
INSERT INTO public.source_boards (country, country_iso2, board_domain, board_name, lang, priority) VALUES
  ('Serbia','RS','poslovi.infostud.com','Infostud Poslovi','sr',1),
  ('Serbia','RS','helloworld.rs','HelloWorld.rs','sr',2),
  ('Serbia','RS','poslovi.rs','Poslovi.rs','sr',3),
  ('Croatia','HR','mojposao.net','MojPosao','hr',1),
  ('Croatia','HR','posao.hr','Posao.hr','hr',2),
  ('Slovenia','SI','mojedelo.com','MojeDelo','sl',1),
  ('Slovenia','SI','optius.com','Optius','sl',2),
  ('Slovenia','SI','zaposlitev.net','Zaposlitev','sl',3),
  ('Bosnia and Herzegovina','BA','posao.ba','Posao.ba','bs',1),
  ('Bosnia and Herzegovina','BA','kolektiv.ba','Kolektiv','bs',2),
  ('Bosnia and Herzegovina','BA','boljiposao.com','BoljiPosao','bs',3),
  ('Montenegro','ME','posao.me','Posao.me','sr',1),
  ('Montenegro','ME','poslovi.me','Poslovi.me','sr',2),
  ('North Macedonia','MK','vrabotuvanje.com.mk','Vrabotuvanje','mk',1),
  ('North Macedonia','MK','mojakariera.com.mk','MojaKariera','mk',2),
  ('Albania','AL','duapune.com','DuaPune','sq',1),
  ('Albania','AL','njoftime.com','Njoftime','sq',2),
  ('Bulgaria','BG','jobs.bg','Jobs.bg','bg',1),
  ('Bulgaria','BG','zaplata.bg','Zaplata','bg',2),
  ('Bulgaria','BG','rabota.bg','Rabota.bg','bg',3),
  ('Romania','RO','ejobs.ro','eJobs','ro',1),
  ('Romania','RO','bestjobs.eu','BestJobs','ro',2),
  ('Romania','RO','hipo.ro','Hipo','ro',3),
  ('Hungary','HU','profession.hu','Profession','hu',1),
  ('Hungary','HU','jobline.hu','Jobline','hu',2),
  ('Poland','PL','pracuj.pl','Pracuj','pl',1),
  ('Poland','PL','olx.pl','OLX Praca','pl',2),
  ('Poland','PL','gowork.pl','GoWork','pl',3),
  ('Czechia','CZ','jobs.cz','Jobs.cz','cs',1),
  ('Czechia','CZ','prace.cz','Prace.cz','cs',2),
  ('Slovakia','SK','profesia.sk','Profesia','sk',1),
  ('Slovakia','SK','kariera.sk','Kariera.sk','sk',2),
  ('Germany','DE','stepstone.de','StepStone DE','de',1),
  ('Germany','DE','arbeitsagentur.de','Arbeitsagentur','de',2),
  ('Germany','DE','meinestadt.de','MeineStadt Jobs','de',3),
  ('Austria','AT','karriere.at','Karriere.at','de',1),
  ('Austria','AT','stepstone.at','StepStone AT','de',2),
  ('Netherlands','NL','nationalevacaturebank.nl','NationaleVacatureBank','nl',1),
  ('Netherlands','NL','werk.nl','Werk.nl','nl',2),
  ('Greece','GR','kariera.gr','Kariera.gr','el',1),
  ('Greece','GR','skywalker.gr','Skywalker','el',2),
  ('Greece','GR','jobfind.gr','JobFind','el',3),
  ('Italy','IT','infojobs.it','InfoJobs IT','it',1),
  ('Italy','IT','subito.it','Subito Lavoro','it',2),
  ('Spain','ES','infojobs.net','InfoJobs ES','es',1),
  ('Spain','ES','tablondeanuncios.com','TablonDeAnuncios','es',2),
  ('Portugal','PT','net-empregos.com','Net-Empregos','pt',1),
  ('Portugal','PT','sapo.pt','Sapo Emprego','pt',2),
  ('Cyprus','CY','ergodotisi.com','Ergodotisi','el',1),
  ('Cyprus','CY','carierista.com','Carierista','el',2)
ON CONFLICT (country_iso2, board_domain) DO NOTHING;

-- 3. Extend demand_leads
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS discovered_board text,
  ADD COLUMN IF NOT EXISTS discovered_board_domain text,
  ADD COLUMN IF NOT EXISTS posted_at_local timestamptz,
  ADD COLUMN IF NOT EXISTS local_lang text,
  ADD COLUMN IF NOT EXISTS phone_enriched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_enriched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_qualified boolean
    GENERATED ALWAYS AS (
      contact_email IS NOT NULL AND btrim(contact_email) <> ''
      AND contact_phone IS NOT NULL AND btrim(contact_phone) <> ''
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_demand_leads_board_domain ON public.demand_leads(discovered_board_domain);
CREATE INDEX IF NOT EXISTS idx_demand_leads_qualified ON public.demand_leads(contact_qualified) WHERE contact_qualified = true;

-- 4. Qualified view
CREATE OR REPLACE VIEW public.qualified_local_leads AS
SELECT dl.*
FROM public.demand_leads dl
WHERE dl.contact_qualified = true
  AND dl.discovered_board_domain IS NOT NULL;
