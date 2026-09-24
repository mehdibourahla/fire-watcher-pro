import assert from "node:assert/strict";
import { SQL } from "bun";

const target = new URL(
  process.env["DELIVERY_TEST_DATABASE_URL"] ??
    "postgresql://postgres:postgres@127.0.0.1:54922/postgres",
);
assert(
  ["postgres:", "postgresql:"].includes(target.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
  "alert push concurrency test requires a local PostgreSQL host",
);
const options = {
  hostname: target.hostname.replace(/^\[|\]$/g, ""),
  port: Number(target.port || 5432),
  username: decodeURIComponent(target.username),
  password: decodeURIComponent(target.password),
  database: target.pathname.slice(1),
  max: 1,
  connectionTimeout: 5,
  tls: false,
};
const control = new SQL(options);
const worker = new SQL(options);
const userId = crypto.randomUUID();
const alertId = crypto.randomUUID();
const gate = Promise.withResolvers<void>();
const locked = Promise.withResolvers<{ id: string }>();
let concurrent: Promise<unknown> | undefined;
let created = false;
try {
  await control`set statement_timeout = '8s'`;
  await worker`set statement_timeout = '8s'`;
  const [existing] =
    await control`select count(*)::integer as count from public.alerts where push_state = 'pending' and created_at > now() - interval '6 hours'`;
  assert.equal(
    existing.count,
    0,
    "refusing to claim unrelated local alert pushes",
  );
  await control.begin(async (tx) => {
    await tx`insert into auth.users(id,email) values(${userId},${`push-${userId}@example.invalid`})`;
    await tx`insert into public.alerts(id,user_id,kind,severity,dedupe_key,title,body) values(${alertId},${userId},'risk',4,${alertId},'Local fixture','Local fixture')`;
  });
  created = true;
  concurrent = worker.begin(async (tx) => {
    const [claim] = await tx`select * from public.claim_alert_pushes(10)`;
    locked.resolve(claim);
    await gate.promise;
  });
  void concurrent.catch(locked.reject);
  const first = await locked.promise;
  assert.equal(first?.id, alertId);
  const blocked = await control`select * from public.claim_alert_pushes(10)`;
  assert.equal(
    blocked.length,
    0,
    "a concurrent claimant skips the locked alert",
  );
  gate.resolve();
  await concurrent;
  assert.equal(
    (await control`select * from public.claim_alert_pushes(10)`).length,
    0,
    "a fresh claim is not handed out again",
  );
  await control`update public.alerts set push_claimed_at = now() - interval '6 minutes' where id = ${alertId}`;
  // read claim times as text: JS Dates drop the microseconds Postgres compares on
  const [stale] =
    await control`select push_claimed_at::text as at from public.alerts where id = ${alertId}`;
  const [recovered] =
    await control`select id, push_claimed_at::text as at from public.claim_alert_pushes(10)`;
  assert.equal(recovered?.id, alertId, "a stale claim is recovered");
  const late =
    await control`update public.alerts set push_state = 'pending' where id = ${alertId} and push_claimed_at = ${stale.at}::timestamptz returning id`;
  assert.equal(
    late.length,
    0,
    "the stale worker cannot overwrite the new claim",
  );
  const done =
    await control`update public.alerts set push_state = 'sent' where id = ${alertId} and push_claimed_at = ${recovered.at}::timestamptz returning id`;
  assert.equal(done.length, 1, "the current claimant finishes the push");
  console.log(
    "Alert push concurrency PASS: exclusive claim, no double hand-out, stale claim recovery, fenced finish.",
  );
} finally {
  gate.resolve();
  if (concurrent) await concurrent;
  if (created) await control`delete from auth.users where id=${userId}`;
  await Promise.all([control.close(), worker.close()]);
}
