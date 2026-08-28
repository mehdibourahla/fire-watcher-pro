CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.zones(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fire','risk')),
  severity smallint NOT NULL DEFAULT 3,
  cluster_id uuid REFERENCES public.fire_clusters(id) ON DELETE SET NULL,
  commune_id uuid REFERENCES public.admin_units(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  distance_km double precision,
  payload jsonb,
  delivered_email boolean NOT NULL DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX alerts_user_created_idx ON public.alerts (user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own alerts read" ON public.alerts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own alerts update" ON public.alerts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own alerts delete" ON public.alerts FOR DELETE TO authenticated USING (auth.uid() = user_id);