insert into public.source_contracts (
  key, version, label, family, criticality, freshness_basis,
  cadence_minutes, warning_after_minutes, stale_after_minutes, max_fallback_age_minutes,
  expected_coverage, parser_version, dependency_keys, licence, attribution, owner,
  enabled, schedule_enabled, schedule_offset_minutes, execution_target,
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
) values (
  'ita_facebook', 1, 'Info Trafic Algérie — Facebook page', 'civil_information', 'supporting',
  'last_success_at',
  15, 45, 90, null,
  '{"kind":"poll"}'::jsonb, 'ita-apify-v1', '{}', 'Public Facebook page; publisher rights retained',
  'Info Trafic Algérie — ITA', 'Nadhir maintainers',
  true, true, 2, 'cloudflare',
  300, 3, 120, 30,
  5, 'none', null
);

create function public.assert_ita_facebook_lease(_job uuid, _attempt integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.source_job_leases
    where contract_key='ita_facebook' and job_id=_job and attempt=_attempt
      and lease_expires_at > clock_timestamp() for update;
  if not found then
    raise exception using errcode='55000', message='ita_source_lease_lost';
  end if;
end;
$$;
revoke all on function public.assert_ita_facebook_lease(uuid,integer) from public, anon, authenticated;
grant execute on function public.assert_ita_facebook_lease(uuid,integer) to service_role;

create function public.save_ita_facebook_posts(_job uuid, _attempt integer, _posts jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare _inserted integer := 0; _identity text;
begin
  perform public.assert_ita_facebook_lease(_job,_attempt);
  for _identity in select distinct p->>'source_page' || ':' || (p->>'source_post_id') from jsonb_array_elements(_posts) p order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(_identity,0));
  end loop;
  insert into public.ita_reports(source_post_id,source_page,source_url,published_at,content_hash,body,raw)
  select distinct on (p.source_page,p.source_post_id,p.body)
      p.source_post_id,p.source_page,p.source_url,p.published_at,p.content_hash,p.body,p.raw
    from jsonb_to_recordset(_posts) as p(source_post_id text,source_page text,source_url text,published_at timestamptz,content_hash text,body text,raw jsonb)
    where not exists(select 1 from public.ita_reports r
      where r.source_page=p.source_page and r.source_post_id=p.source_post_id and r.body=p.body)
    on conflict(source_page,source_post_id,content_hash) do nothing;
  get diagnostics _inserted = row_count;
  return _inserted;
end;
$$;
revoke all on function public.save_ita_facebook_posts(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_ita_facebook_posts(uuid,integer,jsonb) to service_role;

create or replace function public.save_ita_feed(_job uuid, _attempt integer, _posts jsonb, _etag text, _not_modified boolean)
returns integer language plpgsql security invoker set search_path = '' as $$
declare _inserted integer := 0; _identity text;
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  if not _not_modified then
    for _identity in select distinct p->>'source_page' || ':' || (p->>'source_post_id') from jsonb_array_elements(_posts) p order by 1 loop
      perform pg_advisory_xact_lock(hashtextextended(_identity,0));
    end loop;
    insert into public.ita_reports(source_post_id,source_page,source_url,published_at,content_hash,body,raw)
    select distinct on (p.source_page,p.source_post_id,p.body)
        p.source_post_id,p.source_page,p.source_url,p.published_at,p.content_hash,p.body,p.raw
      from jsonb_to_recordset(_posts) as p(source_post_id text,source_page text,source_url text,published_at timestamptz,content_hash text,body text,raw jsonb)
      where not exists(select 1 from public.ita_reports r
        where r.source_page=p.source_page and r.source_post_id=p.source_post_id and r.body=p.body)
      on conflict(source_page,source_post_id,content_hash) do nothing;
    get diagnostics _inserted = row_count;
    update public.ita_feed_state set etag=_etag,checked_at=clock_timestamp() where singleton;
  else
    update public.ita_feed_state set checked_at=clock_timestamp() where singleton;
  end if;
  return _inserted;
end;
$$;
