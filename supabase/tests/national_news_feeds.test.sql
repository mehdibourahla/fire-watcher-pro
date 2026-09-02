begin;
set local search_path = public, extensions;
select plan(4);

select is(
  (select count(*)::integer from public.text_sources where kind = 'rss' and authority_tier = 'media' and enabled),
  8,
  'eight national press feeds are registered as media-tier RSS sources'
);
select is(
  (select count(*)::integer from public.source_contracts c join public.text_sources t on t.key = c.key
    where t.kind = 'rss' and c.family = 'official_text' and c.execution_target = 'cloudflare' and c.schedule_enabled),
  8,
  'each feed has a scheduled Worker contract'
);
select is(
  (select count(*)::integer from public.source_checkpoints where contract_key like 'rss\_%'),
  8,
  'each feed has a checkpoint row'
);
select is(
  (select count(*)::integer from public.text_sources where wilaya_id is not null),
  0,
  'no text source is scoped to a wilaya: sources stay national'
);

select * from finish();
rollback;
