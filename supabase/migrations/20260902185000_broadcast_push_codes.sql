alter table public.broadcasts
  add column push_codes text[],
  add column inside_codes text[] not null default '{}';

update public.broadcasts set push_codes = commune_codes where push_codes is null;

alter table public.broadcasts alter column push_codes set not null;
