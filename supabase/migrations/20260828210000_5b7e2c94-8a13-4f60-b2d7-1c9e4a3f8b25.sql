-- Spec 9.2: carry the FWI moisture codes day to day.
-- Recomputing a 92-day spin-up for 1536 communes on every run exceeds the
-- Open-Meteo free-tier quota; persisting state lets a run advance with only a
-- few days of weather.
CREATE TABLE IF NOT EXISTS public.fwi_state (
  commune_id uuid NOT NULL REFERENCES public.admin_units(id) ON DELETE CASCADE,
  date date NOT NULL,
  ffmc double precision NOT NULL,
  dmc double precision NOT NULL,
  dc double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (commune_id, date)
);

CREATE INDEX IF NOT EXISTS fwi_state_commune_date_idx
  ON public.fwi_state (commune_id, date DESC);

GRANT SELECT ON public.fwi_state TO anon, authenticated;
GRANT ALL ON public.fwi_state TO service_role;
ALTER TABLE public.fwi_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read fwi_state"
  ON public.fwi_state FOR SELECT TO anon, authenticated USING (true);
