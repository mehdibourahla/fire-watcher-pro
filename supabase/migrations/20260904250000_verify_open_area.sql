-- open_areas already carries verified_at/by/note; verification arrived as free text in the
-- idea box and was transcribed by hand.
create or replace function public.verify_open_area(
  _area uuid,
  _note text default null,
  _verified boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous public.open_areas;
begin
  if not public.has_any_role(actor, array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'operator_role_required';
  end if;

  select * into previous from public.open_areas where id = _area;
  if not found then
    raise no_data_found using message = 'open_area_not_found';
  end if;

  update public.open_areas
  set
    verified_at = case when _verified then now() else null end,
    verified_by = case when _verified then actor else null end,
    verified_note = case when _verified then _note else null end
  where id = _area;

  perform public.record_admin_audit(
    'places',
    case when _verified then 'open_area.verify' else 'open_area.unverify' end,
    'open_areas',
    _area::text,
    jsonb_build_object('verified_at', previous.verified_at),
    jsonb_build_object('verified', _verified),
    _note
  );
end;
$$;

revoke execute on function public.verify_open_area(uuid, text, boolean) from public, anon;
grant execute on function public.verify_open_area(uuid, text, boolean) to authenticated;
