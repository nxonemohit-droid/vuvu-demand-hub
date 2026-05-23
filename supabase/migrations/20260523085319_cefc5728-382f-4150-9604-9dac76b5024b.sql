CREATE OR REPLACE FUNCTION public.increment_source_spend(_source_id text, _amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total numeric;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    SELECT monthly_spend_usd INTO new_total FROM public.source_registry WHERE id = _source_id;
    RETURN COALESCE(new_total, 0);
  END IF;
  UPDATE public.source_registry
     SET monthly_spend_usd = COALESCE(monthly_spend_usd, 0) + _amount,
         updated_at = now()
   WHERE id = _source_id
  RETURNING monthly_spend_usd INTO new_total;
  RETURN COALESCE(new_total, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_source_spend(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_source_spend(text, numeric) TO authenticated, service_role;