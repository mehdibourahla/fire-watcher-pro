create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('user','system')),
  actor_label text,
  domain text not null check (domain in
    ('sources','fires','risk','incidents','broadcasts','queues','places','people')),
  action text not null check (char_length(action) between 3 and 80),
  target_table text not null,
  target_id text,
  before jsonb,
  after jsonb,
  reason text,
  constraint admin_audit_actor_shape check (
    (actor_kind = 'user' and actor_user_id is not null)
    or (actor_kind = 'system' and actor_label is not null)
  )
);

create index admin_audit_at_idx on public.admin_audit (at desc);
create index admin_audit_domain_at_idx on public.admin_audit (domain, at desc);
create index admin_audit_actor_at_idx on public.admin_audit (actor_user_id, at desc);

alter table public.admin_audit enable row level security;

create policy "admins read all audit"
on public.admin_audit for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "actors read their own audit"
on public.admin_audit for select to authenticated
using (actor_user_id = auth.uid());

-- Append-only for everyone: no role is granted update or delete, service_role included.
revoke all on table public.admin_audit from public, anon, authenticated, service_role;
grant select on table public.admin_audit to authenticated, service_role;

create or replace function public.record_admin_audit(
  _domain text,
  _action text,
  _target_table text,
  _target_id text default null,
  _before jsonb default null,
  _after jsonb default null,
  _reason text default null,
  _actor_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  new_id uuid;
begin
  insert into public.admin_audit (
    actor_user_id, actor_kind, actor_label, domain, action,
    target_table, target_id, before, after, reason
  )
  values (
    actor,
    case when actor is null then 'system' else 'user' end,
    case when actor is null then coalesce(_actor_label, 'unlabelled') else null end,
    _domain, _action, _target_table, _target_id, _before, _after, _reason
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.record_admin_audit(text,text,text,text,jsonb,jsonb,text,text)
  from public, anon;
grant execute on function public.record_admin_audit(text,text,text,text,jsonb,jsonb,text,text)
  to authenticated, service_role;
