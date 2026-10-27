CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id text NOT NULL UNIQUE, event text NOT NULL, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, processing_error text, next_attempt_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_events_team_read ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE INDEX whatsapp_events_pending ON public.whatsapp_webhook_events(next_attempt_at) WHERE processed_at IS NULL;
CREATE TABLE IF NOT EXISTS public.whatsapp_status_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id text NOT NULL, provider_message_id text NOT NULL, status text NOT NULL, recipient text, occurred_at timestamptz NOT NULL, errors jsonb NOT NULL DEFAULT '[]', UNIQUE(delivery_id,provider_message_id,status,occurred_at));
GRANT SELECT ON public.whatsapp_status_events TO authenticated;
GRANT ALL ON public.whatsapp_status_events TO service_role;
ALTER TABLE public.whatsapp_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_status_events_team_read ON public.whatsapp_status_events FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE INDEX whatsapp_status_events_message ON public.whatsapp_status_events(provider_message_id);
CREATE OR REPLACE FUNCTION public.complete_whatsapp_event(p_delivery_id text,p_receipts jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; done timestamptz;
BEGIN
SELECT processed_at INTO done FROM public.whatsapp_webhook_events WHERE delivery_id=p_delivery_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Missing durable event'; END IF;
IF done IS NOT NULL THEN RETURN; END IF;
FOR item IN SELECT value FROM jsonb_array_elements(p_receipts) LOOP
IF item->>'status' NOT IN ('sent','delivered','read','failed') OR nullif(item->>'provider_message_id','') IS NULL THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
INSERT INTO public.whatsapp_status_events(delivery_id,provider_message_id,status,recipient,occurred_at,errors) VALUES (p_delivery_id,item->>'provider_message_id',item->>'status',item->>'recipient',(item->>'occurred_at')::timestamptz,coalesce(item->'errors','[]')) ON CONFLICT DO NOTHING;
INSERT INTO public.whatsapp_delivery_receipts(provider_message_id,status,recipient,occurred_at,errors,delivery_id) VALUES (item->>'provider_message_id',item->>'status',item->>'recipient',(item->>'occurred_at')::timestamptz,coalesce(item->'errors','[]'),p_delivery_id) ON CONFLICT(provider_message_id,status) DO UPDATE SET errors=CASE WHEN excluded.errors <> '[]'::jsonb THEN excluded.errors ELSE whatsapp_delivery_receipts.errors END;
END LOOP;
UPDATE public.whatsapp_webhook_events SET processed_at=now(),processing_error=NULL WHERE delivery_id=p_delivery_id;
END $$;
REVOKE ALL ON FUNCTION public.complete_whatsapp_event(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_event(text,jsonb) TO service_role;
CREATE OR REPLACE VIEW public.whatsapp_receipt_counts WITH (security_invoker=true) AS SELECT count(DISTINCT provider_message_id) FILTER (WHERE status IN ('delivered','read')) AS delivered,count(DISTINCT provider_message_id) FILTER (WHERE status='read') AS read,count(DISTINCT provider_message_id) FILTER (WHERE status='failed') AS failed FROM public.whatsapp_delivery_receipts;
GRANT SELECT ON public.whatsapp_receipt_counts TO authenticated,service_role;
