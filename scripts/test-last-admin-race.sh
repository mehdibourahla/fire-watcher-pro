#!/usr/bin/env bash
set -euo pipefail

qa_tmp_dir=$(mktemp -d)
qa_snapshot_file="$qa_tmp_dir/user-roles-before.csv"
qa_restored_file="$qa_tmp_dir/user-roles-after.csv"
qa_controller_fifo="$qa_tmp_dir/controller.fifo"
qa_controller_output="$qa_tmp_dir/controller.out"
qa_session_a="$qa_tmp_dir/session-a.out"
qa_session_b="$qa_tmp_dir/session-b.out"
qa_admin_a="f0140000-0000-4000-8000-000000000010"
qa_admin_b="f0140000-0000-4000-8000-000000000011"
qa_psql=(psql -h 127.0.0.1 -p 54822 -U postgres -d postgres -X -v ON_ERROR_STOP=1)
qa_child_pids=()
qa_snapshot_ready=0
qa_fixture_owned=0
qa_controller_open=0
export PGPASSWORD=postgres

terminate_children() {
  local qa_pid

  for qa_pid in "${qa_child_pids[@]}"; do
    if kill -0 "$qa_pid" 2>/dev/null; then
      kill -TERM "$qa_pid" 2>/dev/null || true
    fi
  done

  "${qa_psql[@]}" -qAtc \
    "select pg_terminate_backend(pid) from pg_stat_activity where application_name in ('f014_race_controller', 'f014_race_a', 'f014_race_b') and pid <> pg_backend_pid()" \
    >/dev/null 2>&1 || true

  for qa_pid in "${qa_child_pids[@]}"; do
    wait "$qa_pid" 2>/dev/null || true
  done
}

cleanup() {
  local qa_original_status=$?
  local qa_cleanup_status=0

  trap - EXIT INT TERM HUP
  set +e

  if [[ $qa_controller_open -eq 1 ]]; then
    exec 9>&-
    qa_controller_open=0
  fi
  terminate_children

  if [[ $qa_snapshot_ready -eq 1 ]]; then
    "${qa_psql[@]}" -q <<SQL || qa_cleanup_status=1
begin;
create temp table qa_user_roles_snapshot
  (like public.user_roles including all)
  on commit drop;
\copy qa_user_roles_snapshot (id, user_id, role, created_at) from '$qa_snapshot_file' with (format csv)
insert into public.user_roles (id, user_id, role, created_at)
select id, user_id, role, created_at
from qa_user_roles_snapshot
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    created_at = excluded.created_at;
delete from public.user_roles as ur
where not exists (
  select 1
  from qa_user_roles_snapshot snapshot_role
  where snapshot_role.id = ur.id
);
do \$\$
begin
  if exists (
    (select id, user_id, role, created_at from public.user_roles
     except
     select id, user_id, role, created_at from qa_user_roles_snapshot)
    union all
    (select id, user_id, role, created_at from qa_user_roles_snapshot
     except
     select id, user_id, role, created_at from public.user_roles)
  ) then
    raise exception 'user_roles restoration mismatch';
  end if;
end;
\$\$;
commit;
SQL
  else
    qa_cleanup_status=1
  fi

  if [[ $qa_fixture_owned -eq 1 && $qa_cleanup_status -eq 0 ]]; then
    "${qa_psql[@]}" -qAtc \
      "delete from auth.users where id in ('$qa_admin_a', '$qa_admin_b')" \
      >/dev/null 2>&1 || qa_cleanup_status=1
  fi

  if [[ $qa_snapshot_ready -eq 1 ]]; then
    "${qa_psql[@]}" -q <<SQL || qa_cleanup_status=1
\copy (select id, user_id, role, created_at from public.user_roles order by id) to '$qa_restored_file' with (format csv)
SQL
    if ! cmp -s "$qa_snapshot_file" "$qa_restored_file"; then
      echo "user_roles byte-for-byte restoration check failed" >&2
      qa_cleanup_status=1
    fi
  fi

  rm -rf "$qa_tmp_dir"

  if [[ $qa_original_status -ne 0 ]]; then
    exit "$qa_original_status"
  fi
  if [[ $qa_cleanup_status -ne 0 ]]; then
    exit 1
  fi
  exit 0
}

handle_signal() {
  exit 130
}

trap cleanup EXIT
trap handle_signal INT TERM HUP

qa_existing_fixture_count=$("${qa_psql[@]}" -qAtc \
  "select count(*) from auth.users where id in ('$qa_admin_a', '$qa_admin_b')")
if [[ $qa_existing_fixture_count -ne 0 ]]; then
  echo "race fixture identities already exist; refusing to mutate them" >&2
  exit 1
fi

