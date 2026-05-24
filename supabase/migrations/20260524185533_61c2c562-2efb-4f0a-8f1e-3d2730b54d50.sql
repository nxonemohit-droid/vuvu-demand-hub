-- email_campaigns: add channel + lead_source
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS lead_source text NOT NULL DEFAULT 'recruiter';

DO $$ BEGIN
  ALTER TABLE public.email_campaigns
    ADD CONSTRAINT email_campaigns_channel_chk CHECK (channel IN ('email','whatsapp','linkedin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.email_campaigns
    ADD CONSTRAINT email_campaigns_lead_source_chk CHECK (lead_source IN ('recruiter','demand'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- campaign_emails: extend for multi-channel + demand leads
ALTER TABLE public.campaign_emails
  ADD COLUMN IF NOT EXISTS demand_lead_id uuid,
  ADD COLUMN IF NOT EXISTS to_phone text,
  ADD COLUMN IF NOT EXISTS to_linkedin text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

ALTER TABLE public.campaign_emails ALTER COLUMN email_to DROP NOT NULL;
ALTER TABLE public.campaign_emails ALTER COLUMN subject DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.campaign_emails
    ADD CONSTRAINT campaign_emails_channel_chk CHECK (channel IN ('email','whatsapp','linkedin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS campaign_emails_campaign_channel_status_idx
  ON public.campaign_emails (campaign_id, channel, status);

-- Allow team members (not only admins) to insert/update campaigns + recipients
DROP POLICY IF EXISTS "team insert email_campaigns" ON public.email_campaigns;
CREATE POLICY "team insert email_campaigns"
  ON public.email_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "team update email_campaigns" ON public.email_campaigns;
CREATE POLICY "team update email_campaigns"
  ON public.email_campaigns FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "team insert campaign_emails" ON public.campaign_emails;
CREATE POLICY "team insert campaign_emails"
  ON public.campaign_emails FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "team update campaign_emails" ON public.campaign_emails;
CREATE POLICY "team update campaign_emails"
  ON public.campaign_emails FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid()));