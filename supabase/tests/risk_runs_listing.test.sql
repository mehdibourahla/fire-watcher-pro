begin;
set local search_path = public, extensions;
select plan(4);

insert into auth.users(id,email) values
 ('1f000000-0000-4000-8000-000000000001','risk-operator@example.invalid'),
 ('1f000000-0000-4000-8000-000000000002','risk-member@example.invalid');
insert into user_roles(user_id,role) values ('1f000000-0000-4000-8000-000000000001','operator');
insert into risk_forecast_snapshot_runs(snapshot_id,base_date,scheduled_for,status)
values ('1f000000-0000-4000-8000-000000000010',current_date,now(),'active');

set local role authenticated;
select set_config('request.jwt.claim.sub','1f000000-0000-4000-8000-000000000002',true);
select throws_ok($$select * from list_risk_snapshot_runs()$$,'42501',null,'a member cannot list snapshot runs');
select throws_ok($$select * from risk_forecast_snapshot_runs$$,'42501',null,'the table itself stays closed to clients');

select set_config('request.jwt.claim.sub','1f000000-0000-4000-8000-000000000001',true);
select is((select count(*) from list_risk_snapshot_runs() where snapshot_id='1f000000-0000-4000-8000-000000000010'),1::bigint,'an operator sees the run awaiting a decision');
select is((select status from list_risk_snapshot_runs() where snapshot_id='1f000000-0000-4000-8000-000000000010'),'active','the run keeps its lifecycle status');
reset role;

select * from finish();
rollback;
