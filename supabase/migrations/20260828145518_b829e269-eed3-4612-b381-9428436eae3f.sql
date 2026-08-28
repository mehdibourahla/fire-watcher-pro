CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  kinds text[] NOT NULL DEFAULT ARRAY['fire','risk']::text[],
  min_severity smallint NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  last_status integer,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhook endpoints" ON public.webhook_endpoints
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.alerts(id) ON DELETE SET NULL,
  status_code integer,
  ok boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhook deliveries read" ON public.webhook_deliveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX webhook_deliveries_endpoint_idx ON public.webhook_deliveries (endpoint_id, created_at DESC);

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS delivered_webhook boolean NOT NULL DEFAULT false;

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
  IF recent >= 12 THEN
    RAISE EXCEPTION 'Daily report limit reached (12 per 24 hours)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER citizen_reports_rate_limit
  BEFORE INSERT ON public.citizen_reports
  FOR EACH ROW EXECUTE FUNCTION public.limit_citizen_reports();