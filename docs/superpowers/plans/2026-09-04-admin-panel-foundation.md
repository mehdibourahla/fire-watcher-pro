# Admin Panel Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the authority layer every later admin surface depends on — split roles, one append-only audit log, the `/admin` shell with role gating, and a triage home.

**Architecture:** Database-first. Every mutation is a `security definer` function that checks the role, writes the change and writes its audit row in one transaction. The React panel calls those functions and never writes tables directly. Role checks live in Postgres so no key can route around them.

**Tech Stack:** Postgres 15 (Supabase), pgTAP, TanStack Router (file-based), TanStack Query, react-i18next, Vitest, Bun.

This is plan 1 of 7. Milestones 2–7 in the spec each get their own plan; none may start before this one is green.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-04-admin-panel-design.md`. It is authority; this plan implements it.
- Roles are `admin, operator, report_moderator, translator, incident_editor, user`. `moderator` is retired and must be unreachable, not deleted from `pg_enum`.
- A function that mutates without writing `admin_audit` is a defect.
- A server route is permitted only for operations that leave Postgres. None in this plan.
- Admin strings are the i18next `admin` namespace, `en` and `fr` only. They must never enter `Translation`.
- Zero comments in code except a single line for a non-obvious *why*.
- Copy follows `docs/CONTEXT.md`: the object is a **Fire**, never "cluster"; never render raw `state` words; "confirmed" is reserved for an authority.
- `alter type ... add value` cannot be used in the transaction that adds it. Enum growth and its first use are separate migration files.
- Gates before every commit: `bunx tsc --noEmit`, `bun run test`, `bun run lint`, and `supabase test db` when SQL changed.

---

### Task 1: Grow the role enum

**Files:**
- Create: `supabase/migrations/20260904200000_admin_roles_add_values.sql`

**Interfaces:**
- Produces: enum labels `operator`, `report_moderator`, `translator`, `incident_editor` on `public.app_role`. Nothing may use them until Task 2 (separate transaction).

- [ ] **Step 1: Write the migration**

```sql
-- Separate file from every use: PG refuses a new enum value in the transaction that added it.
alter type public.app_role add value if not exists 'operator';
alter type public.app_role add value if not exists 'report_moderator';
alter type public.app_role add value if not exists 'translator';
alter type public.app_role add value if not exists 'incident_editor';
```

- [ ] **Step 2: Apply locally and verify the labels exist**

Run: `supabase db reset --no-seed` is FORBIDDEN in this repo. Instead run `supabase migration up`.
Then: `supabase db diff --schema public` — expect no drift.
Verify: `psql -c "select unnest(enum_range(null::public.app_role));"` lists six labels.
Expected: `admin, moderator, user, operator, report_moderator, translator, incident_editor`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904200000_admin_roles_add_values.sql
git commit -m "Add the per-domain role labels to app_role"
```

---

### Task 2: Retire `moderator` and rewrite every policy that names it

**Files:**
- Create: `supabase/migrations/20260904200100_admin_roles_retire_moderator.sql`
- Create: `supabase/tests/admin_roles.test.sql`

**Interfaces:**
- Consumes: enum labels from Task 1.
- Produces: `public.has_any_role(uuid, public.app_role[]) returns boolean`. `user_roles.role` rejects `moderator`.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
begin;
set local search_path = public, extensions;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('ad010000-0000-4000-8000-000000000001'::uuid, 'ad01-translator@example.invalid'),
  ('ad010000-0000-4000-8000-000000000002'::uuid, 'ad01-operator@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role) values
  ('ad010000-0000-4000-8000-000000000001', 'translator'),
  ('ad010000-0000-4000-8000-000000000002', 'operator');

select ok(
  public.has_any_role('ad010000-0000-4000-8000-000000000001', array['translator','admin']::public.app_role[]),
  'has_any_role matches one of several roles');

select ok(
  not public.has_any_role('ad010000-0000-4000-8000-000000000001', array['operator','admin']::public.app_role[]),
  'has_any_role denies a role the user lacks');

select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('ad010000-0000-4000-8000-000000000002', 'moderator')$$,
  null, null, 'moderator can no longer be granted');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and qual like '%''moderator''%'),
  0, 'no public policy still names moderator');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and with_check like '%''moderator''%'),
  0, 'no public policy check still names moderator');

