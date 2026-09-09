import { createClient } from "@supabase/supabase-js";
import { SQL } from "bun";
import assert from "node:assert/strict";

const api = process.env.SUPABASE_URL ?? "";
const app = process.env.ACCOUNT_TEST_APP_URL ?? "http://127.0.0.1:4193";
const database =
  process.env.ACCOUNT_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54922/postgres";
if (
  new URL(api).hostname !== "127.0.0.1" ||
  new URL(app).hostname !== "127.0.0.1" ||
  new URL(database).hostname !== "127.0.0.1"
)
  throw new Error("Local-only test");
const admin = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const db = new SQL(database);
const [existingAdmins] =
  await db`select count(*)::integer as count from public.user_roles where role='admin'`;
assert.ok(
  existingAdmins.count > 0,
  "Requires an existing local administrator outside the test fixtures",
);
const password = crypto.randomUUID() + "Aa1!";
const email = `delete-${crypto.randomUUID()}@example.invalid`;
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
assert.ifError(created.error);
const id = created.data.user!.id;
const witness = await admin.auth.admin.createUser({
  email: `witness-${crypto.randomUUID()}@example.invalid`,
  password,
  email_confirm: true,
});
assert.ifError(witness.error);
const other = witness.data.user!.id;
try {
  await db`insert into public.user_roles(user_id,role) values(${id},'admin'),(${other},'admin')`;
  const [zone] =
    await db`insert into public.zones(user_id,name,lat,lon,radius_km) values(${id},'Deletion test',36,3,5) returning id`;
  await db`insert into public.alerts(user_id,zone_id,kind,severity,dedupe_key,title,body) values(${id},${zone.id},'fire',3,${crypto.randomUUID()},'Local test','Local test')`;
  const [report] =
    await db`insert into public.citizen_reports(user_id,lat,lon,reviewed_by) values(${other},36,3,${id}) returning id`;
  const [audit] =
    await db`insert into public.admin_audit(actor_kind,actor_user_id,domain,action,target_table,before,after,reason) values('user',${id},'people','test.delete','profiles','{}','{}','personal test') returning id`;
  assert.ifError(
    (
      await admin.storage
        .from("report-photos")
        .upload(`${id}/nested/test.jpg`, new Uint8Array([255, 216, 255, 217]), {
          contentType: "image/jpeg",
        })
    ).error,
  );
  const client = createClient(api, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const session = await client.auth.signInWithPassword({ email, password });
  assert.ifError(session.error);
  const response = await fetch(`${app}/api/private/account`, {
    method: "DELETE",
    headers: {
      origin: app,
      authorization: `Bearer ${session.data.session!.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ confirmation: "DELETE" }),
  });
  assert.equal(response.status, 200, await response.text());
  assert.equal((await db`select id from auth.users where id=${id}`).length, 0);
  assert.equal(
    (await db`select id from public.zones where user_id=${id}`).length,
    0,
  );
  assert.equal(
    (await db`select id from public.alerts where user_id=${id}`).length,
    0,
  );
  assert.equal(
    (
      await db`select id from storage.objects where bucket_id='report-photos' and name like ${id + "/%"}`
    ).length,
    0,
  );
  assert.equal(
    (
      await db`select reviewed_by from public.citizen_reports where id=${report.id}`
    )[0].reviewed_by,
    null,
  );
  const [retained] =
    await db`select actor_kind,actor_user_id,before,after,reason from public.admin_audit where id=${audit.id}`;
  assert.deepEqual(
    { ...retained },
    {
      actor_kind: "system",
      actor_user_id: null,
      before: null,
      after: null,
      reason: null,
    },
  );
  assert.ok((await client.auth.getUser()).error);
  console.log(
    "PASS: real local Auth admin deletion, nested storage cleanup, zone/alert cascades, session rejection, retained report and anonymized audit",
  );
} finally {
  await admin.storage.from("report-photos").remove([`${id}/nested/test.jpg`]);
  await admin.auth.admin.deleteUser(id);
  await admin.auth.admin.deleteUser(other);
  await db.close();
}
