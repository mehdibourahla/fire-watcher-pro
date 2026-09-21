import assert from "node:assert/strict";
import { SQL } from "bun";

const target = new URL(
  process.env["DELIVERY_TEST_DATABASE_URL"] ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
assert(
  ["postgres:", "postgresql:"].includes(target.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
  "civil concurrency test requires local PostgreSQL",
);
const options = {
  hostname: target.hostname.replace(/^\[|\]$/g, ""),
  port: Number(target.port || 5432),
  username: decodeURIComponent(target.username),
  password: decodeURIComponent(target.password),
  database: target.pathname.slice(1),
  max: 1,
  tls: false,
};
const control = new SQL(options),
  agent = new SQL(options),
  human = new SQL(options);
const user = crypto.randomUUID(),
  oldReport = crypto.randomUUID(),
  report = crypto.randomUUID(),
  job = crypto.randomUUID(),
  work = crypto.randomUUID();
const post = `civil-race-${work}`;
const release = Promise.withResolvers<void>(),
  published = Promise.withResolvers<void>();
let agentRun: Promise<unknown> | undefined,
  humanRun: Promise<unknown> | undefined;
try {
  await control`set statement_timeout='8s'`;
  await agent`set statement_timeout='8s'`;
  await human`set statement_timeout='8s'`;
  await human`select set_config('application_name',${post},false)`;
  const [active] =
    await control`select count(*)::integer n from public.source_job_leases where contract_key='ita_website'`;
  assert.equal(active.n, 0, "refusing to replace unrelated local ITA lease");
  const [area] =
    await control`select id from public.admin_units order by id limit 1`;
  assert(area);
  await control.begin(async (tx) => {
    await tx`insert into auth.users(id,email) values(${user},${post + "@example.invalid"})`;
    await tx`insert into public.user_roles(user_id,role) values(${user},'operator')`;
    for (const id of [oldReport, report])
      await tx`insert into public.ita_reports(id,source_post_id,source_page,source_url,published_at,fetched_at,content_hash,body,raw,extraction)
      values(${id},${post},'traficalg','https://example.invalid/post',now()-interval '1 hour',now()+case when ${id}= ${report} then interval '1 second' else interval '0 seconds' end,md5(${id})||md5(${id}),'Accident Tipaza','{}','{"disposition":"incident_report","incidents":[{"kind":"collision","summary_fr":"Accident","evidence":"Accident"}]}')`;
    await tx`insert into public.source_jobs(id,contract_key,contract_version,trigger_kind,idempotency_key,scheduled_for,data_from,data_through,execution_target,state,attempt_count,max_attempts,retry_base_seconds,retry_until,started_at)
      select ${job},key,version,'manual',${post},now(),now()-interval '5 minutes',now(),execution_target,'running',1,3,300,now()+interval '1 hour',now() from public.source_contracts where key='ita_website'`;
    await tx`insert into public.source_job_leases(contract_key,job_id,worker_id,attempt,leased_at,lease_expires_at) values('ita_website',${job},${post},1,now(),now()+interval '5 minutes')`;
    await tx`insert into public.civil_investigations(id,report_id,incident_index,state,attempts,job_id,job_attempt) values(${work},${report},0,'processing',1,${job},1)`;
  });
  const result = JSON.stringify({
    model: "race-test",
    version: "civil-agent-v1",
    decision: {
      outcome: "publish",
      reason: "Fixture",
      area_id: area.id,
      hazard: "road",
      summary: "Accident signalé",
      location_evidence: "Tipaza",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      duplicate_id: null,
    },
    trace: [{ action: "search_areas", results: [{ id: area.id }] }],
  });
  agentRun = agent.begin(async (tx) => {
    await tx`set local role service_role`;
    await tx`select public.finish_civil_investigation(${job},1,${work},1,${result}::text::jsonb,null)`;
    published.resolve();
    await release.promise;
  });
  void agentRun.catch(published.reject);
  await published.promise;
  humanRun = human.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    await tx`select public.publish_ita_publication(${oldReport},0,'road','Older source',${area.id},now()+interval '1 hour','Concurrent operator')`;
  });
  const humanOutcome = humanRun.then(
    () => "accepted",
    (error) => String(error.message),
  );
  let waiting = false;
  for (let i = 0; i < 80; i++) {
    const [state] =
      await control`select exists(select 1 from pg_stat_activity where application_name=${post} and wait_event='advisory') waiting`;
    if (state.waiting) {
      waiting = true;
      break;
    }
    await Bun.sleep(25);
  }
  assert(waiting, "human publication must wait for shared source-post lock");
  release.resolve();
  await agentRun;
  assert.match(
    await humanOutcome,
    /civil_source_revision_requires_reconciliation/,
  );
  const [count] =
    await control`select count(*)::integer n from public.civil_publications where ita_report_id in (${oldReport},${report})`;
  assert.equal(count.n, 1, "only the agent's current revision committed");
  console.log(
    "PASS: concurrent human and agent publication serialize across source revisions",
  );
} finally {
  release.resolve();
  await Promise.allSettled([agentRun, humanRun].filter(Boolean));
  await control.begin(async (tx) => {
    await tx`alter table public.civil_decisions disable trigger civil_decision_immutable`;
    await tx`alter table public.civil_publication_revisions disable trigger protect_civil_publication_audit`;
    await tx`alter table public.civil_publications disable trigger protect_civil_publication_source`;
    await tx`delete from public.civil_decisions where investigation_id=${work}`;
    await tx`delete from public.civil_publication_revisions where publication_id in(select id from public.civil_publications where ita_report_id in(${oldReport},${report}))`;
    await tx`delete from public.civil_publications where ita_report_id in(${oldReport},${report})`;
    await tx`alter table public.civil_decisions enable trigger civil_decision_immutable`;
    await tx`alter table public.civil_publication_revisions enable trigger protect_civil_publication_audit`;
    await tx`alter table public.civil_publications enable trigger protect_civil_publication_source`;
    await tx`delete from public.civil_investigations where id=${work}`;
    await tx`delete from public.source_job_leases where job_id=${job}`;
    await tx`delete from public.source_jobs where id=${job}`;
    await tx`delete from public.ita_reports where id in (${oldReport},${report})`;
    await tx`delete from public.user_roles where user_id=${user}`;
    await tx`delete from auth.users where id=${user}`;
  });
  await Promise.all([control.close(), agent.close(), human.close()]);
}
