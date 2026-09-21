import assert from "node:assert/strict";
import { SQL } from "bun";

const target = new URL(
  process.env["DELIVERY_TEST_DATABASE_URL"] ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
  "local database required",
);
const options = {
  hostname: target.hostname,
  port: Number(target.port),
  username: target.username,
  password: target.password,
  database: target.pathname.slice(1),
  max: 1,
  tls: false,
};
const control = new SQL(options),
  first = new SQL(options),
  second = new SQL(options);
const actor = crypto.randomUUID(),
  report = crypto.randomUUID();
const locked = Promise.withResolvers<void>(),
  release = Promise.withResolvers<void>();
const work: Promise<unknown>[] = [];
try {
  for (const db of [control, first, second])
    await db`set statement_timeout='8s'`;
  await control`insert into auth.users(id,email) values(${actor},${`${actor}@example.invalid`})`;
  await control`insert into user_roles(user_id,role) values(${actor},'admin')`;
  await control`insert into ita_reports(id,source_post_id,source_page,source_url,published_at,content_hash,body,raw,extraction_attempts,extraction_error,next_extraction_at)
    values(${report},${report},'test','https://example.invalid',now(),repeat('e',64),'fixture','{}',3,'failed',now()+interval '1 hour')`;
  const later = first.begin(async (tx) => {
    await tx`select id from ita_reports where id=${report} for update`;
    locked.resolve();
    await release.promise;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
    await tx`select retry_ita_report(${report}::uuid)`;
  });
  work.push(later);
  await locked.promise;
  const [session] = await second`select pg_backend_pid() as pid`;
  const earlier = second
    .begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      await tx`select retry_ita_report(${report}::uuid)`;
    })
    .then(
      () => "accepted",
      (error: Error) => error.message,
    );
  work.push(earlier);
  let waiting = false;
  for (let i = 0; i < 100; i++) {
    const [state] =
      await control`select wait_event_type from pg_stat_activity where pid=${session.pid}`;
    if (state?.wait_event_type === "Lock") {
      waiting = true;
      break;
    }
    await Bun.sleep(20);
  }
  assert(waiting, "earlier retry must be blocked on the report row");
  release.resolve();
  await later;
  assert.match(await earlier, /ita_retry_already_queued/);
  const [audit] =
    await control`select count(*)::int as count from admin_audit where target_id=${report} and action='ita.retry'`;
  assert.equal(audit.count, 1);
  console.log("ITA concurrent retry: one job and audit; stale waiter rejected");
} finally {
  release.resolve();
  await Promise.allSettled(work);
  await control`delete from source_jobs where id in (select ("after"->>'job_id')::uuid from admin_audit where target_id=${report} and action='ita.retry')`;
  await control`delete from admin_audit where target_id=${report}`;
  await control`delete from ita_reports where id=${report}`;
  await control.begin(async (tx) => {
    // The fixture can be the only admin in a fresh local database.
    await tx`alter table user_roles disable trigger user_roles_preserve_last_admin_delete`;
    await tx`delete from auth.users where id=${actor}`;
    await tx`alter table user_roles enable trigger user_roles_preserve_last_admin_delete`;
  });
  await Promise.all([control.close(), first.close(), second.close()]);
}
