begin;
set local search_path = public, extensions;
select plan(21);

select set_config('test.day', ((now() at time zone 'UTC')::date - 100)::text, true);
create temp view old_day as select current_setting('test.day')::date as day,
  current_setting('test.day')::timestamp at time zone 'UTC' + interval '6 hours' as at;

insert into public.broadcast_audit (id, at, action, reason) select v.id, o.at, 'suppressed', 'fixture'
from old_day o, (values ('20000000-0000-4000-8000-000000000001'::uuid), ('20000000-0000-4000-8000-000000000002'::uuid)) v(id);
insert into public.broadcast_audit (id, at, action, reason)
values ('20000000-0000-4000-8000-000000000003', now(), 'suppressed', 'fixture');

insert into public.source_contracts (key, version, label, family, criticality, freshness_basis, cadence_minutes,
  warning_after_minutes, stale_after_minutes, parser_version, licence, attribution, owner)
values ('test.cold', 1, 'Cold fixture', 'reference_enrichment', 'optional', 'last_success_at', 5, 10, 20, '1', 'test', 'test', 'test');
insert into public.source_runs (id, contract_key, contract_version, trigger_kind, idempotency_key, scheduled_for, started_at, finished_at, outcome, records_seen)
select v.id, 'test.cold', 1, 'manual', v.key, o.at, o.at, o.at + interval '1 minute', v.outcome, 1
from old_day o, (values
  ('20000000-0000-4000-8000-000000000011'::uuid, 'cold-old', 'succeeded'),
  ('20000000-0000-4000-8000-000000000012'::uuid, 'cold-referenced', 'succeeded'),
  ('20000000-0000-4000-8000-000000000013'::uuid, 'cold-running', 'running')) v(id, key, outcome);
insert into public.source_gaps (contract_key, data_from, data_through, state, resolved_by_run_id)
select 'test.cold', o.at - interval '1 hour', o.at, 'resolved', '20000000-0000-4000-8000-000000000012' from old_day o;

insert into public.risk_publications (snapshot_id, base_date, scheduled_for, published_at, row_count)
select v.id, o.day, o.at + v.shift, o.at, 1 from old_day o, (values
  ('20000000-0000-4000-8000-000000000021'::uuid, interval '0 hours'),
  ('20000000-0000-4000-8000-000000000022'::uuid, interval '1 hour')) v(id, shift);
insert into public.risk_publication_checkpoint (key, snapshot_id, base_date, scheduled_for, published_at)
select 'local_fwi', '20000000-0000-4000-8000-000000000022', o.day, o.at + interval '1 hour', o.at from old_day o
on conflict (key) do update set snapshot_id = excluded.snapshot_id, base_date = excluded.base_date,
  scheduled_for = excluded.scheduled_for, published_at = excluded.published_at;
insert into public.risk_forecasts (id, snapshot_id, commune_id, forecast_date, horizon_days, source, fwi, danger_level, created_at)
select v.id, v.snapshot, (select id from public.admin_units where level = 'commune' limit 1), o.day, 0, 'local_fwi', 10, 1, o.at
from old_day o, (values
  ('20000000-0000-4000-8000-000000000031'::uuid, '20000000-0000-4000-8000-000000000021'::uuid),
  ('20000000-0000-4000-8000-000000000032'::uuid, '20000000-0000-4000-8000-000000000022'::uuid)) v(id, snapshot);

create temp table digests as
select t, count(*) as n, md5(string_agg(id::text, ',' order by id::text collate "C")) as digest
from (select 'broadcast_audit' as t, id from private.cold_candidates('broadcast_audit', current_setting('test.day')::date)
      union all select 'source_runs', id from private.cold_candidates('source_runs', current_setting('test.day')::date)
      union all select 'risk_forecasts', id from private.cold_candidates('risk_forecasts', current_setting('test.day')::date)) c
group by t;
grant select on digests to service_role;

select is((select n from digests where t = 'broadcast_audit'), 2::bigint, 'only the old day''s audit rows are candidates');
select is((select n from digests where t = 'source_runs'), 1::bigint, 'a run that resolved a gap, or still runs, stays hot');
select is((select n from digests where t = 'risk_forecasts'), 1::bigint, 'the published snapshot stays hot');

select throws_ok($$delete from public.broadcast_audit where id = '20000000-0000-4000-8000-000000000001'$$,
  'P0001', 'broadcast_audit is append-only', 'an audit row cannot leave before its day is archived');

