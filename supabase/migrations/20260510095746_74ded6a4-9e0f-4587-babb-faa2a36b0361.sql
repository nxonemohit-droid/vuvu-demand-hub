
CREATE TABLE IF NOT EXISTS public.discovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'recruiter_discover',
  status text NOT NULL DEFAULT 'queued',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discovery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can read discovery jobs"
ON public.discovery_jobs FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Admins can insert discovery jobs"
ON public.discovery_jobs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update discovery jobs"
ON public.discovery_jobs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER discovery_jobs_set_updated_at
BEFORE UPDATE ON public.discovery_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_status_created
ON public.discovery_jobs (status, created_at DESC);
