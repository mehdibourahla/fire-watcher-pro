-- DGPC writes Mechroha (Souk Ahras) as مشروحة; the gazetteer has المشروخة
insert into public.admin_unit_aliases (admin_unit_id, alias_ar, source)
select u.id, 'مشروحة', 'dgpc'
from public.admin_units u
where u.name_fr = 'Mechroha' and u.level = 'commune'
on conflict do nothing;
