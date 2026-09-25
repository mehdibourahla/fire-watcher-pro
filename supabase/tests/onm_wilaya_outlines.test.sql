begin;
set local search_path = public, extensions;
select plan(7);

insert into public.admin_units(id, level, code, name_ar, name_fr, name_en, lat, lon) values
 ('61000000-0000-4000-8000-000000000001','wilaya','T61','ت','Outline test','Outline test',36,3);
insert into public.onm_vigilance(id,cap_id,title,event,severity,urgency,certainty,sent,area_desc,wilaya_id) values
 ('61000000-0000-4000-8000-000000000011','outline-old','Rain','Rain','Severe','Immediate','Observed',now()-interval '2 days','T','61000000-0000-4000-8000-000000000001'),
 ('61000000-0000-4000-8000-000000000012','outline-new','Rain','Rain','Severe','Immediate','Observed',now(),'T','61000000-0000-4000-8000-000000000001'),
 ('61000000-0000-4000-8000-000000000013','outline-same','Wind','Wind','Severe','Immediate','Observed',now()-interval '1 day','T','61000000-0000-4000-8000-000000000001'),
 ('61000000-0000-4000-8000-000000000014','outline-none','Rain','Rain','Severe','Immediate','Observed',now(),'T','61000000-0000-4000-8000-000000000001');

set local role service_role;
select public.store_onm_detail('61000000-0000-4000-8000-000000000011','h',null,'[[3,36],[3.1,36],[3.1,36.1],[3,36]]');
select public.store_onm_detail('61000000-0000-4000-8000-000000000012','h',null,'[[3,36],[3.2,36],[3.2,36.2],[3,36]]');
select public.store_onm_detail('61000000-0000-4000-8000-000000000013','h',null,'[[3,36], [3.2,36], [3.2,36.2], [3,36]]');
select public.store_onm_detail('61000000-0000-4000-8000-000000000014','h',null,null);
reset role;

select is((select count(distinct area_id) from public.onm_vigilance where wilaya_id='61000000-0000-4000-8000-000000000001'),2::bigint,
  'a repeated outline is stored once, whatever its spacing');
select is((select cap_detail_fetched_at is not null and area_id is null from public.onm_vigilance where cap_id='outline-none'),true,
  'a CAP without polygon is completed with no area');
select is((select count(*) from public.onm_wilaya_outlines where wilaya_id='61000000-0000-4000-8000-000000000001'),1::bigint,'one outline per wilaya');
select is((select polygon->1->>0 from public.onm_wilaya_outlines where wilaya_id='61000000-0000-4000-8000-000000000001'),'3.2','the latest outline wins');

set local role anon;
select is((select count(*) from public.onm_wilaya_outlines where wilaya_id='61000000-0000-4000-8000-000000000001'),1::bigint,'visitors can read outlines');
select throws_ok($$select public.store_onm_detail('61000000-0000-4000-8000-000000000014','forged',null,null)$$,'42501',null,
  'visitors cannot write warning details');
reset role;

set local role service_role;
select throws_ok($$select public.store_onm_detail(gen_random_uuid(),'h',null,null)$$,'P0002','onm_warning_not_found',
  'a detail for an unknown warning fails loudly');
reset role;

select * from finish();
rollback;