"${qa_psql[@]}" -q <<SQL
\copy (select id, user_id, role, created_at from public.user_roles order by id) to '$qa_snapshot_file' with (format csv)
SQL
qa_snapshot_ready=1

qa_existing_admin_count=$("${qa_psql[@]}" -qAtc \
  "select count(*) from public.user_roles where role = 'admin'")
if [[ $qa_existing_admin_count -lt 1 ]]; then
  echo "race test requires an existing administrator" >&2
  exit 1
fi

qa_fixture_owned=1
"${qa_psql[@]}" -q <<SQL
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '$qa_admin_a', 'authenticated', 'authenticated', 'f014-race-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '$qa_admin_b', 'authenticated', 'authenticated', 'f014-race-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.user_roles (user_id, role)
values ('$qa_admin_a', 'admin'), ('$qa_admin_b', 'admin');
delete from public.user_roles
where role = 'admin' and user_id not in ('$qa_admin_a', '$qa_admin_b');
do \$\$
begin
  if (select count(*) from public.user_roles where role = 'admin') <> 2 then
    raise exception 'race setup did not isolate exactly two administrators';
  end if;
end;
\$\$;
commit;
SQL

mkfifo "$qa_controller_fifo"
PGAPPNAME=f014_race_controller "${qa_psql[@]}" \
  >"$qa_controller_output" 2>&1 <"$qa_controller_fifo" &
qa_controller_pid=$!
qa_child_pids+=("$qa_controller_pid")
exec 9>"$qa_controller_fifo"
qa_controller_open=1
printf '%s\n' \
  "begin;" \
  "select pg_advisory_xact_lock(pg_catalog.hashtextextended('public.user_roles.admin', 0));" \
  >&9

qa_controller_ready=0
for _ in {1..100}; do
  if [[ $("${qa_psql[@]}" -qAtc \
    "select count(*) from pg_stat_activity where application_name = 'f014_race_controller' and state = 'idle in transaction' and wait_event_type = 'Client'") -eq 1 ]]; then
    qa_controller_ready=1
    break
  fi
  sleep 0.05
done
if [[ $qa_controller_ready -ne 1 ]]; then
  echo "controller did not acquire the production advisory lock" >&2
  exit 1
fi

PGAPPNAME=f014_race_a "${qa_psql[@]}" >"$qa_session_a" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$qa_admin_a', true);
delete from public.user_roles where user_id = '$qa_admin_a' and role = 'admin';
commit;
SQL
qa_pid_a=$!
qa_child_pids+=("$qa_pid_a")

PGAPPNAME=f014_race_b "${qa_psql[@]}" >"$qa_session_b" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$qa_admin_b', true);
delete from public.user_roles where user_id = '$qa_admin_b' and role = 'admin';
commit;
SQL
qa_pid_b=$!
qa_child_pids+=("$qa_pid_b")

qa_both_blocked=0
for _ in {1..100}; do
  qa_blocked_count=$("${qa_psql[@]}" -qAtc \
    "select count(*) from pg_stat_activity where application_name in ('f014_race_a', 'f014_race_b') and state = 'active' and wait_event_type = 'Lock' and wait_event = 'advisory'")
  if [[ $qa_blocked_count -eq 2 ]]; then
    qa_both_blocked=1
    break
  fi
  sleep 0.05
done
if [[ $qa_both_blocked -ne 1 ]]; then
  echo "both authenticated removals did not block on the production advisory lock" >&2
  exit 1
fi

if [[ ${QA_RACE_INTERRUPT_AFTER_BLOCKED:-0} == "1" ]]; then
  kill -TERM "$$"
fi

printf '%s\n' "commit;" "\\q" >&9
exec 9>&-
qa_controller_open=0

set +e
wait "$qa_pid_a"
qa_status_a=$?
wait "$qa_pid_b"
qa_status_b=$?
wait "$qa_controller_pid"
qa_controller_status=$?
set -e

if [[ $qa_controller_status -ne 0 ]]; then
  echo "controller transaction failed" >&2
  exit 1
fi

if ! { [[ $qa_status_a -eq 0 && $qa_status_b -ne 0 ]] || [[ $qa_status_a -ne 0 && $qa_status_b -eq 0 ]]; }; then
  echo "expected exactly one administrator removal to fail" >&2
  exit 1
fi

if ! grep -q "last_admin_required" "$qa_session_a" "$qa_session_b"; then
  echo "failed removal did not report last_admin_required" >&2
  exit 1
fi

qa_remaining=$("${qa_psql[@]}" -qAtc \
  "select count(*) from public.user_roles where role = 'admin'")
if [[ $qa_remaining -lt 1 ]]; then
  echo "concurrent removals left no administrator" >&2
  exit 1
fi

echo "both authenticated removals blocked on the invariant lock; one committed, one rejected, $qa_remaining administrator remains"
