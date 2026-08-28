-- Report photo storage: owner-scoped folders in the private "report-photos" bucket
CREATE POLICY "report photos owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'report-photos' AND owner = auth.uid());

CREATE POLICY "report photos moderator read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'report-photos'
  AND (public.has_role(auth.uid(), 'moderator'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

CREATE POLICY "report photos owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'report-photos'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "report photos owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'report-photos' AND owner = auth.uid())
WITH CHECK (bucket_id = 'report-photos' AND owner = auth.uid());

CREATE POLICY "report photos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report-photos' AND owner = auth.uid());

-- Admins need to see member profiles to manage roles
CREATE POLICY "admins read all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));