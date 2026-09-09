insert into storage.buckets(id,name,public,file_size_limit)
values('source-archive','source-archive',false,33554432);

create policy source_archive_admin_read on storage.objects for select to authenticated
using(bucket_id='source-archive' and public.has_role((select auth.uid()),'admin'));

create table public.source_captures (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check(source_key ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  endpoint text not null check(endpoint ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  source_origin text not null check(source_origin ~ '^https?://[^/@?#[:space:]]+$'),
  request_params jsonb not null default '{}'::jsonb check(jsonb_typeof(request_params)='object'),
  requested_at timestamptz not null,
  fetched_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  http_status integer check(http_status between 100 and 599),
  status text not null check(status in ('captured','not_modified','failed')),
  error_code text check(error_code in ('network_error','body_read_failed','body_too_large','storage_failed')),
  sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text,
  media_type text,
  byte_length bigint check(byte_length>=0),
  response_headers jsonb not null default '{}'::jsonb
    check(jsonb_typeof(response_headers)='object' and response_headers-array['etag','last-modified','date']='{}'::jsonb),
  job_id uuid,
  attempt integer check(attempt>0),
  contract_version integer check(contract_version>0),
  parser_version text,
  code_revision text check(code_revision ~ '^[a-f0-9]{40}$'),
  check (
    (status='captured' and sha256 is not null and storage_path is not null and storage_path='sha256/'||substr(sha256,1,2)||'/'||sha256 and byte_length is not null and byte_length between 0 and 33554432 and http_status is not null and http_status<>304 and error_code is null)
    or (status='not_modified' and http_status is not null and http_status=304 and sha256 is null and storage_path is null and byte_length is not null and byte_length=0 and error_code is null)
    or (status='failed' and error_code is not null and sha256 is null and storage_path is null)
  )
);
create index source_captures_source_time_idx on public.source_captures(source_key,requested_at desc,id);
create index source_captures_time_idx on public.source_captures(requested_at desc,id);
create index source_captures_recorded_idx on public.source_captures(recorded_at,id);
alter table public.source_captures enable row level security;
revoke all on public.source_captures from public,anon,authenticated,service_role;
grant select on public.source_captures to authenticated;
grant select,insert on public.source_captures to service_role;
create policy source_captures_admin_read on public.source_captures for select to authenticated
using(public.has_role((select auth.uid()),'admin'));

-- Rollback: remove collector calls first; retain this bucket/catalog as evidence. Dropping either destroys archive history and requires an export.