select is(
  (select count(*)::int from public.user_roles where role = 'moderator'),
  0, 'no moderator grant survives the migration');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `supabase test db`
Expected: FAIL — `has_any_role` does not exist.

- [ ] **Step 3: Write the migration**

Expand grants first, then rewrite policies, then lock the value out.

```sql
create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = any(_roles)
  )
$$;

revoke execute on function public.has_any_role(uuid, public.app_role[]) from anon, public;
grant execute on function public.has_any_role(uuid, public.app_role[]) to authenticated, service_role;

insert into public.user_roles (user_id, role)
select ur.user_id, r.role
from public.user_roles as ur
cross join (values
  ('report_moderator'::public.app_role),
  ('translator'::public.app_role),
  ('incident_editor'::public.app_role)
) as r(role)
where ur.role = 'moderator'
on conflict do nothing;

drop policy if exists "moderators read all reports" on public.citizen_reports;
create policy "report moderators read all reports"
  on public.citizen_reports for select
  using (public.has_any_role(auth.uid(), array['report_moderator','operator','admin']::public.app_role[]));

drop policy if exists "moderators update reports" on public.citizen_reports;
create policy "report moderators update reports"
  on public.citizen_reports for update
  using (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]));

drop policy if exists "moderators resolve clusters" on public.fire_clusters;
create policy "operators resolve fires"
  on public.fire_clusters for update
  using (public.has_any_role(auth.uid(), array['operator','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['operator','admin']::public.app_role[]));

drop policy if exists "moderators read suggestions" on public.translation_suggestions;
create policy "translators read suggestions"
  on public.translation_suggestions for select
  using (public.has_any_role(auth.uid(), array['translator','admin']::public.app_role[]));

drop policy if exists "moderators update suggestions" on public.translation_suggestions;
create policy "translators update suggestions"
  on public.translation_suggestions for update
  using (public.has_any_role(auth.uid(), array['translator','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['translator','admin']::public.app_role[]));

drop policy if exists "moderators read every idea" on public.contribution_ideas;
create policy "report moderators read every idea"
  on public.contribution_ideas for select
  using (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]));

drop policy if exists "moderators update ideas" on public.contribution_ideas;
create policy "report moderators update ideas"
  on public.contribution_ideas for update
  using (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]));

drop policy if exists "report photos moderator read" on storage.objects;
create policy "report photos moderator read"
  on storage.objects for select
  using (
    bucket_id = 'report-photos'
    and public.has_any_role(auth.uid(), array['report_moderator','operator','admin']::public.app_role[])
  );

delete from public.user_roles where role = 'moderator';

alter table public.user_roles
  add constraint user_roles_moderator_retired check (role <> 'moderator');
```

- [ ] **Step 4: Run the test and the whole db suite**

Run: `supabase test db`
Expected: PASS, and every pre-existing test still passes.

- [ ] **Step 5: Update the three pgTAP tests that grant `moderator`**

`supabase/tests/last_admin_invariant.test.sql`, `contribution_moderation_privacy.test.sql`,
`report_photo_security.test.sql` insert `'moderator'` fixtures. Replace each with the role that
now carries the privilege the test asserts: `report_moderator` for report and idea tests,
`translator` for the translation-privacy test. Do not add a role the test does not exercise.

Run: `supabase test db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260904200100_admin_roles_retire_moderator.sql supabase/tests/
git commit -m "Retire the flat moderator role for per-domain roles"
```

---

### Task 3: The audit log

**Files:**
- Create: `supabase/migrations/20260904200200_admin_audit.sql`
- Create: `supabase/tests/admin_audit.test.sql`

**Interfaces:**
- Produces: table `public.admin_audit`; function
  `public.record_admin_audit(_domain text, _action text, _target_table text, _target_id text, _before jsonb, _after jsonb, _reason text, _actor_label text) returns uuid`.
  Every later admin function calls it as its last statement.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
