begin;

lock table public.citizen_reports in access exclusive mode;

-- signedPhotoUrl accepted full https:// values until this release; validate would
-- otherwise abort mid-deploy on any surviving row instead of naming the offenders
do $$
declare
  invalid_paths integer;
begin
  select count(*)
  into invalid_paths
  from public.citizen_reports
  where photo_url is not null
    and photo_url !~ (
      '^' || user_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png)$'
    );

  if invalid_paths > 0 then
    raise exception
      'citizen_reports holds % photo_url values that are not owner-scoped storage keys; migrate them before applying this constraint',
      invalid_paths;
  end if;
end;
$$;

alter table public.citizen_reports
  add constraint citizen_reports_photo_key_valid
  check (
    photo_url is null
    or photo_url ~ (
      '^' || user_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png)$'
    )
  ) not valid;

alter table public.citizen_reports
  validate constraint citizen_reports_photo_key_valid;

commit;

-- Rollback drops citizen_reports_photo_key_valid.
