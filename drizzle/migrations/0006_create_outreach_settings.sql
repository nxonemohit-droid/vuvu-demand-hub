CREATE TABLE public.outreach_settings (
  id integer PRIMARY KEY DEFAULT 1,
  recruiter_auto_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'paused',
  pause_reason text,
  gap_seconds integer NOT NULL DEFAULT 60,
  daily_cap integer NOT NULL DEFAULT 150,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_sent_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT outreach_settings_single_row CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.outreach_settings TO authenticated;
GRANT ALL ON public.outreach_settings TO service_role;

ALTER TABLE public.outreach_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can read outreach settings"
  ON public.outreach_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can insert outreach settings"
  ON public.outreach_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Team can update outreach settings"
  ON public.outreach_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.outreach_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;