begin;
set local search_path = public, extensions;
select plan(5);

insert into auth.users(id,email) values ('2a000000-0000-4000-8000-000000000001','zone-owner@example.invalid');

insert into zones(id,user_id,name,lat,lon)
select '2a000000-0000-4000-8000-000000000010','2a000000-0000-4000-8000-000000000001','Home',u.lat,u.lon
from admin_units u where u.level='commune' and u.code='1601';
select is((select u.code from zones z join admin_units u on u.id=z.commune_id where z.id='2a000000-0000-4000-8000-000000000010'),
  '1601','a zone placed without a commune gets the nearest one, so danger forecasts can reach it');

insert into zones(id,user_id,name,lat,lon) values
  ('2a000000-0000-4000-8000-000000000011','2a000000-0000-4000-8000-000000000001','Abroad',45.0,2.0);
select is((select commune_id from zones where id='2a000000-0000-4000-8000-000000000011'),null,
  'a point outside Algeria stays without a commune');

update zones z set lat=u.lat, lon=u.lon from admin_units u
where z.id='2a000000-0000-4000-8000-000000000010' and u.level='commune' and u.code='0901';
select is((select u.code from zones z join admin_units u on u.id=z.commune_id where z.id='2a000000-0000-4000-8000-000000000010'),
  '0901','moving a zone follows it to its new commune');

insert into zones(id,user_id,name,lat,lon,commune_id)
select '2a000000-0000-4000-8000-000000000012','2a000000-0000-4000-8000-000000000001','Chosen',36.767696,3.060699,u.id
from admin_units u where u.level='commune' and u.code='1501';
select is((select u.code from zones z join admin_units u on u.id=z.commune_id where z.id='2a000000-0000-4000-8000-000000000012'),
  '1501','an explicitly chosen commune is kept');

select is(nearest_commune(36.2,-12.0),null,'the Atlantic has no commune');

select * from finish();
rollback;
