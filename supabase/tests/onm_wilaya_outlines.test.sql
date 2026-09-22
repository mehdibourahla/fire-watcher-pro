begin;
set local search_path = public, extensions;
select plan(4);

insert into public.admin_units(id, level, code, name_ar, name_fr, name_en, lat, lon) values
 ('61000000-0000-4000-8000-000000000001','wilaya','T61','ت','Outline test','Outline test',36,3);
insert into public.onm_vigilance(cap_id,title,event,severity,urgency,certainty,sent,area_desc,wilaya_id,polygon,cap_detail_fetched_at) values
 ('outline-old','Rain','Rain','Severe','Immediate','Observed',now()-interval '2 days','T','61000000-0000-4000-8000-000000000001','[[3,36],[3.1,36],[3.1,36.1],[3,36]]',now()-interval '2 days'),
 ('outline-new','Rain','Rain','Severe','Immediate','Observed',now(),'T','61000000-0000-4000-8000-000000000001','[[3,36],[3.2,36],[3.2,36.2],[3,36]]',now()),
 ('outline-none','Rain','Rain','Severe','Immediate','Observed',now(),'T','61000000-0000-4000-8000-000000000001',null,null);

select is((select count(*) from public.onm_wilaya_outlines where wilaya_id='61000000-0000-4000-8000-000000000001'),1::bigint,'one outline per wilaya');
select is((select polygon->1->>0 from public.onm_wilaya_outlines where wilaya_id='61000000-0000-4000-8000-000000000001'),'3.2','the most recently fetched outline wins');
set local role anon;
select is((select count(*) from public.onm_wilaya_outlines where wilaya_id='61000000-0000-4000-8000-000000000001'),1::bigint,'visitors can read outlines');
reset role;
select ok(not exists(select 1 from public.onm_wilaya_outlines where polygon is null),'no empty outline');

select * from finish();
rollback;
