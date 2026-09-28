# ITA Facebook Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect every post of Info Trafic Algérie's Facebook page through an Apify bridge into the existing ITA pipeline, behind a fetcher the Meta Graph API later replaces.

**Architecture:** A new `ita_facebook` source contract (15 min) runs on the Cloudflare worker. Each job calls Apify's task `run-sync-get-dataset-items`, maps items to the website feed's `ItaFeedPost` shape, and stores them through a new lease-fenced RPC into `ita_reports`. Extraction stays with the `ita_website` job. Both save RPCs skip a row whose `(page, post_id, body)` already exists.

**Tech Stack:** TypeScript, zod v4, vitest, Supabase Postgres + pgTAP, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-28-ita-facebook-source-design.md`

## Global Constraints

- Zero comments and docstrings unless a non-obvious why, one short line.
- Commits: 1–2 lines, no attribution trailers.
- Contract: key `ita_facebook`, parser `ita-apify-v1`, cadence 15, overlap 5, warning 45, stale 90, offset 2, `replay_capability` `none`, target `cloudflare`.
- Apify request: `resultsLimit` 20, `maxItems=20`, `maxTotalChargeUsd=0.2`, `timeout=100`, client abort 120 s.
- Lookback: `ceil((now − data_from) / 60 000) + 2`, clamped to 20–60 minutes.
- Identity: `id` = `${pageAdLibrary.id}_${postId}`, `uri` = `pageName`; `region` `""`, `type` `[]`.
- A capped account (HTTP 403) fails as `upstream_unreachable` with diagnostic `Apify usage cap reached (HTTP 403)`. No new public reason code.
- `ita_facebook` is NOT added to the public map's `relevantKeys` (`src/routes/index.tsx:388`).
- Secrets: `APIFY_TOKEN`, `APIFY_ITA_TASK_ID` (worker runtime secrets).
- CI gates (`.github/workflows/ci.yml`): `bunx tsc --noEmit`, `bun run test`, `bun run lint`, and the `db-tests` job (`scripts/test-db.sh` plus the concurrency scripts). The local database carries a migration from another branch; unless it is repaired, CI `db-tests` is the pgTAP verdict. Never run `supabase db reset`.

---

### Task 1: Apify fetcher

**Files:**
- Create: `src/lib/text-sources/ita-apify.ts`
- Create: `src/lib/__tests__/fixtures/ita-apify-items.json`
- Test: `src/lib/__tests__/ita-apify.test.ts`

**Interfaces:**
- Consumes: `type ItaFeedPost` from `src/lib/text-sources/ita-feed.ts`.
- Produces:
  - `type ItaApifyRequest = { taskId: string; token: string; lookbackMinutes: number }`
  - `fetchItaApifyPosts(request: ItaApifyRequest, fetchImpl?: typeof fetch): Promise<{ posts: ItaFeedPost[]; rejected: number }>`

- [ ] **Step 1: Write the fixture (real items from dataset pulls of 2026-09-28)**

`src/lib/__tests__/fixtures/ita-apify-items.json`:

```json
[
  {
    "facebookUrl": "https://www.facebook.com/traficalg",
    "postId": "1526895906150280",
    "pageName": "traficalg",
    "url": "https://www.facebook.com/reel/3655655771282022/",
    "time": "2026-09-25T16:34:32.000Z",
    "timestamp": 1790354072,
    "text": "#حريق #iIncendie 🔥🔥\n\nاشتعال نار فوق بوغلبون بعد نفق عين بوزيان",
    "isVideo": true,
    "topLevelUrl": "https://www.facebook.com/100064896541469/posts/1526895906150280",
    "facebookId": "100064896541469",
    "pageAdLibrary": { "id": "808412572528916", "pamv_comms_data": null },
    "inputUrl": "https://www.facebook.com/traficalg"
  },
  {
    "inputUrl": "https://www.facebook.com/traficalg",
    "error": "no_items",
    "errorDescription": "Empty or private data for provided input"
  }
]
```

- [ ] **Step 2: Write the failing tests**

`src/lib/__tests__/ita-apify.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { fetchItaApifyPosts } from "@/lib/text-sources/ita-apify";
import items from "./fixtures/ita-apify-items.json";

