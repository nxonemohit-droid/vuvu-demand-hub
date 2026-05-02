
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'bd');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','bd')
  )
$$;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create profile + default bd role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'bd');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- profiles policies
CREATE POLICY "team can view profiles" ON public.profiles
FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()));

CREATE POLICY "users update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- user_roles policies
CREATE POLICY "team can read roles" ON public.user_roles
FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()));

CREATE POLICY "admins manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ DEMAND INTELLIGENCE ============
CREATE TYPE public.demand_source AS ENUM ('facebook','indeed','classifieds','career_page','other');
CREATE TYPE public.priority_tag  AS ENUM ('high','medium','low');
CREATE TYPE public.job_status    AS ENUM ('queued','running','succeeded','failed');

CREATE TABLE public.scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.demand_source NOT NULL,
  actor_id TEXT,
  country TEXT,
  keyword TEXT,
  status public.job_status NOT NULL DEFAULT 'queued',
  items_found INTEGER NOT NULL DEFAULT 0,
  items_structured INTEGER NOT NULL DEFAULT 0,
  apify_run_id TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.raw_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.scrape_jobs(id) ON DELETE SET NULL,
  source public.demand_source NOT NULL,
  source_url TEXT,
  source_id TEXT,
  raw_text TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL,
  structured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fingerprint)
);
CREATE INDEX idx_raw_signals_structured ON public.raw_signals(structured);
CREATE INDEX idx_raw_signals_source ON public.raw_signals(source);
ALTER TABLE public.raw_signals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.demand_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_signal_id UUID REFERENCES public.raw_signals(id) ON DELETE SET NULL,
  source public.demand_source NOT NULL,
  source_url TEXT,
  employer_name TEXT,
  role TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT,
  demand_size INTEGER,
  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_currency TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  visa_sponsorship BOOLEAN NOT NULL DEFAULT false,
  urgency_score INTEGER NOT NULL DEFAULT 0,   -- 0..100
  priority public.priority_tag NOT NULL DEFAULT 'low',
  matched_keywords TEXT[] DEFAULT '{}',
  notes TEXT,
  duplicate_of UUID REFERENCES public.demand_leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_priority ON public.demand_leads(priority);
CREATE INDEX idx_leads_country ON public.demand_leads(country);
CREATE INDEX idx_leads_role ON public.demand_leads(role);
CREATE INDEX idx_leads_created ON public.demand_leads(created_at DESC);
ALTER TABLE public.demand_leads ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON public.demand_leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  country_origin TEXT,
  preferred_countries TEXT[] DEFAULT '{}',
  skills TEXT[] DEFAULT '{}',
  experience_years INTEGER,
  available_from DATE,
  visa_status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_candidates_role ON public.candidates(role);

CREATE TRIGGER trg_candidates_updated_at
BEFORE UPDATE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.demand_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.demand_leads(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, candidate_id)
);
ALTER TABLE public.demand_matches ENABLE ROW LEVEL SECURITY;

-- Policies: team (admin or bd) read+write; only admins delete
CREATE POLICY "team read scrape_jobs" ON public.scrape_jobs FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team write scrape_jobs" ON public.scrape_jobs FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team update scrape_jobs" ON public.scrape_jobs FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin delete scrape_jobs" ON public.scrape_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "team read raw_signals" ON public.raw_signals FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team write raw_signals" ON public.raw_signals FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team update raw_signals" ON public.raw_signals FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin delete raw_signals" ON public.raw_signals FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "team read leads" ON public.demand_leads FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team write leads" ON public.demand_leads FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team update leads" ON public.demand_leads FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin delete leads" ON public.demand_leads FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "team read candidates" ON public.candidates FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team write candidates" ON public.candidates FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team update candidates" ON public.candidates FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin delete candidates" ON public.candidates FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "team read matches" ON public.demand_matches FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team write matches" ON public.demand_matches FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "admin delete matches" ON public.demand_matches FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
