CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_delivery_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','delivered','read','failed')),
  recipient text,
  occurred_at timestamptz NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_message_id, status)
);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_receipts_message_idx ON public.whatsapp_delivery_receipts (provider_message_id);
CREATE INDEX IF NOT EXISTS outreach_sends_provider_message_idx ON public.outreach_sends (provider_message_id);

GRANT SELECT ON public.whatsapp_webhook_inbox TO authenticated;
GRANT ALL ON public.whatsapp_webhook_inbox TO service_role;
GRANT SELECT ON public.whatsapp_delivery_receipts TO authenticated;
GRANT ALL ON public.whatsapp_delivery_receipts TO service_role;

ALTER TABLE public.whatsapp_webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_delivery_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can read WhatsApp inbox" ON public.whatsapp_webhook_inbox;
CREATE POLICY "Team can read WhatsApp inbox" ON public.whatsapp_webhook_inbox
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "Team can read WhatsApp receipts" ON public.whatsapp_delivery_receipts;
CREATE POLICY "Team can read WhatsApp receipts" ON public.whatsapp_delivery_receipts
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));