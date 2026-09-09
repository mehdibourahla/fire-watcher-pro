alter table public.citizen_reports drop constraint citizen_reports_reviewed_by_fkey;
alter table public.citizen_reports add constraint citizen_reports_reviewed_by_fkey foreign key (reviewed_by) references auth.users(id) on delete set null not valid;

create function public.anonymize_deleted_account_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_audit set actor_user_id=null, actor_kind='system', actor_label='deleted account', before=null, after=null, reason=null where actor_user_id=old.id;
  return old;
end;
$$;
revoke all on function public.anonymize_deleted_account_audit() from public, anon, authenticated, service_role;
create trigger anonymize_account_audit_before_delete before delete on auth.users for each row execute function public.anonymize_deleted_account_audit();
