import assert from "node:assert/strict";
import { SQL } from "bun";

const target = new URL(
  process.env["DELIVERY_TEST_DATABASE_URL"] ??
    "postgresql://postgres:postgres@127.0.0.1:54922/postgres",
);
assert(
  ["postgres:", "postgresql:"].includes(target.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
  "delivery concurrency test requires a local PostgreSQL host",
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
const sessions = [new SQL(options), new SQL(options)];
const warningId = crypto.randomUUID();
const broadcastId = crypto.randomUUID();
let ownsFixture = false;
const gate = Promise.withResolvers<void>();
let completions: Promise<unknown>[] = [];

try {
  await control`set statement_timeout = '8s'`;
  const [settings] = await control`
    select enabled, (select bool_and(not paused) from public.delivery_channel_settings) as channels_enabled,
      (select count(*)::integer from public.broadcast_delivery_queue) as queued
    from public.broadcast_settings where id=true
  `;
  assert(
    settings?.enabled && settings.channels_enabled,
    "delivery must be enabled locally",
  );
  assert.equal(
    settings.queued,
    0,
    "refusing to claim unrelated delivery queue rows",
  );
  await control.begin(async (tx) => {
    await tx`
      insert into public.authority_warnings(id,source,received_via,body,severity,commune_codes)
      values (${warningId},'concurrency-test','phone','local fixture','Severe','{1501}')
    `;
    await tx`
      insert into public.broadcasts(id,kind,authority_warning_id,severity,commune_codes,push_codes)
      values (${broadcastId},'authority',${warningId},'Severe','{1501}','{1501}')
    `;
  });
  ownsFixture = true;
  const channels = ["fcm", "telegram"] as const;
  const tokens = new Map<string, string>();
  for (const channel of channels) {
    const [claimed] =
      await control`select job from public.claim_broadcast_delivery(${channel},1)`;
    assert.equal(claimed?.job.id, broadcastId);
    tokens.set(channel, claimed.job.lease_token);
  }

  const ready = channels.map(() => Promise.withResolvers<void>());
  const backendIds = new Set<number>();
  completions = channels.map((channel, index) =>
    sessions[index]!.begin(async (tx) => {
      await tx`set local statement_timeout = '8s'`;
      await tx`set local idle_in_transaction_session_timeout = '10s'`;
      const locked = await tx`
        select channel, pg_backend_pid() as pid from public.broadcast_delivery_queue
        where broadcast_id=${broadcastId} and channel=${channel} for update
      `;
      assert.equal(locked.length, 1);
      backendIds.add(locked[0].pid);
      ready[index]!.resolve();
      await gate.promise;
      const [result] = await tx`
        select public.finish_broadcast_delivery(${broadcastId},${channel},${tokens.get(channel)},1,null) as finished
      `;
      assert.equal(
        result.finished,
        true,
        `${channel} completion must own its lease`,
      );
    }),
  );
  const settled = Promise.allSettled(completions);
  let barrierTimeout: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      Promise.all(ready.map((r) => r.promise)),
      new Promise<never>((_, reject) => {
        barrierTimeout = setTimeout(
          () => reject(new Error("queue lock barrier timed out")),
          5_000,
        );
      }),
    ]);
    assert.equal(
      backendIds.size,
      2,
      "race must use two independent database sessions",
    );
  } finally {
    clearTimeout(barrierTimeout!);
    gate.resolve();
  }
  const results = await settled;
  const failures = results.filter((r) => r.status === "rejected");
  assert.equal(
    failures.length,
    0,
    failures.map((r) => `${r.reason.code}: ${r.reason.message}`).join("; "),
  );
  const rows = await control`
    select channel,state from public.broadcast_delivery_queue where broadcast_id=${broadcastId} order by channel
  `;
  assert.deepEqual(Array.from(rows), [
    { channel: "fcm", state: "delivered" },
    { channel: "telegram", state: "delivered" },
  ]);
  const [broadcast] = await control`
    select fcm_delivered_at is not null as fcm, telegram_delivered_at is not null as telegram
    from public.broadcasts where id=${broadcastId}
  `;
  assert(broadcast.fcm && broadcast.telegram);
  console.log(
    "PASS: simultaneous FCM and Telegram completions committed without deadlock",
  );
} finally {
  gate.resolve();
  await Promise.allSettled(completions);
  try {
    if (ownsFixture) {
      await control.begin(async (tx) => {
        await tx`delete from public.broadcasts where id=${broadcastId}`;
        await tx`delete from public.authority_warnings where id=${warningId}`;
      });
      const [remaining] = await control`
        select (select count(*) from public.broadcasts where id=${broadcastId}) +
          (select count(*) from public.authority_warnings where id=${warningId}) +
          (select count(*) from public.broadcast_delivery_queue where broadcast_id=${broadcastId}) as count
      `;
      assert.equal(Number(remaining.count), 0, "fixture cleanup failed");
      console.log("Fixture cleanup verified");
    }
  } finally {
    await Promise.all(
      [control, ...sessions].map((db) => db.close({ timeout: 0 })),
    );
  }
}
