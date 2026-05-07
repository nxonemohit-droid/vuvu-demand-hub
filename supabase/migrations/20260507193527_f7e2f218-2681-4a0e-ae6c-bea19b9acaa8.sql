
-- Part A: soft-archive helpers for demand_leads
CREATE OR REPLACE FUNCTION public.archive_and_delete_demand_lead(_id uuid, _reason text, _by text DEFAULT 'user')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can archive leads';
  END IF;

  INSERT INTO public.archived_leads (original_id, archived_reason, archived_by, payload)
  SELECT id, _reason, _by, to_jsonb(dl.*)
  FROM public.demand_leads dl
  WHERE dl.id = _id
  RETURNING id INTO archived_id;

  DELETE FROM public.demand_leads WHERE id = _id;
  RETURN archived_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_low_quality_demand_leads(
  _min_score int DEFAULT 40,
  _require_no_contact boolean DEFAULT true,
  _by text DEFAULT 'user'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_count int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk-archive leads';
  END IF;

  WITH targets AS (
    SELECT id FROM public.demand_leads
    WHERE quality_score < _min_score
      AND (
        NOT _require_no_contact
        OR (
          (contact_email IS NULL OR btrim(contact_email) = '')
          AND (contact_phone IS NULL OR btrim(contact_phone) = '')
        )
      )
  ),
  moved AS (
    INSERT INTO public.archived_leads (original_id, archived_reason, archived_by, payload)
    SELECT dl.id, 'low_quality', _by, to_jsonb(dl.*)
    FROM public.demand_leads dl
    JOIN targets t ON t.id = dl.id
    RETURNING original_id
  ),
  deleted AS (
    DELETE FROM public.demand_leads
    WHERE id IN (SELECT original_id FROM moved)
    RETURNING id
  )
  SELECT COUNT(*) INTO archived_count FROM deleted;

  RETURN archived_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_archived_lead(_archived_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload_data jsonb;
  new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can restore leads';
  END IF;

  SELECT payload INTO payload_data FROM public.archived_leads WHERE id = _archived_id;
  IF payload_data IS NULL THEN
    RAISE EXCEPTION 'Archived lead not found';
  END IF;

  -- Only restore if payload looks like a demand_lead row
  IF NOT (payload_data ? 'role' AND payload_data ? 'country') THEN
    RAISE EXCEPTION 'Archived payload is not a demand_lead';
  END IF;

  INSERT INTO public.demand_leads
    (id, employer_name, role, country, city, contact_email, contact_name, contact_phone,
     source, source_url, raw_signal_id, demand_size, salary_min, salary_max, salary_currency,
     sponsorship_signals, sector_tags, target_audience_type, worker_origin_focus,
     review_status, ai_rationale, score_breakdown, tier, score, notes,
     matched_keywords, priority, urgency_score, visa_sponsorship)
  VALUES (
    COALESCE((payload_data->>'original_id')::uuid, gen_random_uuid()),
    payload_data->>'employer_name',
    payload_data->>'role',
    payload_data->>'country',
    payload_data->>'city',
    payload_data->>'contact_email',
    payload_data->>'contact_name',
    payload_data->>'contact_phone',
    (payload_data->>'source')::source_type,
    payload_data->>'source_url',
    NULLIF(payload_data->>'raw_signal_id','')::uuid,
    NULLIF(payload_data->>'demand_size','')::int,
    NULLIF(payload_data->>'salary_min','')::numeric,
    NULLIF(payload_data->>'salary_max','')::numeric,
    payload_data->>'salary_currency',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(payload_data->'sponsorship_signals')), '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(payload_data->'sector_tags')), '{}'),
    payload_data->>'target_audience_type',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(payload_data->'worker_origin_focus')), '{}'),
    COALESCE(payload_data->>'review_status','new'),
    payload_data->>'ai_rationale',
    COALESCE(payload_data->'score_breakdown','{}'::jsonb),
    payload_data->>'tier',
    NULLIF(payload_data->>'score','')::numeric,
    payload_data->>'notes',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(payload_data->'matched_keywords')), '{}'),
    COALESCE((payload_data->>'priority')::priority_tag, 'low'::priority_tag),
    COALESCE(NULLIF(payload_data->>'urgency_score','')::int, 0),
    COALESCE((payload_data->>'visa_sponsorship')::boolean, false)
  )
  RETURNING id INTO new_id;

  DELETE FROM public.archived_leads WHERE id = _archived_id;
  RETURN new_id;
END;
$$;

-- B2: extend compute_quality_score with stronger signals (still 0..100)
CREATE OR REPLACE FUNCTION public.compute_quality_score(
  _employer_name text, _role text, _contact_email text, _contact_phone text
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
  IF _contact_email IS NOT NULL AND position('@' in _contact_email) > 0 THEN s := s + 25; END IF;
  IF _contact_phone IS NOT NULL AND btrim(_contact_phone) <> '' THEN s := s + 15; END IF;
  IF _employer_name IS NOT NULL AND btrim(_employer_name) <> '' THEN s := s + 25; END IF;
  FOREACH kw IN ARRAY keywords LOOP
    IF role_l LIKE '%' || kw || '%' THEN s := s + 15; EXIT; END IF;
  END LOOP;
  IF s < 0 THEN s := 0; END IF;
  IF s > 100 THEN s := 100; END IF;
  RETURN s;
END;
$$;

-- Richer scorer that also reads geo / source / salary signals
CREATE OR REPLACE FUNCTION public.compute_demand_lead_quality_score(_lead public.demand_leads)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s integer := public.compute_quality_score(
    _lead.employer_name, _lead.role, _lead.contact_email, _lead.contact_phone
  );
  src text := lower(coalesce(_lead.source::text, ''));
BEGIN
  IF _lead.country IS NOT NULL AND btrim(_lead.country) <> ''
     AND _lead.city IS NOT NULL AND btrim(_lead.city) <> '' THEN
    s := s + 10;
  END IF;
  IF src IN ('linkedin','indeed','bebity') THEN s := s + 10; END IF;
  IF _lead.salary_min IS NOT NULL OR _lead.demand_size IS NOT NULL THEN s := s + 5; END IF;
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
  NEW.quality_score := public.compute_demand_lead_quality_score(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_leads_quality_score ON public.demand_leads;
CREATE TRIGGER trg_demand_leads_quality_score
BEFORE INSERT OR UPDATE OF employer_name, role, contact_email, contact_phone, country, city, source, salary_min, demand_size
ON public.demand_leads
FOR EACH ROW EXECUTE FUNCTION public.demand_leads_set_quality_score();

-- Backfill scores
UPDATE public.demand_leads SET quality_score = public.compute_demand_lead_quality_score(demand_leads.*);
