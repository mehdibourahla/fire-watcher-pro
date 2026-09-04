create function public.bump_official_incident(_id uuid, _patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.official_incidents as i
  set
    status = coalesce(_patch->>'status', i.status),
    precision = coalesce(_patch->>'precision', i.precision),
    commune_id = coalesce((_patch->>'commune_id')::uuid, i.commune_id),
    authority_tier = coalesce(_patch->>'authority_tier', i.authority_tier),
    place_text = coalesce(_patch->>'place_text', i.place_text),
    first_reported_at = coalesce((_patch->>'first_reported_at')::timestamptz, i.first_reported_at),
    last_reported_at = coalesce((_patch->>'last_reported_at')::timestamptz, i.last_reported_at),
    as_of = coalesce((_patch->>'as_of')::timestamptz, i.as_of),
    latest_mention_id = coalesce((_patch->>'latest_mention_id')::uuid, i.latest_mention_id),
    evidence = coalesce(_patch->>'evidence', i.evidence),
    mention_count = i.mention_count + 1,
    updated_at = now()
  where i.id = _id;
  if not found then
    raise exception using errcode = 'P0002', message = 'official_incident_not_found';
  end if;
end;
$$;

revoke all on function public.bump_official_incident(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bump_official_incident(uuid, jsonb) to service_role;
