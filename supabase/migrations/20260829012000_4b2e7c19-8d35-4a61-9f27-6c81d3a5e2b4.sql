-- user_roles was readable in full by any authenticated user, which enumerates the
-- moderators and admins. Own rows plus admin covers both readers in src/lib/roles.ts.
drop policy if exists "roles readable by authenticated" on public.user_roles;

create policy "own roles or admin read"
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
