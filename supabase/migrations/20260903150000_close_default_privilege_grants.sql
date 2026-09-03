-- Supabase's default-privilege trigger grants anon/authenticated ALL on every new
-- relation regardless of what the migration itself asks for. Two objects only ever
-- meant to grant SELECT (or nothing) ended up with live INSERT/UPDATE/DELETE/TRUNCATE
-- too. hazard_reports is the serious one: it's a bypassrls view over citizen_reports
-- (security_invoker = false, owner postgres), so a write through it skips every RLS
-- policy on the base table.
revoke insert, update, delete, truncate
  on public.hazard_reports
  from anon, authenticated;

alter view public.hazard_reports set (security_barrier = true);

revoke all
  on public.telegram_channels
  from anon, authenticated;

-- The insert policy pins uploads to the owner's own folder; the update policy's
-- WITH CHECK never did, so an owner could rename an object out of their own prefix.
alter policy "report photos owner update"
  on storage.objects
  with check (
    bucket_id = 'report-photos'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
