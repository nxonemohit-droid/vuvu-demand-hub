
CREATE TABLE IF NOT EXISTS public.discovery_query_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('keyword','domain','country_trade')),
  token text NOT NULL,
  zero_result_count int NOT NULL DEFAULT 0,
  hit_count int NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, token)
);

ALTER TABLE public.discovery_query_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can read discovery stats"
  ON public.discovery_query_stats FOR SELECT
  USING (public.is_team_member(auth.uid()));
