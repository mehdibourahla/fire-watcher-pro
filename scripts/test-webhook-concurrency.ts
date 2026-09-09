import assert from "node:assert/strict";
import { SQL } from "bun";

const target = new URL(
  process.env["DELIVERY_TEST_DATABASE_URL"] ??
    "postgresql://postgres:postgres@127.0.0.1:54922/postgres",
);
assert(
  ["postgres:", "postgresql:"].includes(target.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
  "webhook concurrency test requires a local PostgreSQL host",
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
const endpointId = crypto.randomUUID();
const gate = Promise.withResolvers<void>();
const locked = Promise.withResolvers<{ id: string; lease_token: string }>();
let concurrent: Promise<unknown> | undefined;
let created = false;
try {
  await control`set statement_timeout = '8s'`;
  await worker`set statement_timeout = '8s'`;
  const [existing] =
    await control`select count(*)::integer as count from public.webhook_outbox where state in ('pending','leased')`;
  assert.equal(
    existing.count,
    0,
    "refusing to claim unrelated local webhook rows",
  );
  await control.begin(async (tx) => {
    await tx`insert into auth.users(id,email) values(${userId},${`webhook-${userId}@example.invalid`})`;
    await tx`insert into public.webhook_endpoints(id,user_id,label,url) values(${endpointId},${userId},'Concurrency fixture','https://example.invalid')`;
    await tx`insert into public.alerts(id,user_id,kind,severity,dedupe_key,title,body) values(${alertId},${userId},'risk',4,${alertId},'Local fixture','Local fixture')`;
  });
  created = true;
  concurrent = worker.begin(async (tx) => {
    const [claim] = await tx`select * from public.claim_webhook_delivery()`;
    locked.resolve(claim);
    await gate.promise;
  });
  void concurrent.catch(locked.reject);
  const first = await locked.promise;
  assert(first?.id);
  const second = await control`select * from public.claim_webhook_delivery()`;
  assert.equal(second.length, 0, "concurrent claimant skipped locked delivery");
  gate.resolve();
  await concurrent;
  await control`update public.webhook_outbox set lease_until=now()-interval '1 second' where id=${first.id}`;
  const [recovered] =
    await control`select * from public.claim_webhook_delivery()`;
  assert.equal(recovered.id, first.id);
  assert.notEqual(recovered.lease_token, first.lease_token);
  const [stale] =
    await control`select public.finish_webhook_delivery(${first.id},${first.lease_token},204,null) as accepted`;
  assert.equal(stale.accepted, false);
  const [failure] =
    await control`select public.finish_webhook_delivery(${recovered.id},${recovered.lease_token},503,'http_503') as accepted`;
  assert.equal(failure.accepted, true);
  assert.equal(
    (await control`select * from public.claim_webhook_delivery()`).length,
    0,
    "retry backoff enforced",
  );
  await control`update public.webhook_outbox set available_at=now()-interval '1 second' where id=${first.id}`;
  const [retry] = await control`select * from public.claim_webhook_delivery()`;
  const [success] =
    await control`select public.finish_webhook_delivery(${retry.id},${retry.lease_token},204,null) as accepted`;
  assert.equal(success.accepted, true);
  const [receipt] =
    await control`select delivered_webhook,(select count(*)::integer from public.webhook_deliveries where alert_id=${alertId}) as receipts from public.alerts where id=${alertId}`;
  assert.equal(receipt.delivered_webhook, true);
  assert.equal(receipt.receipts, 2);
  console.log(
    "Webhook concurrency PASS: exclusive claim, expired lease recovery, stale fence rejection, backoff, durable retry receipt.",
  );
} finally {
  gate.resolve();
  if (concurrent) await concurrent;
  if (created) await control`delete from auth.users where id=${userId}`;
  await Promise.all([control.close(), worker.close()]);
}