begin;
set local search_path = public, extensions;
select plan(4);

select has_table('public', 'admin_audit', 'admin_audit exists');

select lives_ok(
  $$select public.record_admin_audit('queues','translation.reject','translation_suggestions',
      '00000000-0000-4000-8000-000000000001', null, '{"status":"rejected"}'::jsonb,
      'register', 'test-job')$$,
  'record_admin_audit accepts a system write');

select is(
  (select actor_kind from public.admin_audit order by at desc limit 1),
  'system', 'a null auth.uid() records as system');

select throws_ok(
  $$update public.admin_audit set reason = 'tampered'$$,
  null, null, 'admin_audit rows cannot be updated');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `supabase test db`
Expected: FAIL — relation `admin_audit` does not exist.

- [ ] **Step 3: Write the migration**

```sql
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

create policy "admins read all audit" on public.admin_audit for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "actors read their own audit" on public.admin_audit for select
  using (actor_user_id = auth.uid());

revoke all on table public.admin_audit from public, anon, authenticated;
grant select on table public.admin_audit to authenticated;

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
```

Append-only is enforced by granting no `update` or `delete` to any role. `service_role`
bypasses RLS but not missing table privileges, so it cannot rewrite history either.

- [ ] **Step 4: Run the tests**

Run: `supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904200200_admin_audit.sql supabase/tests/admin_audit.test.sql
git commit -m "Add the append-only admin audit log"
```

---

### Task 4: Fold `broadcast_audit` into `admin_audit`

**Files:**
- Create: `supabase/migrations/20260904200300_fold_broadcast_audit.sql`
- Modify: `src/lib/broadcast-admin.ts`
- Modify: `src/routes/_authenticated/broadcasts.tsx`
- Modify: `supabase/tests/broadcast_control_plane.test.sql`

**Interfaces:**
- Consumes: `admin_audit` and `record_admin_audit` from Task 3.
- Produces: `broadcast_audit` no longer exists; broadcast history reads `admin_audit` filtered to `domain = 'broadcasts'`.

- [ ] **Step 1: Read the current writer and reader before changing either**

Run: `grep -rn "broadcast_audit" src/ supabase/ scripts/`
Every writer must move in this task. A missed writer means broadcast history silently stops.

- [ ] **Step 2: Write the migration**

```sql
insert into public.admin_audit (at, actor_kind, actor_label, domain, action, target_table, target_id, after, reason)
select
  ba.at,
  'system',
  'broadcast-audit-backfill',
  'broadcasts',
  'broadcast.' || ba.action,
  'broadcasts',
  ba.cluster_id::text,
  jsonb_strip_nulls(jsonb_build_object(
    'kind', ba.kind,
    'phase', ba.phase,
    'severity', ba.severity,
    'commune_codes', to_jsonb(ba.commune_codes),
    'onm_vigilance_id', ba.onm_vigilance_id,
    'payload', ba.payload
  )),
  ba.reason
from public.broadcast_audit as ba;

drop table public.broadcast_audit;
```

- [ ] **Step 3: Move every writer and reader**

Replace each `insert into broadcast_audit (...)` with a `record_admin_audit` call carrying
`domain => 'broadcasts'` and the same fields inside `_after`. Rewrite the history view in
`broadcasts.tsx` to read `admin_audit` where `domain = 'broadcasts'`, ordered by `at desc`.

- [ ] **Step 4: Run everything**

