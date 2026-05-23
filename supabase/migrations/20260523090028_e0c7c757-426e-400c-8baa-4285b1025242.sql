
-- 1) recruiter_leads new columns
ALTER TABLE public.recruiter_leads
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS email_enriched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_source text NOT NULL DEFAULT 'missing';

-- backfill email_source from existing data
UPDATE public.recruiter_leads
   SET email_source = CASE
     WHEN contact_email IS NULL OR btrim(contact_email) = '' THEN 'missing'
     WHEN lower(contact_email) IN ('not specified','not provided','unknown','n/a','none') THEN 'missing'
     ELSE 'verified'
   END
 WHERE email_source = 'missing';

-- 2) email_campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  daily_limit integer NOT NULL DEFAULT 100,
  start_date date,
  send_window_start_hour integer NOT NULL DEFAULT 9,
  send_window_end_hour integer NOT NULL DEFAULT 17,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  subject_template text,
  body_template text,
  resend_batch_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read email_campaigns"   ON public.email_campaigns FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin insert email_campaigns" ON public.email_campaigns FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update email_campaigns" ON public.email_campaigns FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete email_campaigns" ON public.email_campaigns FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) campaign_emails
CREATE TABLE IF NOT EXISTS public.campaign_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recruiter_id uuid REFERENCES public.recruiter_leads(id) ON DELETE SET NULL,
  email_to text NOT NULL,
  subject text NOT NULL,
  body_html text,
  body_text text,
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz,
  sent_at timestamptz,
  resend_message_id text,
  open_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_emails_campaign ON public.campaign_emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_emails_pending  ON public.campaign_emails(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaign_emails_message  ON public.campaign_emails(resend_message_id);

ALTER TABLE public.campaign_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read campaign_emails"   ON public.campaign_emails FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admin insert campaign_emails" ON public.campaign_emails FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update campaign_emails" ON public.campaign_emails FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete campaign_emails" ON public.campaign_emails FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER campaign_emails_updated_at
  BEFORE UPDATE ON public.campaign_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
