-- Outreach pending mails + pipeline classification + diagnostics support
-- Idempotent: uses IF NOT EXISTS / DO blocks throughout.

-- 1. scheduled_emails: blocking reason + index for the Pending Mails surface
ALTER TABLE public.scheduled_emails
  ADD COLUMN IF NOT EXISTS blocking_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status_send_at
  ON public.scheduled_emails (status, send_at);

-- 2. recruiter_leads: classification + per-lead enrichment status + company link
ALTER TABLE public.recruiter_leads
  ADD COLUMN IF NOT EXISTS normalized_domain text,
  ADD COLUMN IF NOT EXISTS role_classification text,
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS last_signal_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS last_enrichment_error text,
  ADD COLUMN IF NOT EXISTS last_enrichment_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_recruiter_leads_normalized_domain
  ON public.recruiter_leads (normalized_domain);
CREATE INDEX IF NOT EXISTS idx_recruiter_leads_company_id
  ON public.recruiter_leads (company_id);

-- 3. demand_leads: classification (company_id already exists)
ALTER TABLE public.demand_leads
  ADD COLUMN IF NOT EXISTS normalized_domain text,
  ADD COLUMN IF NOT EXISTS role_classification text,
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS last_signal_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_demand_leads_normalized_domain
  ON public.demand_leads (normalized_domain);
CREATE INDEX IF NOT EXISTS idx_demand_leads_company_id
  ON public.demand_leads (company_id);

-- 4. Foreign keys to companies (NOT VALID first to avoid hour-long lock on backfill;
--    then VALIDATE separately). Wrapped in DO so re-runs don't error.
DO $$ BEGIN
  ALTER TABLE public.recruiter_leads
    ADD CONSTRAINT recruiter_leads_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.demand_leads
    ADD CONSTRAINT demand_leads_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Backfill normalized_domain from existing data.
-- Helper inline: strip protocol, www., path, lowercase.
UPDATE public.recruiter_leads
SET normalized_domain = lower(
  regexp_replace(
    regexp_replace(
      coalesce(website, source_url, ''),
      '^https?://(www\.)?', '', 'i'
    ),
    '[/?#].*$', ''
  )
)
WHERE normalized_domain IS NULL
  AND coalesce(website, source_url) IS NOT NULL
  AND length(trim(coalesce(website, source_url))) > 0;

-- Fallback: derive from contact_email domain when website missing
UPDATE public.recruiter_leads
SET normalized_domain = lower(split_part(contact_email, '@', 2))
WHERE normalized_domain IS NULL
  AND contact_email IS NOT NULL
  AND position('@' in contact_email) > 0;

UPDATE public.demand_leads
SET normalized_domain = lower(
  regexp_replace(
    regexp_replace(coalesce(source_url, ''), '^https?://(www\.)?', '', 'i'),
    '[/?#].*$', ''
  )
)
WHERE normalized_domain IS NULL
  AND source_url IS NOT NULL
  AND length(trim(source_url)) > 0;

UPDATE public.demand_leads
SET normalized_domain = lower(split_part(contact_email, '@', 2))
WHERE normalized_domain IS NULL
  AND contact_email IS NOT NULL
  AND position('@' in contact_email) > 0;

-- 6. last_signal_at backfill: use most recent timestamp we have
UPDATE public.recruiter_leads
SET last_signal_at = greatest(coalesce(last_seen_at, discovered_at), coalesce(updated_at, created_at))
WHERE last_signal_at IS NULL;

UPDATE public.demand_leads
SET last_signal_at = greatest(coalesce(posted_at_local, created_at), coalesce(updated_at, created_at))
WHERE last_signal_at IS NULL;

-- 7. Validate FKs now that columns exist (no rows have company_id set yet, so this is instant)
DO $$ BEGIN
  ALTER TABLE public.recruiter_leads VALIDATE CONSTRAINT recruiter_leads_company_id_fkey;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.demand_leads VALIDATE CONSTRAINT demand_leads_company_id_fkey;
EXCEPTION WHEN others THEN NULL; END $$;