Run: `supabase test db && bunx tsc --noEmit && bun run test && bun run lint`
Expected: all pass. Confirm the backfilled row count matches what step 1 reported.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Fold broadcast_audit into the central admin audit log"
```

---

### Task 5: The admin i18n namespace

**Files:**
- Create: `src/i18n/admin/en.ts`
- Create: `src/i18n/admin/fr.ts`
- Modify: `src/i18n/index.ts`
- Create: `src/lib/__tests__/admin-namespace.test.ts`

**Interfaces:**
- Produces: `AdminTranslation` type (structural over `src/i18n/admin/en.ts`), i18next namespace `admin` with `en` and `fr` resources. Read with `useTranslation("admin")`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { rowsFor } from "@/lib/translate";
import { adminEn } from "@/i18n/admin/en";
import { adminFr } from "@/i18n/admin/fr";

const leaves = (tree: object, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? [path] : leaves(v as object, path);
  });

describe("admin namespace", () => {
  it("never reaches a translator's review queue", () => {
    for (const locale of ["ar", "fr", "kab"] as const) {
      expect(rowsFor(locale).filter((r) => r.path.startsWith("admin."))).toEqual([]);
    }
  });

  it("has a French string for every English one", () => {
    expect(leaves(adminFr).sort()).toEqual(leaves(adminEn).sort());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run test src/lib/__tests__/admin-namespace.test.ts`
Expected: FAIL — cannot resolve `@/i18n/admin/en`.

- [ ] **Step 3: Create the two bundles**

```ts
export const adminEn = {
  nav: {
    triage: "Triage",
    sources: "Sources",
    fires: "Fires",
    risk: "Risk",
    incidents: "Incidents",
    broadcasts: "Broadcasts",
    queues: "Queues",
    places: "Places",
    people: "People",
    audit: "Audit",
  },
  shell: {
    title: "Operations",
    noAccess: "This area is reserved for Nadhir operators.",
    signedInAs: "Signed in as {{name}}",
  },
  triage: {
    title: "What needs attention",
    allClear: "Everything is current.",
    checkedAt: "Checked {{time}}",
    killSwitch: "Broadcasts are suppressed by the kill-switch.",
    sourceStale: "{{name}} has not reported since {{time}}.",
    riskUnpublished: "The risk forecast has not published for today's checkpoint.",
    firesAwaiting: "{{count}} fires await resolution above the alerting bar.",
    translationUnapplied: "{{count}} accepted translations have not reached their locale file.",
    queueDepth: "{{count}} items waiting, oldest {{age}}.",
  },
} as const;

export type AdminTranslation = typeof adminEn;
```

```ts
import type { AdminTranslation } from "./en";

export const adminFr: AdminTranslation = {
  nav: {
    triage: "Triage",
    sources: "Sources",
    fires: "Incendies",
    risk: "Risque",
    incidents: "Incidents",
    broadcasts: "Diffusions",
    queues: "Files",
    places: "Lieux",
    people: "Personnes",
    audit: "Journal",
  },
  shell: {
    title: "Exploitation",
    noAccess: "Cet espace est réservé aux opérateurs de Nadhir.",
    signedInAs: "Connecté en tant que {{name}}",
  },
  triage: {
    title: "À traiter",
    allClear: "Tout est à jour.",
    checkedAt: "Vérifié {{time}}",
    killSwitch: "Les diffusions sont suspendues par le coupe-circuit.",
    sourceStale: "{{name}} n'a rien transmis depuis {{time}}.",
    riskUnpublished: "La prévision de risque n'a pas été publiée pour le point du jour.",
    firesAwaiting: "{{count}} incendies attendent une résolution au-dessus du seuil d'alerte.",
    translationUnapplied: "{{count}} traductions acceptées ne sont pas arrivées dans leur fichier.",
    queueDepth: "{{count}} éléments en attente, le plus ancien {{age}}.",
  },
};
```

- [ ] **Step 4: Register the namespace**

In `src/i18n/index.ts`, import both bundles and extend the resources so `en` and `fr` carry a
second namespace, leaving `ar` and `kab` untouched:

```ts
resources: {
  ar: { translation: ar },
  fr: { translation: fr, admin: adminFr },
  en: { translation: en, admin: adminEn },
  kab: { translation: kab },
},
```

An `ar` or `kab` operator falls back to English admin copy through `fallbackLng`, which is the
intended behaviour rather than a gap.

- [ ] **Step 5: Run the tests**

Run: `bun run test src/lib/__tests__/admin-namespace.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/admin src/i18n/index.ts src/lib/__tests__/admin-namespace.test.ts
git commit -m "Add the admin i18n namespace in English and French"
```

---

