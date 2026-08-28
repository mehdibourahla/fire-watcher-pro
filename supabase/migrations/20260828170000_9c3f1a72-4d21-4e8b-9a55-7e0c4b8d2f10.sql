-- Spec 6 / 7.10: one row per ingestion run, so source health is derived from
-- recorded runs instead of a single overwritten note on data_sources.
CREATE TABLE IF NOT EXISTS public.ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed')),
  records_in integer NOT NULL DEFAULT 0,
  records_new integer NOT NULL DEFAULT 0,
  error text
);

CREATE INDEX IF NOT EXISTS ingest_runs_source_idx
  ON public.ingest_runs (source, started_at DESC);

GRANT SELECT ON public.ingest_runs TO anon, authenticated;
GRANT ALL ON public.ingest_runs TO service_role;
ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read ingest_runs"
  ON public.ingest_runs FOR SELECT TO anon, authenticated USING (true);

-- Spec 7.7: per-user confidence floor for fire alerts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS min_confidence double precision NOT NULL DEFAULT 0.6
  CHECK (min_confidence >= 0 AND min_confidence <= 1);

-- Spec 7.4 / 12.8: admin resolution of a cluster (US-6) with a reason enum.
ALTER TABLE public.fire_clusters
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_reason text
    CHECK (resolution_reason IN ('flare','glint','industry','agri_burn','other'));

CREATE POLICY "moderators resolve clusters"
  ON public.fire_clusters FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

-- Spec 12.6: the citizen report limit is 3 per day, not 12.
CREATE OR REPLACE FUNCTION public.limit_citizen_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent integer;
BEGIN
  SELECT count(*) INTO recent
  FROM public.citizen_reports
  WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours';
  IF recent >= 3 THEN
    RAISE EXCEPTION 'Daily report limit reached (3 per 24 hours)';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.limit_citizen_reports() FROM PUBLIC, anon, authenticated;
