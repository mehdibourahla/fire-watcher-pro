-- Adekar is the chef-lieu of its own daïra in Béjaïa (ONS 0624); OSM parented it to the
-- neighbouring Tizi Ouzou, so DGPC bulletins naming it never resolved
update public.admin_units
set parent_id = (select id from public.admin_units where level = 'wilaya' and code = '06')
where level = 'commune' and code = '0624';
