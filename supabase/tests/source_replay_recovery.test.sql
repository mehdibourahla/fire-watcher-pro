begin;
set local search_path = public, extensions;
select no_plan();

update public.source_gaps set state = 'resolved' where state in ('open', 'replaying');
update public.source_contracts set enabled = true where key = 'fci';
update public.source_contracts set enabled = false where key = 'firms';

insert into public.source_gaps(id, contract_key, data_from, data_through, replay_count, public_reason_code)
values
 ('21100000-0000-4000-8000-000000000001', 'fci', '2026-09-21 10:00Z', '2026-09-21 10:10Z', 1, 'upstream_unreachable'),
 ('21100000-0000-4000-8000-000000000002', 'firms', '2026-09-21 10:10Z', '2026-09-21 10:20Z', 0, 'upstream_unreachable'),
 ('21100000-0000-4000-8000-000000000003', 'fci', '2026-09-21 10:20Z', '2026-09-21 10:30Z', 0, 'upstream_unreachable'),
 ('21100000-0000-4000-8000-000000000004', 'fci', '2026-09-21 10:30Z', '2026-09-21 10:40Z', 3, 'upstream_unreachable'),
 ('21100000-0000-4000-8000-000000000005', 'fci', '2020-01-01 10:30Z', '2020-01-01 10:40Z', 0, 'upstream_unreachable');

insert into public.source_jobs(contract_key, contract_version, trigger_kind, idempotency_key,
 scheduled_for, data_from, data_through, execution_target, enqueued_by, available_at,
 max_attempts, retry_base_seconds, retry_until, gap_id, state)
select 'fci', version, 'replay', 'test:recovery:active', '2026-09-21 10:10Z',
 '2026-09-21 10:00Z', '2026-09-21 10:10Z', execution_target, '{test}', '2026-09-21 12:00Z',
 max_attempts, retry_base_seconds, '2026-09-21 13:00Z', '21100000-0000-4000-8000-000000000001', 'retry_wait'
from public.source_contracts where key = 'fci';

select is(private.replay_open_source_gaps('2026-09-21 12:00Z', 0), 0, 'zero limit changes no gaps');
select is((select state from public.source_gaps where id = '21100000-0000-4000-8000-000000000005'), 'open', 'zero limit does not terminalize');
select is(private.replay_open_source_gaps('2026-09-21 12:00Z', 1), 0, 'expired gap is processed within the bounded limit');
select is((select state from public.source_gaps where id = '21100000-0000-4000-8000-000000000005'), 'unrecoverable', 'expired interval is honestly terminal');
select is(private.replay_open_source_gaps('2026-09-21 12:00Z', 1), 1, 'active and paused gaps cannot starve the next eligible gap');
update public.source_gaps set replay_count = 3 where id = '21100000-0000-4000-8000-000000000001';
select is((select state from public.source_gaps where id = '21100000-0000-4000-8000-000000000001'), 'open', 'active final replay stays eligible to finish');
select is((select state from public.source_gaps where id = '21100000-0000-4000-8000-000000000002'), 'open', 'paused source remains untouched');
select throws_ok($$select public.enqueue_source_replay('21100000-0000-4000-8000-000000000002', '2026-09-21 12:00Z')$$,
 'P0001', 'source contract is paused', 'manual replay cannot bypass pause');
select is(private.replay_open_source_gaps('2026-09-21 12:00Z', 1), 0, 'exhausted gap does not enqueue another replay');
select is((select state from public.source_gaps where id = '21100000-0000-4000-8000-000000000004'), 'unrecoverable', 'exhausted gap leaves the open queue');
select is((select public_reason_code from public.source_gaps where id = '21100000-0000-4000-8000-000000000004'), 'upstream_unreachable', 'terminalization preserves failure provenance');
select is((select resolved_at from public.source_gaps where id = '21100000-0000-4000-8000-000000000004'), null::timestamptz, 'terminal gap is never called resolved');
select is(private.replay_open_source_gaps('2026-09-21 12:00Z', 1000), 0, 'repeated tick creates no duplicate work');
select throws_ok($$select public.enqueue_source_replay('21100000-0000-4000-8000-000000000001', '2030-09-21 12:00Z')$$,
 'P0001', 'source gap already has active work', 'active replay cannot be terminalized by a later manual request');
select is((select state from public.source_gaps where id = '21100000-0000-4000-8000-000000000001'), 'open', 'active gap survives expired replay window');

insert into public.source_gaps(contract_key, data_from, data_through, replay_count, public_reason_code)
select 'fci', '2026-09-21 11:00Z'::timestamptz + make_interval(secs => n),
 '2026-09-21 11:00Z'::timestamptz + make_interval(secs => n + 1), 3, 'coverage_partial'
from generate_series(1, 101) n;
select is(private.replay_open_source_gaps('2026-09-21 12:00Z', 1000000), 0, 'exhausted batch enqueues nothing');
select is((select count(*)::integer from public.source_gaps where public_reason_code = 'coverage_partial'
 and data_from >= '2026-09-21 11:00Z' and data_from < '2026-09-21 11:02Z' and state = 'unrecoverable'),
 100, 'oversized request is capped at 100 gap transitions');

delete from public.source_jobs where execution_target = 'github' and state in ('queued', 'retry_wait');
select vault.create_secret('ghp_test_token', 'github_dispatch_token');
select vault.create_secret('mehdibourahla/fire-watcher-pro', 'github_repo');
update public.source_contracts set enabled = false where key = 'local_fwi';
insert into public.source_jobs(contract_key, contract_version, trigger_kind, idempotency_key,
 scheduled_for, data_from, data_through, execution_target, enqueued_by, available_at,
 max_attempts, retry_base_seconds, retry_until)
select key, version, 'manual', 'test:recovery:paused-dispatch', '2026-09-21 10:00Z',
 '2026-09-20 10:00Z', '2026-09-21 10:00Z', 'github', '{test}', '2026-09-21 10:00Z',
 max_attempts, retry_base_seconds, '2026-09-21 22:00Z'
from public.source_contracts where key = 'local_fwi';
select is(private.dispatch_github_source_jobs('2026-09-21 12:00Z'), 0, 'paused source never dispatches queued GitHub work');
update public.source_contracts set enabled = true where key = 'local_fwi';
select is(private.dispatch_github_source_jobs('2026-09-21 12:00Z'), 1, 'resuming source dispatches preserved work');
select * from finish();
rollback;
