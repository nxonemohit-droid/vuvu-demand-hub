DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='whatsapp_delivery_receipts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_delivery_receipts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='outreach_sends') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_sends;
  END IF;
END $$;