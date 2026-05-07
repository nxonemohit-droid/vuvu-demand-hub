-- Quality score function + auto-maintained quality_score column on demand_leads
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS quality_score integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.compute_quality_score(
  _employer_name text,
  _role text,
  _contact_email text,
  _contact_phone text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s integer := 0;
  role_l text := lower(coalesce(_role, ''));
  kw text;
  keywords text[] := ARRAY[
    'welder','carpenter','driver','construction','nurse','electrician',
    'plumber','mechanic','operator','fabricator','hospitality','factory',
    'logistics','warehouse'
  ];
BEGIN
  IF _contact_email IS NOT NULL AND position('@' in _contact_email) > 0 THEN
    s := s + 25;
  END IF;
  IF _contact_phone IS NOT NULL AND btrim(_contact_phone) <> '' THEN
    s := s + 15;
  END IF;
  IF _employer_name IS NOT NULL AND btrim(_employer_name) <> '' THEN
    s := s + 25;
  END IF;
  FOREACH kw IN ARRAY keywords LOOP
    IF role_l LIKE '%' || kw || '%' THEN
      s := s + 15;
      EXIT;
    END IF;
  END LOOP;
  IF s < 0 THEN s := 0; END IF;
  IF s > 100 THEN s := 100; END IF;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.demand_leads_set_quality_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.quality_score := public.compute_quality_score(
    NEW.employer_name, NEW.role, NEW.contact_email, NEW.contact_phone
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS demand_leads_quality_score_trg ON public.demand_leads;
CREATE TRIGGER demand_leads_quality_score_trg
BEFORE INSERT OR UPDATE OF employer_name, role, contact_email, contact_phone
ON public.demand_leads
FOR EACH ROW
EXECUTE FUNCTION public.demand_leads_set_quality_score();

-- Backfill existing rows
UPDATE public.demand_leads
SET quality_score = public.compute_quality_score(employer_name, role, contact_email, contact_phone);

CREATE INDEX IF NOT EXISTS idx_demand_leads_quality_score
  ON public.demand_leads (quality_score DESC);