const [post, empty] = items as [
  Record<string, unknown> & { text: string },
  unknown,
];
const request = { taskId: "task-1", token: "secret", lookbackMinutes: 25 };
const answering = (body: unknown, status = 201) =>
  vi.fn(async () => Response.json(body, { status }));

describe("ITA Apify fetcher", () => {
  it("maps a post to the website feed's identity and asks for the window", async () => {
    const fetcher = answering([post]);
    const result = await fetchItaApifyPosts(request, fetcher);
    expect(result).toEqual({
      rejected: 0,
      posts: [
        {
          id: "808412572528916_1526895906150280",
          uri: "traficalg",
          created_time: "2026-09-25T16:34:32Z",
          message: post.text,
          region: "",
          type: [],
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/api\.apify\.com\/v2\/actor-tasks\/task-1\/run-sync-get-dataset-items\?.*maxTotalChargeUsd=0\.2/,
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
        body: JSON.stringify({
          resultsLimit: 20,
          onlyPostsNewerThan: "25 minutes",
        }),
      }),
    );
  });

  it("reads an empty window as no posts", async () => {
    expect(await fetchItaApifyPosts(request, answering([empty]))).toEqual({
      posts: [],
      rejected: 0,
    });
  });

  it("counts an item that fails the schema and keeps one copy of a repeated post", async () => {
    const { text: _text, ...textless } = post;
    const result = await fetchItaApifyPosts(
      request,
      answering([post, post, textless]),
    );
    expect(result.posts).toHaveLength(1);
    expect(result.rejected).toBe(1);
  });

  it("names a capped account in the error", async () => {
    const capped = answering(
      {
        error: {
          type: "platform-feature-disabled",
          message: "Monthly usage hard limit exceeded",
        },
      },
      403,
    );
    await expect(fetchItaApifyPosts(request, capped)).rejects.toThrow(
      "Apify usage cap reached (HTTP 403)",
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/__tests__/ita-apify.test.ts`
Expected: FAIL, cannot resolve `@/lib/text-sources/ita-apify`.

- [ ] **Step 4: Implement the fetcher**

`src/lib/text-sources/ita-apify.ts`:

```ts
import { z } from "zod/v4";

import type { ItaFeedPost } from "./ita-feed";

const ItemSchema = z.object({
  postId: z.string().regex(/^\d+$/),
  pageName: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  time: z.string().refine((v) => Number.isFinite(Date.parse(v))),
  text: z
    .string()
    .max(50_000)
    .refine((v) => v.trim().length > 0),
  pageAdLibrary: z.object({ id: z.string().regex(/^\d+$/) }),
});
const EmptySchema = z.object({ error: z.literal("no_items") });

export type ItaApifyRequest = {
  taskId: string;
  token: string;
  lookbackMinutes: number;
};

export async function fetchItaApifyPosts(
  { taskId, token, lookbackMinutes }: ItaApifyRequest,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(
    `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/run-sync-get-dataset-items?timeout=100&clean=1&maxItems=20&maxTotalChargeUsd=0.2`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        resultsLimit: 20,
        onlyPostsNewerThan: `${lookbackMinutes} minutes`,
      }),
      signal: AbortSignal.timeout(120_000),
      redirect: "manual",
    },
  );
  if (!response.ok) {
    const body = await response.text();
    const cause = /hard limit/i.test(body)
      ? "Apify usage cap reached"
      : "Apify run failed";
    throw new Error(`${cause} (HTTP ${response.status})`);
  }
  const items = z.array(z.unknown()).max(100).parse(await response.json());
  const posts: ItaFeedPost[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const raw of items) {
    if (EmptySchema.safeParse(raw).success) continue;
    const item = ItemSchema.safeParse(raw);
    if (!item.success) {
      rejected++;
      continue;
    }
    const id = `${item.data.pageAdLibrary.id}_${item.data.postId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    posts.push({
      id,
      uri: item.data.pageName,
      created_time: new Date(item.data.time)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z"),
      message: item.data.text,
      region: "",
      type: [],
    });
  }
  return { posts, rejected };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/__tests__/ita-apify.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/text-sources/ita-apify.ts src/lib/__tests__/ita-apify.test.ts src/lib/__tests__/fixtures/ita-apify-items.json
git commit -m "Read ITA Facebook posts from the Apify task in the website feed's shape"
```

---

### Task 2: Contract, storage RPC and cross-source dedup

**Files:**
- Create: `supabase/migrations/20260929090000_ita_facebook_source.sql`
- Test: `supabase/tests/ita_facebook_source.test.sql`

**Interfaces:**
- Consumes: `ita_reports`, `source_contracts`, `source_job_leases`, `save_ita_feed` (current body in `supabase/migrations/20260921173000_civil_agent.sql`).
- Produces:
  - Contract row `ita_facebook`.
  - `public.assert_ita_facebook_lease(_job uuid, _attempt integer)` (security definer, service_role only), mirroring `assert_ita_source_lease`.
  - `public.save_ita_facebook_posts(_job uuid, _attempt integer, _posts jsonb) returns integer` (service_role only). `_posts` rows carry `source_post_id, source_page, source_url, published_at, content_hash, body, raw`, the same as `save_ita_feed`.
  - `save_ita_feed` keeps its signature; it now skips rows whose `(source_page, source_post_id, body)` exists.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/ita_facebook_source.test.sql`:

```sql
begin;
set local search_path = public, extensions;
select plan(12);
select is((select cadence_minutes from source_contracts where key='ita_facebook'),15,'fifteen-minute schedule');
select is((select replay_capability from source_contracts where key='ita_facebook'),'none','no gap replay');
set local role authenticated;
select throws_ok($$select save_ita_facebook_posts(gen_random_uuid(),1,'[]')$$,'42501',null,'users cannot invoke the collector');
reset role;
set local role service_role;
select throws_ok($$select save_ita_facebook_posts(gen_random_uuid(),1,'[]')$$,'55000','ita_source_lease_lost','unleased worker cannot store');
reset role;
select public.enqueue_due_source_jobs(now(),'database');
select set_config('fb.job',id::text,true),set_config('fb.attempt',attempt_count::text,true)
 from public.claim_source_job('ita-fb-test','cloudflare','ita_facebook');
select set_config('web.job',id::text,true),set_config('web.attempt',attempt_count::text,true)
 from public.claim_source_job('ita-web-test','cloudflare','ita_website');
set local role service_role;
select is(save_ita_facebook_posts(current_setting('fb.job')::uuid,current_setting('fb.attempt')::integer,
 jsonb_build_array(jsonb_build_object('source_post_id','808412572528916_1','source_page','traficalg','source_url','https://www.facebook.com/traficalg/posts/1','published_at','2026-09-28T09:40:06Z','content_hash',repeat('a',64),'body','oil on the road','raw','{}'::jsonb))),
 1,'new Facebook post stored');
select is(save_ita_facebook_posts(current_setting('fb.job')::uuid,current_setting('fb.attempt')::integer,
 jsonb_build_array(jsonb_build_object('source_post_id','808412572528916_1','source_page','traficalg','source_url','https://www.facebook.com/traficalg/posts/1','published_at','2026-09-28T09:40:06Z','content_hash',repeat('b',64),'body','oil on the road','raw','{}'::jsonb))),
 0,'same text again stores nothing');
select is(save_ita_feed(current_setting('web.job')::uuid,current_setting('web.attempt')::integer,
 jsonb_build_array(jsonb_build_object('source_post_id','808412572528916_1','source_page','traficalg','source_url','https://www.facebook.com/traficalg/posts/1','published_at','2026-09-28T09:40:06Z','content_hash',repeat('c',64),'body','oil on the road','raw','{"region":"Alger"}'::jsonb)),'"v1"',false),
 0,'website copy with only a region hint adds no revision');
select is(save_ita_feed(current_setting('web.job')::uuid,current_setting('web.attempt')::integer,
 jsonb_build_array(jsonb_build_object('source_post_id','808412572528916_1','source_page','traficalg','source_url','https://www.facebook.com/traficalg/posts/1','published_at','2026-09-28T09:40:06Z','content_hash',repeat('d',64),'body','oil on the road, cleared','raw','{}'::jsonb)),'"v2"',false),
 1,'edited text is a revision');
select is(save_ita_facebook_posts(current_setting('fb.job')::uuid,current_setting('fb.attempt')::integer,
 jsonb_build_array(jsonb_build_object('source_post_id','808412572528916_1','source_page','traficalg','source_url','https://www.facebook.com/traficalg/posts/1','published_at','2026-09-28T09:40:06Z','content_hash',repeat('e',64),'body','oil on the road, cleared','raw','{}'::jsonb))),
 0,'Facebook copy of the edit adds nothing');
select is(save_ita_facebook_posts(current_setting('fb.job')::uuid,current_setting('fb.attempt')::integer,
 jsonb_build_array(
  jsonb_build_object('source_post_id','808412572528916_2','source_page','traficalg','source_url','https://www.facebook.com/traficalg/posts/2','published_at','2026-09-28T09:41:03Z','content_hash',repeat('f',64),'body','truck stopped in lane one','raw','{}'::jsonb),
  jsonb_build_object('source_post_id','808412572528916_2','source_page','traficalg','source_url','https://www.facebook.com/traficalg/posts/2','published_at','2026-09-28T09:41:03Z','content_hash',repeat('9',64),'body','truck stopped in lane one','raw','{}'::jsonb))),
 1,'a repeated post inside one batch stores once');
select is((select count(*) from ita_reports where source_post_id='808412572528916_1'),2::bigint,'one row per distinct text');
select throws_ok($$select save_ita_facebook_posts(current_setting('fb.job')::uuid,current_setting('fb.attempt')::integer+1,'[]')$$,'55000','ita_source_lease_lost','different attempt cannot use the lease');
reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash scripts/test-db.sh` (local stack) or push the branch and read CI `db-tests`.
Expected: FAIL, `ita_facebook_source.test.sql` reports the missing contract and function.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260929090000_ita_facebook_source.sql`:

```sql
insert into public.source_contracts (
  key, version, label, family, criticality, freshness_basis,
  cadence_minutes, warning_after_minutes, stale_after_minutes, max_fallback_age_minutes,
  expected_coverage, parser_version, dependency_keys, licence, attribution, owner,
  enabled, schedule_enabled, schedule_offset_minutes, execution_target,
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
) values (
  'ita_facebook', 1, 'Info Trafic Algérie — Facebook page', 'civil_information', 'supporting',
  'last_success_at',
  15, 45, 90, null,
  '{"kind":"poll"}'::jsonb, 'ita-apify-v1', '{}', 'Public Facebook page; publisher rights retained',
  'Info Trafic Algérie — ITA', 'Nadhir maintainers',
  true, true, 2, 'cloudflare',
  300, 3, 120, 30,
  5, 'none', null
);

create function public.assert_ita_facebook_lease(_job uuid, _attempt integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.source_job_leases
    where contract_key='ita_facebook' and job_id=_job and attempt=_attempt
      and lease_expires_at > clock_timestamp() for update;
  if not found then
    raise exception using errcode='55000', message='ita_source_lease_lost';
  end if;
end;
$$;
revoke all on function public.assert_ita_facebook_lease(uuid,integer) from public, anon, authenticated;
grant execute on function public.assert_ita_facebook_lease(uuid,integer) to service_role;

create function public.save_ita_facebook_posts(_job uuid, _attempt integer, _posts jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare _inserted integer := 0; _identity text;
begin
  perform public.assert_ita_facebook_lease(_job,_attempt);
  for _identity in select distinct p->>'source_page' || ':' || (p->>'source_post_id') from jsonb_array_elements(_posts) p order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(_identity,0));
  end loop;
  insert into public.ita_reports(source_post_id,source_page,source_url,published_at,content_hash,body,raw)
  select distinct on (p.source_page,p.source_post_id,p.body)
      p.source_post_id,p.source_page,p.source_url,p.published_at,p.content_hash,p.body,p.raw
    from jsonb_to_recordset(_posts) as p(source_post_id text,source_page text,source_url text,published_at timestamptz,content_hash text,body text,raw jsonb)
    where not exists(select 1 from public.ita_reports r
      where r.source_page=p.source_page and r.source_post_id=p.source_post_id and r.body=p.body)
    on conflict(source_page,source_post_id,content_hash) do nothing;
  get diagnostics _inserted = row_count;
  return _inserted;
end;
$$;
revoke all on function public.save_ita_facebook_posts(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_ita_facebook_posts(uuid,integer,jsonb) to service_role;

create or replace function public.save_ita_feed(_job uuid, _attempt integer, _posts jsonb, _etag text, _not_modified boolean)
returns integer language plpgsql security invoker set search_path = '' as $$
declare _inserted integer := 0; _identity text;
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  if not _not_modified then
    for _identity in select distinct p->>'source_page' || ':' || (p->>'source_post_id') from jsonb_array_elements(_posts) p order by 1 loop
      perform pg_advisory_xact_lock(hashtextextended(_identity,0));
    end loop;
    insert into public.ita_reports(source_post_id,source_page,source_url,published_at,content_hash,body,raw)
    select distinct on (p.source_page,p.source_post_id,p.body)
        p.source_post_id,p.source_page,p.source_url,p.published_at,p.content_hash,p.body,p.raw
      from jsonb_to_recordset(_posts) as p(source_post_id text,source_page text,source_url text,published_at timestamptz,content_hash text,body text,raw jsonb)
      where not exists(select 1 from public.ita_reports r
        where r.source_page=p.source_page and r.source_post_id=p.source_post_id and r.body=p.body)
      on conflict(source_page,source_post_id,content_hash) do nothing;
    get diagnostics _inserted = row_count;
    update public.ita_feed_state set etag=_etag,checked_at=clock_timestamp() where singleton;
  else
    update public.ita_feed_state set checked_at=clock_timestamp() where singleton;
  end if;
  return _inserted;
end;
$$;
```

Before writing, diff this `save_ita_feed` body against the latest definition: `git grep -n "function public.save_ita_feed" -- supabase/migrations` must still point at `20260921173000_civil_agent.sql` as the newest; if a newer one exists, start from it and add only the `distinct on` and `where not exists` lines.

- [ ] **Step 4: Run the database tests to verify they pass**

Run: `bash scripts/test-db.sh` or CI `db-tests`.
Expected: `ita_facebook_source.test.sql` 12/12 and `ita_reports.test.sql` unchanged (its "edited report is another revision" case changes the body, so it still inserts).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260929090000_ita_facebook_source.sql supabase/tests/ita_facebook_source.test.sql
git commit -m "Add the ita_facebook contract and store ITA posts once per distinct text"
```

---

### Task 3: Runner, registry, types and secrets

**Files:**
- Create: `src/lib/text-sources/ita-facebook.server.ts`
- Modify: `src/lib/text-sources/ita-pipeline.server.ts` (export `revision` and `Revision`)
- Modify: `src/lib/ingest/source-runners.server.ts` (key, dependency, runner)
- Modify: `src/integrations/supabase/types.ts` (RPC entry before `save_ita_feed`)
- Modify: `.env.example`, `README.md:155-157`
- Test: `src/lib/__tests__/ita-facebook.test.ts`, `src/lib/__tests__/source-runners.test.ts`

**Interfaces:**
- Consumes: `fetchItaApifyPosts` (Task 1); `save_ita_facebook_posts` (Task 2); `archivedFetch(sourceKey, endpoint, input, init, options?)`; `revision(post: ItaFeedPost): Promise<Revision>`.
- Produces:
  - `type ItaFacebookRun = { fetched: number; stored: number; rejected: number; lookbackMinutes: number; error?: string }`
  - `apifyLookback(dataFrom: string, now: number): number`
  - `runItaFacebookSourceWith(deps: { lookbackMinutes: number; fetchPosts: () => Promise<{ posts: ItaFeedPost[]; rejected: number }>; save: (posts: Revision[]) => Promise<number> }): Promise<ItaFacebookRun>`
  - `runItaFacebookSource(job: ClaimedSourceJob): Promise<ItaFacebookRun>`
  - Runtime key `ita_facebook` in `RUNTIME_CONTRACT_KEYS`.

- [ ] **Step 1: Write the failing collector tests**

`src/lib/__tests__/ita-facebook.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  apifyLookback,
  runItaFacebookSourceWith,
} from "@/lib/text-sources/ita-facebook.server";

const post = {
  id: "808412572528916_1526895906150280",
  uri: "traficalg",
  created_time: "2026-09-25T16:34:32Z",
  message: "#حريق #iIncendie 🔥🔥\n\nاشتعال نار فوق بوغلبون بعد نفق عين بوزيان",
  region: "",
  type: [],
};

describe("ITA Facebook collector", () => {
  it.each([
    ["2026-09-28T09:40:00Z", 22],
    ["2026-09-28T09:55:00Z", 20],
    ["2026-09-28T08:00:00Z", 60],
  ])("looks back from data_from %s by %i minutes", (dataFrom, minutes) => {
    expect(apifyLookback(dataFrom, Date.parse("2026-09-28T10:00:00Z"))).toBe(
      minutes,
    );
  });

  it("stores the fetched posts as ITA revisions", async () => {
    const save = vi.fn(async () => 1);
    const run = await runItaFacebookSourceWith({
      lookbackMinutes: 22,
      fetchPosts: async () => ({ posts: [post], rejected: 0 }),
      save,
    });
    expect(run).toEqual({ fetched: 1, stored: 1, rejected: 0, lookbackMinutes: 22 });
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        source_post_id: post.id,
        source_page: "traficalg",
        source_url: "https://www.facebook.com/traficalg/posts/1526895906150280",
        body: post.message,
        raw: post,
      }),
    ]);
  });

  it("reports a fetch failure without storing", async () => {
    const save = vi.fn(async () => 0);
    const run = await runItaFacebookSourceWith({
      lookbackMinutes: 20,
      fetchPosts: async () => {
        throw new Error("Apify usage cap reached (HTTP 403)");
      },
      save,
    });
    expect(run).toEqual({
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes: 20,
      error: "Apify usage cap reached (HTTP 403)",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("fails a run whose items no longer match the schema", async () => {
    const run = await runItaFacebookSourceWith({
      lookbackMinutes: 20,
      fetchPosts: async () => ({ posts: [], rejected: 2 }),
      save: async () => 0,
    });
    expect(run.error).toBe("ITA Facebook feed rejected 2 posts");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run src/lib/__tests__/ita-facebook.test.ts`
Expected: FAIL, cannot resolve `@/lib/text-sources/ita-facebook.server`.

- [ ] **Step 3: Export the revision builder**

In `src/lib/text-sources/ita-pipeline.server.ts` change `type Revision = {` to `export type Revision = {` and `async function revision(` to `export async function revision(`. No other change.

- [ ] **Step 4: Implement the collector**

`src/lib/text-sources/ita-facebook.server.ts`:

```ts
import { archivedFetch } from "@/lib/source-archive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { ClaimedSourceJob } from "@/lib/source-jobs";
import type { ItaFeedPost } from "./ita-feed";
import { fetchItaApifyPosts } from "./ita-apify";
import { revision, type Revision } from "./ita-pipeline.server";

export type ItaFacebookRun = {
  fetched: number;
  stored: number;
  rejected: number;
  lookbackMinutes: number;
  error?: string;
};

export function apifyLookback(dataFrom: string, now: number): number {
  const since = Math.ceil((now - Date.parse(dataFrom)) / 60_000) + 2;
  return Math.min(Math.max(since, 20), 60);
}

export async function runItaFacebookSourceWith({
  lookbackMinutes,
  fetchPosts,
  save,
}: {
  lookbackMinutes: number;
  fetchPosts: () => Promise<{ posts: ItaFeedPost[]; rejected: number }>;
  save: (posts: Revision[]) => Promise<number>;
}): Promise<ItaFacebookRun> {
  let batch: { posts: ItaFeedPost[]; rejected: number };
  try {
    batch = await fetchPosts();
  } catch (cause) {
    return {
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes,
      error: cause instanceof Error ? cause.message : "Apify upstream unavailable",
    };
  }
  const stored = await save(await Promise.all(batch.posts.map(revision)));
  return {
    fetched: batch.posts.length,
    stored,
    rejected: batch.rejected,
    lookbackMinutes,
    ...(batch.rejected
      ? { error: `ITA Facebook feed rejected ${batch.rejected} posts` }
      : {}),
  };
}

export async function runItaFacebookSource(
  job: ClaimedSourceJob,
): Promise<ItaFacebookRun> {
  const minutes = apifyLookback(job.data_from, Date.now());
  const token = process.env["APIFY_TOKEN"];
  const taskId = process.env["APIFY_ITA_TASK_ID"];
  if (!token || !taskId)
    return {
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes: minutes,
      error: "APIFY_TOKEN or APIFY_ITA_TASK_ID not configured",
    };
  return runItaFacebookSourceWith({
    lookbackMinutes: minutes,
    fetchPosts: () =>
      fetchItaApifyPosts(
        { taskId, token, lookbackMinutes: minutes },
        (input, init) =>
          archivedFetch("ita_facebook", "apify_posts", input, init, {
            requestParams: { lookback_minutes: minutes, results_limit: 20 },
          }),
      ),
    async save(posts) {
      const { data, error } = await supabaseAdmin.rpc(
        "save_ita_facebook_posts",
        {
          _job: job.id,
          _attempt: job.attempt_count,
          _posts: posts as unknown as Json,
        },
      );
      if (error) throw new Error(`ITA Facebook storage: ${error.message}`);
      return data;
    },
  });
}
```

In `src/integrations/supabase/types.ts`, directly above `      save_ita_feed: {`, add:

```ts
      save_ita_facebook_posts: {
        Args: { _attempt: number; _job: string; _posts: Json };
        Returns: number;
      };
```

- [ ] **Step 5: Run the collector tests to verify they pass**

Run: `bunx vitest run src/lib/__tests__/ita-facebook.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Write the failing runner tests**

In `src/lib/__tests__/source-runners.test.ts`, inside `dependencies()` directly after the `runItaSource` mock, add:

```ts
    runItaFacebookSource: vi.fn().mockResolvedValue({
      fetched: 2,
      stored: 1,
      rejected: 0,
      lookbackMinutes: 22,
    }),
```

and after the test that ends with `expect(deps.fuseDetections).not.toHaveBeenCalled();` (the `ita_website` backlog case), add:

```ts
  it("reports a capped Apify account as an unreachable upstream", async () => {
    const deps = dependencies();
    deps.runItaFacebookSource.mockResolvedValue({
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes: 22,
      error: "Apify usage cap reached (HTTP 403)",
    });
    const result = await createSourceRunners(deps).ita_facebook(
      job("ita_facebook"),
    );
    expect(result).toMatchObject({
      outcome: "failed",
      publicReasonCode: "upstream_unreachable",
      retryDisposition: "transient",
      privateDiagnostic: "Apify usage cap reached (HTTP 403)",
      qualityChecks: { lookback_minutes: 22 },
    });
  });
```

Run: `bunx vitest run src/lib/__tests__/source-runners.test.ts`
Expected: FAIL, `ita_facebook` is not a runner.

- [ ] **Step 7: Wire the runner**

In `src/lib/ingest/source-runners.server.ts`:

1. Below `import { runItaSource } from "@/lib/text-sources/ita-pipeline.server";` add
   `import { runItaFacebookSource } from "@/lib/text-sources/ita-facebook.server";`
2. In `RUNTIME_CONTRACT_KEYS`, after `"ita_website",` add `"ita_facebook",`.
3. In `SourceRunnerDependencies`, after `runItaSource: typeof runItaSource;` add
   `runItaFacebookSource: typeof runItaFacebookSource;`.
4. In `createSourceRunners`, after the `ita_website` runner add:

```ts
    ita_facebook: async (job) => {
      const run = await dependencies.runItaFacebookSource(job);
      const health = adapterHealth({ accepted: run.fetched, error: run.error });
      return {
        ...baseReport(job),
        ...health,
        ...coveredInterval(job, health.outcome === "succeeded"),
        recordsSeen: run.fetched,
        recordsInserted: run.stored,
        recordsRejected: run.rejected,
        qualityChecks: { lookback_minutes: run.lookbackMinutes },
      };
    },
```

5. In `sourceRunnerDependencies`, after `runItaSource,` add `runItaFacebookSource,`.

- [ ] **Step 8: Document the secrets**

In `.env.example`, after the `OPENROUTER_MODEL=""` line add:

```
# ITA Facebook bridge (server-side). Unset means the ita_facebook source fails as
# credentials_missing; the website feed keeps running.
APIFY_TOKEN=""
APIFY_ITA_TASK_ID=""
```

In `README.md`, extend the runtime secret list (line 156–157) so it ends:
`` `EUMETSAT_CONSUMER_KEY`, `EUMETSAT_CONSUMER_SECRET`, `APIFY_TOKEN`, `APIFY_ITA_TASK_ID`, `NADHIR_CRON_SECRET`. ``

- [ ] **Step 9: Run every CI gate**

Run: `bunx tsc --noEmit && bun run test && bun run lint`
Expected: tsc clean, all tests pass (the registry test "contains exactly one runner for every runtime contract" now includes `ita_facebook`), lint 0 errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/text-sources/ita-facebook.server.ts src/lib/text-sources/ita-pipeline.server.ts src/lib/ingest/source-runners.server.ts src/integrations/supabase/types.ts src/lib/__tests__/ita-facebook.test.ts src/lib/__tests__/source-runners.test.ts .env.example README.md
git commit -m "Run the ita_facebook source on the worker through Apify"
```

---

### Task 4: Rollout

Owner actions come first because the contract is scheduled the moment the migration lands.

- [ ] **Step 1 (owner): Raise the Apify monthly hard limit to $30**

Apify console → Settings → Usage & billing → Limits. Until this is done every run fails with HTTP 403 and the watchdog alerts hourly. Verify:

```bash
curl -sS -H "Authorization: Bearer $APIFY_TOKEN" https://api.apify.com/v2/users/me/limits | jq '.data.limits.maxMonthlyUsageUsd'
```
Expected: `30`.

- [ ] **Step 2 (lead, with a named OK): Set the worker secrets**

```bash
bunx wrangler secret put APIFY_TOKEN
bunx wrangler secret put APIFY_ITA_TASK_ID
```
Values from `.env.local`. Expected: `Success! Uploaded secret`.

- [ ] **Step 3: Open the PR and wait for green CI**

Push the branch, open the PR, and read `gh pr checks <n> --watch` plus review comments. A `db-tests` failure reading `toomanyrequests` is the runner's registry quota: rerun the failed job.

- [ ] **Step 4 (owner OK naming the PR): Merge, then disable the Apify schedule**

After the deploy job succeeds:

```bash
curl -sS -X PUT -H "Authorization: Bearer $APIFY_TOKEN" -H "Content-Type: application/json" \
  https://api.apify.com/v2/schedules/$APIFY_ITA_SCHEDULE_ID -d '{"isEnabled":false}' | jq '.data.isEnabled'
```
Expected: `false`.

- [ ] **Step 5: Verify in production**

Within 20 minutes of the deploy, query with the service role:
- `source_runs` for `ita_facebook`: latest `outcome = succeeded`.
- `source_health` for `ita_facebook`: `state = healthy`.
- `ita_reports` rows with `raw->>'region' = ''`: posts from the bridge (on a quiet page this can take an hour).
- `source_watchdog`: no `ita_facebook` row.
