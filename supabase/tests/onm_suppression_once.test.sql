begin;
set local search_path = public, extensions;
select plan(2);

insert into public.broadcast_audit (action, reason, kind, onm_vigilance_id)
select 'suppressed', 'onm_duplicate', 'onm', '22000000-0000-4000-8000-000000000001' from generate_series(1, 1200);

set local role service_role;
select is((select array_agg(x) from public.onm_suppressions_logged(array['22000000-0000-4000-8000-000000000001', gen_random_uuid()]) x),
  array['22000000-0000-4000-8000-000000000001'::uuid], 'a warning logged 1,200 times comes back once');
reset role;
select ok(not has_function_privilege('anon', 'public.onm_suppressions_logged(uuid[])', 'execute'), 'visitors cannot read the audit through it');

select * from finish();
rollback;
