begin;
set local search_path = public, extensions;
select plan(7);

insert into public.fire_clusters(id, short_id, state, first_detected_at, last_detected_at, lat, lon, resolved_at, resolution_note)
values ('7d000000-0000-4000-8000-000000000001','DZPRIV1','extinguished',now()-interval '2 hours',now()-interval '1 hour',36.7,4.0,now(),'call from the unit chief');

set local role anon;
select is((select state from public.fire_clusters where short_id='DZPRIV1'),'extinguished','visitors still read a fire');
select is((select resolved_at is not null from public.fire_clusters where short_id='DZPRIV1'),true,'visitors still see that an operator closed it');
select throws_ok($$select resolved_by from public.fire_clusters$$,'42501',null,'visitors cannot learn which operator closed a fire');
select throws_ok($$select resolution_note from public.fire_clusters$$,'42501',null,'visitors cannot read an operator''s note');
reset role;

set local role authenticated;
select throws_ok($$select resolved_by from public.fire_clusters$$,'42501',null,'signed-in users cannot learn which operator closed a fire');
select throws_ok($$select resolution_note from public.fire_clusters$$,'42501',null,'signed-in users cannot read an operator''s note');
reset role;

set local role service_role;
select is((select resolution_note from public.fire_clusters where short_id='DZPRIV1'),'call from the unit chief','the server still reads everything');
reset role;

select * from finish();
rollback;
