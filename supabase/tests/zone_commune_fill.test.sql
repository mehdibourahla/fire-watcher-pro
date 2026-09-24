begin;
set local search_path = public, extensions;
select plan(5);

-- commune codes differ between the migration seed and the full geo seed, so pick by data, not by code
create temp table picks as
  select id, lat, lon, row_number() over (order by code) as n
  from admin_units where level='commune' and lat is not null and lon is not null
  order by code limit 2;

insert into auth.users(id,email) values ('2a000000-0000-4000-8000-000000000001','zone-owner@example.invalid');

insert into zones(id,user_id,name,lat,lon)
select '2a000000-0000-4000-8000-000000000010','2a000000-0000-4000-8000-000000000001','Home',lat,lon from picks where n=1;
select is((select commune_id from zones where id='2a000000-0000-4000-8000-000000000010'),(select id from picks where n=1),
  'a zone placed without a commune gets the nearest one, so danger forecasts can reach it');

insert into zones(id,user_id,name,lat,lon) values
  ('2a000000-0000-4000-8000-000000000011','2a000000-0000-4000-8000-000000000001','Abroad',45.0,2.0);
select is((select commune_id from zones where id='2a000000-0000-4000-8000-000000000011'),null,
  'a point outside Algeria stays without a commune');

update zones z set lat=p.lat, lon=p.lon from picks p
where z.id='2a000000-0000-4000-8000-000000000010' and p.n=2;
select is((select commune_id from zones where id='2a000000-0000-4000-8000-000000000010'),(select id from picks where n=2),
  'moving a zone follows it to its new commune');

insert into zones(id,user_id,name,lat,lon,commune_id)
select '2a000000-0000-4000-8000-000000000012','2a000000-0000-4000-8000-000000000001','Chosen',a.lat,a.lon,b.id
from picks a, picks b where a.n=1 and b.n=2;
select is((select commune_id from zones where id='2a000000-0000-4000-8000-000000000012'),(select id from picks where n=2),
  'an explicitly chosen commune is kept');

select is(nearest_commune(36.2,-12.0),null,'the Atlantic has no commune');

select * from finish();
rollback;
