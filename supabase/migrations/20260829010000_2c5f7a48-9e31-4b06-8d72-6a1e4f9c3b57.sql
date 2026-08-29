-- One CAP object per fire event, so every future channel (push, SMS, Telegram,
-- email, cell broadcast) renders the same approved warning instead of inventing
-- its own payload. Signing and approval chains are deliberately out of scope.
CREATE TABLE public.cap_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL UNIQUE,
  sender text NOT NULL,
  sent timestamp with time zone NOT NULL,
  status text NOT NULL CHECK (status IN ('Actual','Exercise','System','Test','Draft')),
  msg_type text NOT NULL CHECK (msg_type IN ('Alert','Update','Cancel','Ack','Error')),
  scope text NOT NULL CHECK (scope IN ('Public','Restricted','Private')),
  cluster_id uuid REFERENCES public.fire_clusters(id) ON DELETE SET NULL,
  info jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX cap_alerts_sent_idx ON public.cap_alerts (sent DESC);
CREATE INDEX cap_alerts_cluster_idx ON public.cap_alerts (cluster_id);

ALTER TABLE public.alerts
  ADD COLUMN cap_alert_id uuid REFERENCES public.cap_alerts(id) ON DELETE SET NULL;

GRANT SELECT ON public.cap_alerts TO anon, authenticated;
GRANT ALL ON public.cap_alerts TO service_role;

ALTER TABLE public.cap_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read cap_alerts" ON public.cap_alerts FOR SELECT TO anon, authenticated USING (true);