set local role service_role;
select ok(current_setting('test.day')::date in (select public.cold_pending_days('broadcast_audit')), 'an old day is pending');
select throws_ok($$select public.cold_archive_commit('broadcast_audit', (now() at time zone 'UTC')::date - 10, 0, null, null, null, null)$$,
  '22023', 'cold_day_still_hot', 'a hot day is never archived, whatever the caller sends');
select throws_ok(format($$select public.cold_archive_commit('broadcast_audit', %L, 3, %L, %L, 10, %L)$$,
    current_setting('test.day'), (select digest from digests where t = 'broadcast_audit'), repeat('a', 64),
    'cold/broadcast_audit/' || to_char(current_setting('test.day')::date, 'YYYY/MM/DD') || '.parquet'),
  'P0001', 'cold_export_mismatch', 'a count that disagrees with the database deletes nothing');
select throws_ok(format($$select public.cold_archive_commit('broadcast_audit', %L, 2, %L, %L, 10, %L)$$,
    current_setting('test.day'), md5('other rows'), repeat('a', 64),
    'cold/broadcast_audit/' || to_char(current_setting('test.day')::date, 'YYYY/MM/DD') || '.parquet'),
  'P0001', 'cold_export_mismatch', 'the same count of other rows deletes nothing');
select throws_ok(format($$select public.cold_archive_commit('broadcast_audit', %L, 2, %L, %L, 10, 'cold/elsewhere.parquet')$$,
    current_setting('test.day'), (select digest from digests where t = 'broadcast_audit'), repeat('a', 64)),
  '23514', null, 'the file path follows the archive layout');
reset role;
select is((select count(*) from public.broadcast_audit where reason = 'fixture'), 3::bigint, 'failed commits deleted nothing');
select is((select count(*) from public.cold_exports where day = current_setting('test.day')::date), 0::bigint,
  'failed commits left no manifest');

set local role service_role;
select is(public.cold_archive_commit('broadcast_audit', current_setting('test.day')::date, 2,
    (select digest from digests where t = 'broadcast_audit'), repeat('a', 64), 10,
    'cold/broadcast_audit/' || to_char(current_setting('test.day')::date, 'YYYY/MM/DD') || '.parquet'),
  2::bigint, 'a proven day leaves the database');
select public.cold_archive_commit('source_runs', current_setting('test.day')::date, 1,
  (select digest from digests where t = 'source_runs'), repeat('b', 64), 10,
  'cold/source_runs/' || to_char(current_setting('test.day')::date, 'YYYY/MM/DD') || '.parquet');
select public.cold_archive_commit('risk_forecasts', current_setting('test.day')::date, 1,
  (select digest from digests where t = 'risk_forecasts'), repeat('c', 64), 10,
  'cold/risk_forecasts/' || to_char(current_setting('test.day')::date, 'YYYY/MM/DD') || '.parquet');
select ok(current_setting('test.day')::date not in (select public.cold_pending_days('broadcast_audit')), 'an archived day is no longer pending');
select throws_ok(format($$select public.cold_archive_commit('broadcast_audit', %L, 0, null, null, null, null)$$, current_setting('test.day')),
  '23505', null, 'a day is archived once');
reset role;

select is((select count(*) from public.broadcast_audit where reason = 'fixture'), 1::bigint, 'today''s audit row stays');
select throws_ok($$update public.broadcast_audit set reason = 'rewritten' where id = '20000000-0000-4000-8000-000000000003'$$,
  'P0001', 'broadcast_audit is append-only', 'audit rows are still never rewritten');
select is((select array_agg(idempotency_key order by idempotency_key) from public.source_runs where contract_key = 'test.cold'),
  array['cold-referenced', 'cold-running'], 'only the unreferenced finished run left');
select is((select count(*) from public.source_run_retired_keys where idempotency_key = 'cold-old'), 1::bigint,
  'an archived run''s key can never be replayed');
select is((select array_agg(id) from public.risk_forecasts where id in ('20000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000032')),
  array['20000000-0000-4000-8000-000000000032'::uuid], 'the current publication survives archiving');

select ok(not has_function_privilege('authenticated', 'public.cold_archive_commit(text,date,bigint,text,text,bigint,text)', 'execute'),
  'users cannot archive evidence');
select ok(has_function_privilege('cold_reader', 'private.cold_candidates(text,date)', 'execute')
  and not has_table_privilege('cold_reader', 'public.broadcast_audit', 'delete'), 'the export login reads and never deletes');

select * from finish();
rollback;
