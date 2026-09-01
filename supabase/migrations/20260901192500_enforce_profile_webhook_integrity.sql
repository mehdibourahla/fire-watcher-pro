begin;

lock table public.profiles in access exclusive mode;
lock table public.webhook_endpoints in access exclusive mode;

do $$
declare
  invalid_locale integer;
  invalid_quiet_start integer;
  invalid_quiet_end integer;
  invalid_danger integer;
begin
  select
    count(*) filter (where locale not in ('ar', 'fr', 'en', 'kab')),
    count(*) filter (
      where quiet_hours_start is not null
        and quiet_hours_start not between 0 and 23
    ),
    count(*) filter (
      where quiet_hours_end is not null
        and quiet_hours_end not between 0 and 23
    ),
    count(*) filter (where min_danger_level not between 1 and 5)
  into
    invalid_locale,
    invalid_quiet_start,
    invalid_quiet_end,
    invalid_danger
  from public.profiles;

  if invalid_locale > 0
     or invalid_quiet_start > 0
     or invalid_quiet_end > 0
     or invalid_danger > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'profiles integrity preflight failed: locale=%s, quiet_hours_start=%s, quiet_hours_end=%s, min_danger_level=%s',
        invalid_locale,
        invalid_quiet_start,
        invalid_quiet_end,
        invalid_danger
      );
  end if;
end;
$$;

do $$
declare
  invalid_label_blank integer;
  invalid_label_length integer;
  invalid_kinds_empty integer;
  invalid_kinds_unknown integer;
  invalid_kinds_duplicate integer;
  invalid_severity integer;
begin
  select
    count(*) filter (
      where label !~ U&'[^[:space:]\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    ),
    count(*) filter (where char_length(label) > 60),
    count(*) filter (where cardinality(kinds) = 0),
    count(*) filter (
      where array_position(kinds, null) is not null
         or not (kinds <@ array['fire', 'risk']::text[])
    ),
    count(*) filter (
      where cardinality(kinds) > 2
         or (
           cardinality(kinds) = 2
           and not (kinds @> array['fire', 'risk']::text[])
         )
    ),
    count(*) filter (where min_severity not between 1 and 5)
  into
    invalid_label_blank,
    invalid_label_length,
    invalid_kinds_empty,
    invalid_kinds_unknown,
    invalid_kinds_duplicate,
    invalid_severity
  from public.webhook_endpoints;

  if invalid_label_blank > 0
     or invalid_label_length > 0
     or invalid_kinds_empty > 0
     or invalid_kinds_unknown > 0
     or invalid_kinds_duplicate > 0
     or invalid_severity > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'webhook_endpoints integrity preflight failed: blank_label=%s, long_label=%s, empty_kinds=%s, unknown_kinds=%s, duplicate_kinds=%s, min_severity=%s',
        invalid_label_blank,
        invalid_label_length,
        invalid_kinds_empty,
        invalid_kinds_unknown,
        invalid_kinds_duplicate,
        invalid_severity
      );
  end if;
end;
$$;

alter table public.profiles
  add constraint profiles_locale_valid
    check (locale in ('ar', 'fr', 'en', 'kab')),
  add constraint profiles_quiet_hours_start_valid
    check (quiet_hours_start is null or quiet_hours_start between 0 and 23),
  add constraint profiles_quiet_hours_end_valid
    check (quiet_hours_end is null or quiet_hours_end between 0 and 23),
  add constraint profiles_min_danger_level_valid
    check (min_danger_level between 1 and 5);

alter table public.webhook_endpoints
  add constraint webhook_endpoints_label_nonblank
    check (
      label ~ U&'[^[:space:]\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    ),
  add constraint webhook_endpoints_label_length
    check (char_length(label) <= 60),
  add constraint webhook_endpoints_kinds_nonempty
    check (cardinality(kinds) > 0),
  add constraint webhook_endpoints_kinds_allowed
    check (
      array_position(kinds, null) is null
      and kinds <@ array['fire', 'risk']::text[]
    ),
  add constraint webhook_endpoints_kinds_unique
    check (
      cardinality(kinds) <= 2
      and (
        cardinality(kinds) <> 2
        or kinds @> array['fire', 'risk']::text[]
      )
    ),
  add constraint webhook_endpoints_min_severity_valid
    check (min_severity between 1 and 5);

commit;

-- Rollback drops the ten named CHECK constraints; no row data is rewritten.
