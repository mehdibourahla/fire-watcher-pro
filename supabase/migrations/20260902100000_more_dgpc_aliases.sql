-- spellings seen in DGPC bulletins during the 2026-09-02 OpenRouter evaluation
insert into public.admin_unit_aliases (admin_unit_id, alias_ar, source)
select u.id, v.alias, 'dgpc'
from (values
  ('Texenna', 'تكسانة'),
  ('Bouzguen', 'بوزقن'),
  ('Fenaia Ilmaten', 'فلاين الماثن')
) as v(name_fr, alias)
join public.admin_units u on u.name_fr = v.name_fr and u.level = 'commune'
on conflict do nothing;
