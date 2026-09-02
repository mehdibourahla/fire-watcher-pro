begin;
set local search_path = public, extensions;
select plan(4);

select has_column('public', 'broadcasts', 'push_codes', 'push_codes exists');
select has_column('public', 'broadcasts', 'inside_codes', 'inside_codes exists');
select col_not_null('public', 'broadcasts', 'push_codes', 'push_codes is not null');
select col_default_is('public', 'broadcasts', 'inside_codes', '{}', 'inside_codes defaults to empty');

select * from finish();
rollback;