### Task 6: The `/admin` shell and its role gate

**Files:**
- Create: `src/lib/admin-access.ts`
- Create: `src/lib/__tests__/admin-access.test.ts`
- Create: `src/routes/_authenticated/admin/route.tsx`
- Create: `src/routes/_authenticated/admin/index.tsx`

**Interfaces:**
- Consumes: `myRolesQuery` from `src/lib/reports.ts`; `AdminTranslation` from Task 5.
- Produces: `ADMIN_SECTIONS: AdminSection[]` and `sectionsFor(roles: AppRole[]): AdminSection[]`, where `AdminSection = { key: string; path: string; roles: AppRole[] }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { ADMIN_SECTIONS, sectionsFor } from "@/lib/admin-access";

describe("admin access", () => {
  it("gives a translator the queues and nothing else", () => {
    expect(sectionsFor(["translator"]).map((s) => s.key)).toEqual(["triage", "queues"]);
  });

  it("gives an admin every section", () => {
    expect(sectionsFor(["admin"]).length).toBe(ADMIN_SECTIONS.length);
  });

  it("gives a plain user nothing", () => {
    expect(sectionsFor(["user"])).toEqual([]);
  });

  it("declares roles for every section", () => {
    for (const section of ADMIN_SECTIONS) expect(section.roles.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run test src/lib/__tests__/admin-access.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin-access`.

- [ ] **Step 3: Write the module**

```ts
import type { AppRole } from "./roles";

export type AdminSection = { key: string; path: string; roles: AppRole[] };

const ALL: AppRole[] = [
  "admin",
  "operator",
  "report_moderator",
  "translator",
  "incident_editor",
];

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: "triage", path: "/admin", roles: ALL },
  { key: "sources", path: "/admin/sources", roles: ["operator", "admin"] },
  { key: "fires", path: "/admin/fires", roles: ["operator", "admin"] },
  { key: "risk", path: "/admin/risk", roles: ["operator", "admin"] },
  { key: "incidents", path: "/admin/incidents", roles: ["incident_editor", "operator", "admin"] },
  { key: "broadcasts", path: "/admin/broadcasts", roles: ["operator", "admin"] },
  { key: "queues", path: "/admin/queues", roles: ["report_moderator", "translator", "admin"] },
  { key: "places", path: "/admin/places", roles: ["operator", "admin"] },
  { key: "people", path: "/admin/people", roles: ["admin"] },
  { key: "audit", path: "/admin/audit", roles: ALL },
];

export function sectionsFor(roles: AppRole[]): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => s.roles.some((r) => roles.includes(r)));
}
```

- [ ] **Step 4: Run the test**

Run: `bun run test src/lib/__tests__/admin-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the shell route**

`src/routes/_authenticated/admin/route.tsx` renders the nav from `sectionsFor`, shows
`shell.noAccess` when it is empty, and renders `<Outlet />` otherwise. Follow the loading
pattern in `moderation.tsx`: hold the subtree while `myRolesQuery` resolves rather than
flashing the denial. Labels come from `useTranslation("admin")` as `nav.<key>`.

- [ ] **Step 6: Run the gates and commit**

Run: `bunx tsc --noEmit && bun run test && bun run lint`

```bash
git add src/lib/admin-access.ts src/lib/__tests__/admin-access.test.ts src/routes/_authenticated/admin
git commit -m "Add the admin shell with per-section role gating"
```

---

### Task 7: The triage home

**Files:**
- Create: `src/lib/admin-triage.ts`
- Create: `src/lib/__tests__/admin-triage.test.ts`
- Modify: `src/routes/_authenticated/admin/index.tsx`

**Interfaces:**
- Consumes: nothing from Task 6 beyond the shell rendering it.
- Produces: `type TriageRow = { key: string; severity: 1 | 2 | 3; count?: number }` and
  `rankTriage(input: TriageInput): TriageRow[]`, ordered most severe first.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { rankTriage } from "@/lib/admin-triage";

const quiet = {
  killSwitchEngaged: false,
  staleSources: [],
  riskUnpublished: false,
  firesAwaiting: 0,
  translationsUnapplied: 0,
  queueDepth: 0,
};

describe("rankTriage", () => {
  it("returns nothing when the system is current", () => {
    expect(rankTriage(quiet)).toEqual([]);
  });

  it("puts the kill-switch above everything else", () => {
    const rows = rankTriage({ ...quiet, killSwitchEngaged: true, queueDepth: 40 });
    expect(rows[0]?.key).toBe("killSwitch");
  });

  it("ranks a stale source above waiting queue items", () => {
    const rows = rankTriage({ ...quiet, staleSources: ["FIRMS"], queueDepth: 12 });
    expect(rows.map((r) => r.key)).toEqual(["sourceStale", "queueDepth"]);
  });

  it("carries counts through for the copy to interpolate", () => {
    const rows = rankTriage({ ...quiet, firesAwaiting: 3 });
    expect(rows[0]).toEqual({ key: "firesAwaiting", severity: 2, count: 3 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run test src/lib/__tests__/admin-triage.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin-triage`.

