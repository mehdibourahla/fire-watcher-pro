-- danger-forecast alerts match on zones.commune_id; a zone saved without one never received them
create function public.nearest_commune(_lat double precision,_lon double precision)
returns uuid language sql stable set search_path='' as $$
  select d.id from (
    select u.id, 2*6371*asin(sqrt(
      power(sin(radians(u.lat-_lat)/2),2)
      + cos(radians(_lat))*cos(radians(u.lat))*power(sin(radians(u.lon-_lon)/2),2))) as km
    from public.admin_units u
    where u.level='commune' and u.lat is not null and u.lon is not null
  ) d
  where _lat between 18.9 and 37.2 and _lon between -8.7 and 12 and d.km<=50
  order by d.km, d.id
  limit 1
$$;
revoke all on function public.nearest_commune(double precision,double precision) from public,anon;
grant execute on function public.nearest_commune(double precision,double precision) to authenticated,service_role;

create function public.zones_fill_commune()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.commune_id is null
     or (tg_op='UPDATE' and (new.lat,new.lon) is distinct from (old.lat,old.lon)
         and new.commune_id is not distinct from old.commune_id) then
    new.commune_id := public.nearest_commune(new.lat,new.lon);
  end if;
  return new;
end;
$$;
create trigger zones_fill_commune before insert or update of lat,lon,commune_id on public.zones
  for each row execute function public.zones_fill_commune();

update public.zones set commune_id=public.nearest_commune(lat,lon) where commune_id is null;
