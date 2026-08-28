-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "roles readable by authenticated"
ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Citizen reports
CREATE TABLE public.citizen_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  sighting text NOT NULL DEFAULT 'smoke',
  size_hint text NOT NULL DEFAULT 'small',
  note text,
  photo_url text,
  commune_id uuid REFERENCES public.admin_units(id),
  cluster_id uuid REFERENCES public.fire_clusters(id),
  status text NOT NULL DEFAULT 'pending',
  moderation_note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX citizen_reports_status_idx ON public.citizen_reports (status, observed_at DESC);
CREATE INDEX citizen_reports_user_idx ON public.citizen_reports (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.citizen_reports TO authenticated;
GRANT SELECT ON public.citizen_reports TO anon;
GRANT ALL ON public.citizen_reports TO service_role;

ALTER TABLE public.citizen_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read approved reports"
ON public.citizen_reports FOR SELECT TO anon, authenticated
USING (status = 'approved');

CREATE POLICY "own reports read"
ON public.citizen_reports FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "moderators read all reports"
ON public.citizen_reports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own reports insert"
ON public.citizen_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "own pending reports update"
ON public.citizen_reports FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "own reports delete"
ON public.citizen_reports FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "moderators update reports"
ON public.citizen_reports FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER citizen_reports_updated_at
BEFORE UPDATE ON public.citizen_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();