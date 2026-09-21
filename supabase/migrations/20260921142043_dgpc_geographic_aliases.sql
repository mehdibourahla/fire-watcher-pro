insert into public.admin_unit_aliases(admin_unit_id,alias_ar,source)
select u.id,v.alias,v.evidence
from (values
  ('1913','عين لقراج','عين الفراج','DGPCDZ/6998; wilayasetif.dz: أولياء التلاميذ بقرية منداس يصنعون الحدث'),
  ('1030','الصهاريج','الصحاريج','DGPCDZ/7012; DGPCDZ/7009')
) v(code,name_ar,alias,evidence)
join public.admin_units u on u.code=v.code and u.name_ar=v.name_ar and u.level='commune'
on conflict do nothing;
