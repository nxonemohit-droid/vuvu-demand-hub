-- Quality score on raw_signals
ALTER TABLE public.raw_signals
  ADD COLUMN IF NOT EXISTS quality_score integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.compute_raw_signal_quality_score(_payload jsonb, _source text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s integer := 0;
  employer text := COALESCE(_payload->>'employer_name', _payload->>'employer', _payload->>'company', _payload->>'company_name');
  email text := COALESCE(_payload->>'email', _payload->>'contact_email');
  phone text := COALESCE(_payload->>'phone', _payload->>'contact_phone');
  role_v text := lower(COALESCE(_payload->>'role', _payload->>'title', _payload->>'job_title', ''));
  website text := COALESCE(_payload->>'website', _payload->>'company_website', _payload->>'url');
  src text := lower(COALESCE(_source, ''));
  kw text;
  keywords text[] := ARRAY['welder','carpenter','driver','construction','nurse','electrician','plumber','mechanic','operator','fabricator','hospitality','factory','logistics','warehouse'];
BEGIN
  IF employer IS NOT NULL AND btrim(employer) <> '' THEN s := s + 25; END IF;
  IF email IS NOT NULL AND position('@' in email) > 0 THEN s := s + 25; END IF;
  IF phone IS NOT NULL AND btrim(phone) <> '' THEN s := s + 15; END IF;
  FOREACH kw IN ARRAY keywords LOOP
    IF role_v LIKE '%' || kw || '%' THEN s := s + 15; EXIT; END IF;
  END LOOP;
  IF website IS NOT NULL AND btrim(website) <> '' THEN s := s + 10; END IF;
  IF src LIKE 'linkedin%' OR src LIKE 'indeed%' OR src LIKE 'bebity%' THEN s := s + 10; END IF;
  IF s < 0 THEN s := 0; END IF;
  IF s > 100 THEN s := 100; END IF;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.raw_signals_set_quality_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.quality_score := public.compute_raw_signal_quality_score(NEW.payload, NEW.source::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_raw_signals_quality_score ON public.raw_signals;
CREATE TRIGGER trg_raw_signals_quality_score
BEFORE INSERT OR UPDATE OF payload, source
ON public.raw_signals
FOR EACH ROW
EXECUTE FUNCTION public.raw_signals_set_quality_score();

UPDATE public.raw_signals
SET quality_score = public.compute_raw_signal_quality_score(payload, source::text);

CREATE INDEX IF NOT EXISTS idx_raw_signals_quality_score
  ON public.raw_signals (quality_score DESC);

-- Archived leads table
CREATE TABLE IF NOT EXISTS public.archived_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_reason text CHECK (archived_reason IN ('missing_contact','duplicate','low_quality','wrong_trade','manual')),
  archived_by text NOT NULL DEFAULT 'system',
  payload jsonb
);

ALTER TABLE public.archived_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read archived_leads"
  ON public.archived_leads FOR SELECT
  TO authenticated
  USING (private.is_team_member(auth.uid()));

CREATE POLICY "team write archived_leads"
  ON public.archived_leads FOR INSERT
  TO authenticated
  WITH CHECK (private.is_team_member(auth.uid()));

CREATE POLICY "admin delete archived_leads"
  ON public.archived_leads FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_archived_leads_original_id ON public.archived_leads(original_id);
CREATE INDEX IF NOT EXISTS idx_archived_leads_archived_at ON public.archived_leads(archived_at DESC);

-- Helper: archive a raw signal then delete it (atomic)
CREATE OR REPLACE FUNCTION public.archive_and_delete_raw_signal(_id uuid, _reason text, _by text DEFAULT 'system')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_id uuid;
BEGIN
  INSERT INTO public.archived_leads (original_id, archived_reason, archived_by, payload)
  SELECT id, _reason, _by, to_jsonb(rs.*)
  FROM public.raw_signals rs
  WHERE rs.id = _id
  RETURNING id INTO archived_id;

  DELETE FROM public.raw_signals WHERE id = _id;
  RETURN archived_id;
END;
$$;