- [ ] **Step 3: Write the module**

```ts
export type TriageInput = {
  killSwitchEngaged: boolean;
  staleSources: string[];
  riskUnpublished: boolean;
  firesAwaiting: number;
  translationsUnapplied: number;
  queueDepth: number;
};

export type TriageRow = { key: string; severity: 1 | 2 | 3; count?: number };

export function rankTriage(input: TriageInput): TriageRow[] {
  const rows: TriageRow[] = [];
  if (input.killSwitchEngaged) rows.push({ key: "killSwitch", severity: 1 });
  if (input.staleSources.length > 0)
    rows.push({ key: "sourceStale", severity: 1, count: input.staleSources.length });
  if (input.riskUnpublished) rows.push({ key: "riskUnpublished", severity: 1 });
  if (input.firesAwaiting > 0)
    rows.push({ key: "firesAwaiting", severity: 2, count: input.firesAwaiting });
  if (input.translationsUnapplied > 0)
    rows.push({ key: "translationUnapplied", severity: 2, count: input.translationsUnapplied });
  if (input.queueDepth > 0)
    rows.push({ key: "queueDepth", severity: 3, count: input.queueDepth });
  return rows.sort((a, b) => a.severity - b.severity);
}
```

`sort` on an already-ordered array is stable in V8, so equal severities keep the order above,
which is the spec's consequence ranking.

- [ ] **Step 4: Run the test**

Run: `bun run test src/lib/__tests__/admin-triage.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the real inputs**

In `src/routes/_authenticated/admin/index.tsx`, gather each field with TanStack Query:
`broadcast_settings` for the kill-switch, `source_health` for stale sources,
`risk_publication_checkpoint` for publication, `fire_clusters` where `state` is unresolved and
`confidence >= 0.6` for fires awaiting, `translation_suggestions` where `status = 'accepted'`
for unapplied translations, and the sum of pending queue rows for depth. Render `rankTriage`
output with `useTranslation("admin")` on `triage.<key>`. When the list is empty render
`triage.allClear` with `triage.checkedAt` — never a blank screen.

- [ ] **Step 6: Run the gates and commit**

Run: `bunx tsc --noEmit && bun run test && bun run lint`

```bash
git add src/lib/admin-triage.ts src/lib/__tests__/admin-triage.test.ts src/routes/_authenticated/admin/index.tsx
git commit -m "Add the triage home ranked by consequence"
```

---

## Self-review notes

- Spec coverage for this milestone: roles (Tasks 1–2), audit (Tasks 3–4), shell and gating
  (Task 6), triage (Task 7), FR/EN namespace (Task 5). Route migration of `/moderation`,
  `/team` and `/broadcasts` belongs to milestones 2, 3 and 6 respectively and is not in scope
  here; the old routes keep working until then.
- `supabase db reset` is forbidden by the repo's protected-operations rule and is called out in
  Task 1 so nobody reaches for it.
- Verified: `REVIEWABLE` in `src/lib/translate.ts` is `["ar","fr","kab"]`, so the Task 5 test
  loop over those three locales typechecks as written.
