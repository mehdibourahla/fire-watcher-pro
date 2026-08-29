# Persistent-Source Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Nadhir reporting gas flares as wildfires by screening detections against a registry of permanent industrial heat sources learned from NASA's own labels.

**Architecture:** A build script derives a registry of ~1 km grid cells from the FIRMS science-processed archive, where NASA's `type` field labels each detection as vegetation fire (0) or static land source (2). The registry is committed as reviewable JSON, seeded into a `persistent_sources` table, and consulted by a screen that runs between ingest and fusion and writes `detections.fp_reason`. Fusion already filters on that column and is not modified.

**Tech Stack:** TypeScript, bun, TanStack Start server routes, Supabase Postgres, vitest, Cloudflare Workers.

## Global Constraints

- Package manager is **bun**, never npm. Lockfile is `bun.lock`.
- Grid resolution is **0.01°**. Cell key is `[Math.round(lat / 0.01), Math.round(lon / 0.01)]`; the cell's stored position is its centre, `key * 0.01`.
- Registration criteria, all three required: `static_share >= 0.70`, `active_days >= 5`, `detection_count >= 10`.
- Screen radius is **1.5 km** from a registry cell centre.
- `fp_reason` value format is exactly `persistent_source:<site_id>`.
- **No escalation exemption.** Both candidates were measured and rejected in the spec; do not reintroduce one.
- No PostGIS (ADR-001). Distance work happens in application code with `haversineKm` from `@/lib/nadhir`.
- Comments: zero by default. One short line only where a non-obvious _why_ would otherwise be lost.
- Migration versions must exceed `20260829120000` and must be unique — check `supabase_migrations.schema_migrations` before choosing one (GAPS §5).
- Reads that can exceed 1000 rows must use `fetchAllPages` from `@/lib/paginate` (PostgREST truncates).
- Run `bun run format` before every commit; prettier is enforced through eslint.

---

### Task 1: Registry table

**Files:**

- Create: `supabase/migrations/20260830000000_<uuid>.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerate)

**Interfaces:**

- Produces: table `public.persistent_sources` with columns `id, lat, lon, site_id, site_name, static_share, active_days, detection_count, observation_days, first_seen, last_seen, frp_p50, frp_p90, jul_aug_share, created_at`.

- [ ] **Step 1: Confirm the version prefix is free**

Run:

```bash
export PGPASSWORD=$(cat ~/.config/nadhir/db-password)
psql "postgresql://postgres.kuukthyenirwgdfkltlm@aws-1-eu-west-3.pooler.supabase.com:5432/postgres" \
  -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 5"
```

Expected: `20260830000000` is absent. If present, use `20260830001000` and adjust the filename below.

- [ ] **Step 2: Write the migration**

Generate a uuid with `uuidgen | tr 'A-Z' 'a-z'` and use it in the filename.

```sql
-- Cells are stored as grid centres so the 1.5 km screen radius is well defined.
create table public.persistent_sources (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lon double precision not null,
  site_id text not null,
  site_name text,
  static_share double precision not null check (static_share >= 0 and static_share <= 1),
  active_days integer not null check (active_days >= 0),
  detection_count integer not null check (detection_count >= 0),
  observation_days integer not null check (observation_days > 0),
  first_seen date not null,
  last_seen date not null,
  frp_p50 double precision,
  frp_p90 double precision,
  jul_aug_share double precision,
  created_at timestamptz not null default now(),
  unique (lat, lon)
);

create index persistent_sources_site_idx on public.persistent_sources (site_id);

alter table public.persistent_sources enable row level security;

create policy "persistent sources are public reference data"
  on public.persistent_sources for select using (true);

grant select on public.persistent_sources to anon, authenticated;
grant all on public.persistent_sources to service_role;
```

- [ ] **Step 3: Apply the migration**

Run: `bunx supabase db push`
Expected: one migration applied, no error. Confirm `supabase/config.toml` names the intended project first.

- [ ] **Step 4: Verify the table exists**

Run:

```bash
psql "$DB" -c "\d persistent_sources"
```

Expected: the column list above, RLS enabled, one select policy.

- [ ] **Step 5: Regenerate types**

Run: `bunx supabase gen types typescript --linked > src/integrations/supabase/types.ts`
Then: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
bun run format
git add supabase/migrations src/integrations/supabase/types.ts
git commit -m "Add persistent_sources table"
```

---

### Task 2: Registry builder

**Files:**

- Create: `scripts/build-persistent-sources.ts`
- Create: `data/flares/algeria-persistent-sources.json` (output)
- Modify: `package.json` (add script)

**Interfaces:**

- Consumes: `FIRMS_MAP_KEY` from the environment.
- Produces: `data/flares/algeria-persistent-sources.json` with shape:
  ```ts
  type Registry = {
    source: string;
    built: string;
    window: { start: string; end: string };
    observation_days: number;
    criteria: {
      min_static_share: number;
      min_active_days: number;
      min_detections: number;
    };
    cells: Array<{
      lat: number;
      lon: number;
      site_id: string;
      static_share: number;
      active_days: number;
      detection_count: number;
      first_seen: string;
      last_seen: string;
      frp_p50: number;
      frp_p90: number;
      jul_aug_share: number;
    }>;
  };
  ```
- Produces: exported pure functions `cellKey`, `cellCentre`, `qualifies`, `siteIdFor` reused by Task 4 and Task 6.

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `src/lib/__tests__/persistent.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { cellCentre, cellKey, qualifies, siteIdFor } from "@/lib/persistent";

describe("grid", () => {
  it("keys a coordinate to its 0.01 degree cell and back to the centre", () => {
    expect(cellKey(31.6604, 6.0632)).toEqual([3166, 606]);
    expect(cellCentre([3166, 606])).toEqual({ lat: 31.66, lon: 6.06 });
  });

  it("keys negative longitudes without drifting a cell", () => {
    expect(cellKey(35.8112, -0.2629)).toEqual([3581, -26]);
    const c = cellCentre([3581, -26]);
    expect(c.lat).toBeCloseTo(35.81, 10);
    expect(c.lon).toBeCloseTo(-0.26, 10);
  });

  it("derives a stable site id from the cell key", () => {
    expect(siteIdFor([3166, 606])).toBe("dz-3166-606");
    expect(siteIdFor([3581, -26])).toBe("dz-3581--26");
  });
});

describe("registration criteria", () => {
  const base = { staticShare: 0.71, activeDays: 6, detectionCount: 12 };

  it("registers a cell meeting all three criteria", () => {
    expect(qualifies(base)).toBe(true);
  });

  it("rejects a cell below the static share floor", () => {
    expect(qualifies({ ...base, staticShare: 0.69 })).toBe(false);
  });

  it("rejects a persistent cell with too few detections to be stable", () => {
    expect(qualifies({ ...base, staticShare: 0.9, detectionCount: 8 })).toBe(
      false,
    );
  });

  it("rejects a cell seen on too few distinct days", () => {
    expect(qualifies({ ...base, activeDays: 4 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- persistent`
Expected: FAIL, cannot resolve `@/lib/persistent`.

- [ ] **Step 3: Write the pure helper module**

Create `src/lib/persistent.ts`:

```ts
export const GRID = 0.01;
export const MIN_STATIC_SHARE = 0.7;
export const MIN_ACTIVE_DAYS = 5;
export const MIN_DETECTIONS = 10;
export const SCREEN_RADIUS_KM = 1.5;

export type CellKey = [number, number];

export function cellKey(lat: number, lon: number): CellKey {
  return [Math.round(lat / GRID), Math.round(lon / GRID)];
}

export function cellCentre([y, x]: CellKey): { lat: number; lon: number } {
  return {
    lat: Number((y * GRID).toFixed(6)),
    lon: Number((x * GRID).toFixed(6)),
  };
}

export function siteIdFor([y, x]: CellKey): string {
  return `dz-${y}-${x}`;
}

export function qualifies(cell: {
  staticShare: number;
  activeDays: number;
  detectionCount: number;
}): boolean {
  return (
    cell.staticShare >= MIN_STATIC_SHARE &&
    cell.activeDays >= MIN_ACTIVE_DAYS &&
    cell.detectionCount >= MIN_DETECTIONS
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- persistent`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the builder script**

Create `scripts/build-persistent-sources.ts`:

```ts
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import {
  cellKey,
  cellCentre,
  qualifies,
  siteIdFor,
  MIN_STATIC_SHARE,
  MIN_ACTIVE_DAYS,
  MIN_DETECTIONS,
} from "../src/lib/persistent";

const key = process.env["FIRMS_MAP_KEY"];
if (!key) {
  console.error(
    "Set FIRMS_MAP_KEY. The registry is derived from the FIRMS science-processed archive.",
  );
  process.exit(1);
}

const SOURCE = "VIIRS_SNPP_SP";
const BBOX = "-9,18,12,38";
const START_YEAR = 2016;
const END_YEAR = 2025;
const CACHE = ".cache/firms-archive";
const OUT = "data/flares/algeria-persistent-sources.json";

mkdirSync(CACHE, { recursive: true });
mkdirSync("data/flares", { recursive: true });

function* windows() {
  for (let y = START_YEAR; y <= END_YEAR; y += 1) {
    for (
      let d = new Date(Date.UTC(y, 0, 1));
      d.getUTCFullYear() === y;
      d.setUTCDate(d.getUTCDate() + 5)
    ) {
      yield d.toISOString().slice(0, 10);
    }
  }
}

async function fetchWindow(day: string): Promise<string> {
  const path = `${CACHE}/${day}.csv`;
  if (existsSync(path)) return readFileSync(path, "utf8");
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${SOURCE}/${BBOX}/5/${day}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url);
    const body = await res.text();
    if (res.ok && body.startsWith("latitude")) {
      writeFileSync(path, body);
      return body;
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(`FIRMS window ${day} failed after 4 attempts`);
}

type Acc = {
  static: number;
  fire: number;
  days: Set<string>;
  frp: number[];
  julAug: number;
};
const cells = new Map<string, Acc>();
const observationDays = new Set<string>();

const all = [...windows()];
for (const [i, day] of all.entries()) {
  const csv = await fetchWindow(day);
  const lines = csv.split("\n");
  const head = lines[0]!.split(",");
  const iLat = head.indexOf("latitude");
  const iLon = head.indexOf("longitude");
  const iType = head.indexOf("type");
  const iDate = head.indexOf("acq_date");
  const iFrp = head.indexOf("frp");
  if (iType < 0)
    throw new Error(
      `${day}: archive returned no 'type' column; wrong FIRMS product`,
    );
  for (const line of lines.slice(1)) {
    const p = line.split(",");
    if (p.length <= iType) continue;
    const lat = Number(p[iLat]);
    const lon = Number(p[iLon]);
    const type = p[iType];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || type === "3")
      continue;
    const date = p[iDate]!;
    observationDays.add(date);
    const k = cellKey(lat, lon).join(",");
    let acc = cells.get(k);
    if (!acc) {
      acc = { static: 0, fire: 0, days: new Set(), frp: [], julAug: 0 };
      cells.set(k, acc);
    }
    if (type === "2") acc.static += 1;
    else if (type === "0") acc.fire += 1;
    acc.days.add(date);
    const frp = Number(p[iFrp]);
    if (Number.isFinite(frp)) acc.frp.push(frp);
    const month = date.slice(5, 7);
    if (month === "07" || month === "08") acc.julAug += 1;
  }
  if (i % 25 === 0) console.log(`  ${i}/${all.length} windows`);
}

const pct = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0;
};

const qualified: { key: [number, number]; acc: Acc; total: number }[] = [];
for (const [k, acc] of cells) {
  const total = acc.static + acc.fire;
  if (total === 0) continue;
  if (
    !qualifies({
      staticShare: acc.static / total,
      activeDays: acc.days.size,
      detectionCount: total,
    })
  )
    continue;
  qualified.push({
    key: k.split(",").map(Number) as [number, number],
    acc,
    total,
  });
}

// A refinery spans several cells; group adjacent ones so the map shows one site
// rather than a cloud of markers. Cells stay the screening unit.
const parent = new Map<string, string>();
const find = (a: string): string => {
  const p = parent.get(a);
  if (!p || p === a) return a;
  const root = find(p);
  parent.set(a, root);
  return root;
};
const union = (a: string, b: string) => {
  const [ra, rb] = [find(a), find(b)];
  if (ra !== rb) parent.set(ra, rb);
};
for (const q of qualified) parent.set(q.key.join(","), q.key.join(","));
for (const a of qualified) {
  for (const b of qualified) {
    if (a === b) continue;
    if (
      Math.abs(a.key[0] - b.key[0]) <= 2 &&
      Math.abs(a.key[1] - b.key[1]) <= 2
    ) {
      union(a.key.join(","), b.key.join(","));
    }
  }
}
const strongest = new Map<string, { key: [number, number]; total: number }>();
for (const q of qualified) {
  const root = find(q.key.join(","));
  const cur = strongest.get(root);
  if (!cur || q.total > cur.total)
    strongest.set(root, { key: q.key, total: q.total });
}

const out = qualified.map((q) => {
  const days = [...q.acc.days].sort();
  const root = find(q.key.join(","));
  return {
    ...cellCentre(q.key),
    site_id: siteIdFor(strongest.get(root)!.key),
    static_share: Number((q.acc.static / q.total).toFixed(4)),
    active_days: q.acc.days.size,
    detection_count: q.total,
    first_seen: days[0]!,
    last_seen: days[days.length - 1]!,
    frp_p50: Number(pct(q.acc.frp, 0.5).toFixed(2)),
    frp_p90: Number(pct(q.acc.frp, 0.9).toFixed(2)),
    jul_aug_share: Number((q.acc.julAug / q.total).toFixed(4)),
  };
});
out.sort((a, b) => b.detection_count - a.detection_count);
console.log(
  `grouped ${out.length} cells into ${new Set(out.map((c) => c.site_id)).size} sites`,
);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: `NASA FIRMS ${SOURCE}`,
      built: new Date().toISOString().slice(0, 10),
      window: { start: `${START_YEAR}-01-01`, end: `${END_YEAR}-12-31` },
      observation_days: observationDays.size,
      criteria: {
        min_static_share: MIN_STATIC_SHARE,
        min_active_days: MIN_ACTIVE_DAYS,
        min_detections: MIN_DETECTIONS,
      },
      cells: out,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `wrote ${out.length} cells to ${OUT} over ${observationDays.size} observation days`,
);
```

- [ ] **Step 6: Add the script entry and ignore the cache**

In `package.json` scripts, after `"seed:open-areas"`:

```json
"build:sources": "bun run scripts/build-persistent-sources.ts",
```

Append to `.gitignore`:

```
.cache/
```

- [ ] **Step 7: Run the builder**

Run:

```bash
set -a; . ~/.config/nadhir/secrets.env; set +a
bun run build:sources
```

Expected: roughly 730 windows fetched (~12 minutes on first run, seconds thereafter from cache), then a line reporting several hundred cells. Confirm the JSON contains Hassi Messaoud near `lat 31.66, lon 6.06` and Arzew near `lat 35.81, lon -0.26`.

- [ ] **Step 8: Commit**

```bash
bun run format
git add package.json .gitignore src/lib/persistent.ts src/lib/__tests__/persistent.test.ts scripts/build-persistent-sources.ts data/flares/algeria-persistent-sources.json
git commit -m "Build persistent-source registry from NASA type labels"
```

---

### Task 3: Seed the registry into the database

**Files:**

- Create: `scripts/seed-persistent-sources.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `data/flares/algeria-persistent-sources.json` from Task 2.
- Produces: rows in `public.persistent_sources`.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-persistent-sources.ts`, following the guard pattern in `scripts/seed-open-areas.ts`:

```ts
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key is required: seeding writes reference data that RLS blocks for anon.",
  );
  process.exit(1);
}
if (
  !url.startsWith("https://") &&
  !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)
) {
  console.error(
    "SUPABASE_URL must be https:// (or localhost for development).",
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const registry = JSON.parse(
  readFileSync("data/flares/algeria-persistent-sources.json", "utf8"),
) as {
  observation_days: number;
  cells: Array<Record<string, number | string>>;
};

const rows = registry.cells.map((c) => ({
  ...c,
  observation_days: registry.observation_days,
}));

const { error: clearError } = await db
  .from("persistent_sources")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
if (clearError) throw new Error(clearError.message);

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db
    .from("persistent_sources")
    .insert(rows.slice(i, i + 500));
  if (error) throw new Error(error.message);
}
console.log(`seeded ${rows.length} persistent source cells`);
```

- [ ] **Step 2: Add the script entry**

In `package.json` scripts:

```json
"seed:sources": "bun run scripts/seed-persistent-sources.ts",
```

- [ ] **Step 3: Run the seed**

Run:

```bash
set -a; . ~/.config/nadhir/secrets.env; set +a
export SUPABASE_URL="https://kuukthyenirwgdfkltlm.supabase.co"
bun run seed:sources
```

Expected: `seeded N persistent source cells`.

- [ ] **Step 4: Verify against the database**

Run:

```bash
psql "$DB" -c "select count(*), round(min(static_share)::numeric,2) from persistent_sources"
```

Expected: count matches the script output; minimum static_share ≥ 0.70.

- [ ] **Step 5: Commit**

```bash
bun run format
git add package.json scripts/seed-persistent-sources.ts
git commit -m "Seed persistent_sources from the committed registry"
```

---

### Task 4: The screen

**Files:**

- Create: `src/lib/ingest/persistent.server.ts`
- Modify: `src/lib/ingest/pipeline.server.ts`
- Modify: `src/lib/__tests__/persistent.test.ts`

**Interfaces:**

- Consumes: `cellKey`, `SCREEN_RADIUS_KM` from `@/lib/persistent`; `haversineKm` from `@/lib/nadhir`.
- Produces: `screenPersistentSources(): Promise<{ screened: number }>` and the pure `nearestSource(lat, lon, sources)`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/persistent.test.ts`:

```ts
import { nearestSource } from "@/lib/ingest/persistent.server";

describe("screen radius", () => {
  const sources = [{ lat: 35.81, lon: -0.26, site_id: "dz-3581--26" }];

  it("screens a detection inside the radius", () => {
    expect(nearestSource(35.815, -0.262, sources)?.site_id).toBe("dz-3581--26");
  });

  it("leaves a detection beyond the radius alone", () => {
    expect(nearestSource(35.83, -0.3, sources)).toBeNull();
  });

  it("returns null when the registry is empty", () => {
    expect(nearestSource(35.81, -0.26, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- persistent`
Expected: FAIL, cannot resolve `@/lib/ingest/persistent.server`.

- [ ] **Step 3: Write the screen module**

Create `src/lib/ingest/persistent.server.ts`:

```ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { haversineKm } from "@/lib/nadhir";
import { fetchAllPages } from "@/lib/paginate";
import { SCREEN_RADIUS_KM } from "@/lib/persistent";

export type Source = { lat: number; lon: number; site_id: string };

export function nearestSource(
  lat: number,
  lon: number,
  sources: Source[],
): Source | null {
  let best: Source | null = null;
  let bestKm = SCREEN_RADIUS_KM;
  for (const s of sources) {
    const km = haversineKm(lat, lon, s.lat, s.lon);
    if (km <= bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return best;
}

export async function screenPersistentSources(): Promise<{ screened: number }> {
  const sources = await fetchAllPages<Source>((from, to) =>
    supabaseAdmin
      .from("persistent_sources")
      .select("lat, lon, site_id")
      .range(from, to),
  );
  if (!sources.length) return { screened: 0 };

  const pending = await fetchAllPages<{ id: string; lat: number; lon: number }>(
    (from, to) =>
      supabaseAdmin
        .from("detections")
        .select("id, lat, lon")
        .is("fp_reason", null)
        .is("cluster_id", null)
        .range(from, to),
  );

  const byReason = new Map<string, string[]>();
  for (const det of pending) {
    const hit = nearestSource(det.lat, det.lon, sources);
    if (!hit) continue;
    const reason = `persistent_source:${hit.site_id}`;
    const bucket = byReason.get(reason);
    if (bucket) bucket.push(det.id);
    else byReason.set(reason, [det.id]);
  }

  let screened = 0;
  for (const [reason, ids] of byReason) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabaseAdmin
        .from("detections")
        .update({ fp_reason: reason })
        .in("id", ids.slice(i, i + 200));
      if (error) throw new Error(`screen update failed: ${error.message}`);
      screened += ids.slice(i, i + 200).length;
    }
  }
  return { screened };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- persistent`
Expected: PASS, 10 tests.

- [ ] **Step 5: Add the fusion regression test**

The whole design rests on fusion honouring `fp_reason`. Append to `src/lib/__tests__/persistent.test.ts`:

```ts
import { readFileSync } from "node:fs";

describe("fusion contract", () => {
  it("still filters clustering on fp_reason", () => {
    const src = readFileSync("src/lib/ingest/fusion.server.ts", "utf8");
    expect(src).toContain('.is("fp_reason", null)');
  });
});
```

This is a guard, not a behavioural test: removing that filter would silently reintroduce every screened flare as a fire, and nothing else in the suite would fail.

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test -- persistent`
Expected: PASS, 11 tests.

- [ ] **Step 7: Wire it into the pipeline**

In `src/lib/ingest/pipeline.server.ts`, import at the top:

```ts
import { screenPersistentSources } from "./persistent.server";
```

Then in `runDetectionPipeline`, after the `ingestEumetsat()` block and **before** the `fuseDetections()` block, insert:

```ts
const screenStartedAt = new Date().toISOString();
const screen = await screenPersistentSources();
await recordRun("screen", screenStartedAt, {
  status: "ok",
  records_in: screen.screened,
  records_new: screen.screened,
});
```

- [ ] **Step 8: Verify ordering and types**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors. Confirm by reading the file that `screenPersistentSources` is awaited before `fuseDetections`; fusion's existing `.is("fp_reason", null)` filter is what makes the ordering matter.

- [ ] **Step 9: Commit**

```bash
bun run format
git add src/lib/ingest/persistent.server.ts src/lib/ingest/pipeline.server.ts src/lib/__tests__/persistent.test.ts
git commit -m "Screen detections against the persistent-source registry"
```

---

### Task 5: Reconcile existing detections and clusters

**Files:**

- Create: `scripts/reconcile-persistent-sources.ts`
- Modify: `src/lib/ingest/fusion.server.ts` (export two existing helpers)
- Modify: `package.json`

**Interfaces:**

- Consumes: `nearestSource` from Task 4; `confidenceScore` and `stateFor` newly exported from fusion.
- Produces: screened historical detections; affected clusters resolved or recomputed.

- [ ] **Step 1: Export the two helpers fusion already has**

In `src/lib/ingest/fusion.server.ts`, change:

```ts
function confidenceScore(dets: Det[]) {
```

to:

```ts
export function confidenceScore(dets: Det[]) {
```

and:

```ts
function stateFor(dets: Det[], lastMs: number, now: number) {
```

to:

```ts
export function stateFor(dets: Det[], lastMs: number, now: number) {
```

Export the `Det` type the same way if it is not already exported. Change nothing else in this file.

- [ ] **Step 2: Write the reconciliation script**

Create `scripts/reconcile-persistent-sources.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

import { confidenceScore, stateFor } from "../src/lib/ingest/fusion.server";
import {
  nearestSource,
  type Source,
} from "../src/lib/ingest/persistent.server";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const page = async <T>(
  table: string,
  select: string,
  apply: (q: any) => any,
) => {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(
      db
        .from(table)
        .select(select)
        .range(from, from + 999),
    );
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
};

const sources = await page<Source>(
  "persistent_sources",
  "lat, lon, site_id",
  (q) => q,
);
const dets = await page<{
  id: string;
  lat: number;
  lon: number;
  cluster_id: string | null;
  sensor: string;
  confidence_raw: number;
  detected_at: string;
  frp_mw: number | null;
}>(
  "detections",
  "id, lat, lon, cluster_id, sensor, confidence_raw, detected_at, frp_mw",
  (q) => q.is("fp_reason", null),
);

const screened: string[] = [];
const affected = new Set<string>();
for (const d of dets) {
  const hit = nearestSource(d.lat, d.lon, sources);
  if (!hit) continue;
  screened.push(d.id);
  if (d.cluster_id) affected.add(d.cluster_id);
}
console.log(
  `screening ${screened.length} historical detections across ${affected.size} clusters`,
);

for (let i = 0; i < screened.length; i += 200) {
  const slice = screened.slice(i, i + 200);
  const { error } = await db
    .from("detections")
    .update({ fp_reason: "persistent_source:backfill", cluster_id: null })
    .in("id", slice);
  if (error) throw new Error(error.message);
}

const survivors = new Map<string, typeof dets>();
for (const d of dets) {
  if (!d.cluster_id || screened.includes(d.id)) continue;
  const bucket = survivors.get(d.cluster_id);
  if (bucket) bucket.push(d);
  else survivors.set(d.cluster_id, [d]);
}

let resolved = 0;
let recomputed = 0;
const now = Date.now();
for (const clusterId of affected) {
  const list = survivors.get(clusterId);
  if (!list?.length) {
    const { error } = await db
      .from("fire_clusters")
      .update({
        state: "extinguished",
        resolution_reason: "persistent_source",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", clusterId);
    if (error) throw new Error(error.message);
    resolved += 1;
    continue;
  }
  const lat = list.reduce((s, d) => s + d.lat, 0) / list.length;
  const lon = list.reduce((s, d) => s + d.lon, 0) / list.length;
  const lastMs = Math.max(...list.map((d) => Date.parse(d.detected_at)));
  const { error } = await db
    .from("fire_clusters")
    .update({
      lat,
      lon,
      detection_count: list.length,
      confidence: confidenceScore(list as never),
      state: stateFor(list as never, lastMs, now),
    })
    .eq("id", clusterId);
  if (error) throw new Error(error.message);
  recomputed += 1;
}
console.log(`resolved ${resolved} clusters, recomputed ${recomputed}`);
```

- [ ] **Step 3: Add the script entry**

In `package.json` scripts:

```json
"reconcile:sources": "bun run scripts/reconcile-persistent-sources.ts",
```

- [ ] **Step 4: Record the before state**

Run:

```bash
psql "$DB" -c "select state, count(*) from fire_clusters group by 1 order by 1"
psql "$DB" -c "select count(*) from detections where fp_reason is not null"
```

Expected: `fp_reason` count is 0 before the run. Note the cluster state counts.

- [ ] **Step 5: Run the reconciliation**

Run:

```bash
set -a; . ~/.config/nadhir/secrets.env; set +a
export SUPABASE_URL="https://kuukthyenirwgdfkltlm.supabase.co"
bun run reconcile:sources
```

Expected: a screening count, then a resolved/recomputed count.

- [ ] **Step 6: Verify the acceptance criteria from the spec**

This is the reconciliation test. The script runs once against real data, so verifying it there is stronger than unit-testing a one-off; both branches of its behaviour must be checked explicitly.

Branch 1 — clusters made entirely of registry detections resolve:

```bash
psql "$DB" -c "select short_id, state, resolution_reason, resolved_at is not null as stamped
  from fire_clusters where resolution_reason='persistent_source' order by short_id"
```

Expected: the flare clusters — DZQJFKN (Arzew) and DZRQFCM (Skikda) among them — all `state='extinguished'`, `stamped = t`.

Branch 2 — mixed clusters survive with recomputed statistics:

```bash
psql "$DB" -c "select c.short_id, c.detection_count,
    (select count(*) from detections d where d.cluster_id = c.id) as live_detections
  from fire_clusters c
  where c.resolution_reason is distinct from 'persistent_source'
    and c.state in ('active','unconfirmed','contained_guess')
  order by c.detection_count desc limit 10"
```

Expected: `detection_count` equals `live_detections` for every row — a mismatch means a cluster kept a stale count after its screened detections were detached.

Branch 3 — the genuine fires are untouched:

```bash
psql "$DB" -c "select short_id, state, detection_count from fire_clusters
  where short_id in ('DZKVLV6','DZ62QZY','DZPWMRD','DZVVQPN')"
```

Expected: all four present, still live, detection counts unchanged from Step 4.

If any branch fails, stop. Do not proceed to Task 6 with an inconsistent database.

- [ ] **Step 7: Commit**

```bash
bun run format
git add package.json scripts/reconcile-persistent-sources.ts src/lib/ingest/fusion.server.ts
git commit -m "Reconcile historical detections and clusters against the registry"
```

---

### Task 6: Holdout harness and CI gate

**Files:**

- Create: `scripts/evaluate-persistent-sources.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**

- Consumes: the cached archive in `.cache/firms-archive` from Task 2; `cellKey`, `qualifies` from `@/lib/persistent`.
- Produces: a printed confusion matrix and a non-zero exit when either bound is breached.

- [ ] **Step 1: Write the evaluation script**

Create `scripts/evaluate-persistent-sources.ts`. It rebuilds the registry from detections dated before `2024-01-01`, then scores it on 2024–25 at the event level using fusion's own 3 km / 24 h parameters, inside the ingest box.

```ts
import { readFileSync, readdirSync } from "node:fs";

import { haversineKm } from "../src/lib/nadhir";
import { cellKey, qualifies, SCREEN_RADIUS_KM } from "../src/lib/persistent";

const CACHE = ".cache/firms-archive";
const SPLIT = "2024-01-01";
const MAX_REAL_LOSS = 0.06;
const MIN_FALSE_REMOVAL = 0.95;
const inBox = (la: number, lo: number) =>
  la >= 33.2 && la <= 37.6 && lo >= -3.2 && lo <= 9.7;

type Det = { lat: number; lon: number; type: string; ts: number };
const train = new Map<
  string,
  { static: number; fire: number; days: Set<string> }
>();
const test: Det[] = [];

for (const file of readdirSync(CACHE).sort()) {
  const lines = readFileSync(`${CACHE}/${file}`, "utf8").split("\n");
  const head = lines[0]!.split(",");
  const [iLat, iLon, iType, iDate, iTime] = [
    "latitude",
    "longitude",
    "type",
    "acq_date",
    "acq_time",
  ].map((c) => head.indexOf(c));
  for (const line of lines.slice(1)) {
    const p = line.split(",");
    if (p.length <= iType) continue;
    const lat = Number(p[iLat]);
    const lon = Number(p[iLon]);
    if (!Number.isFinite(lat) || p[iType] === "3") continue;
    const date = p[iDate]!;
    if (date < SPLIT) {
      const k = cellKey(lat, lon).join(",");
      let acc = train.get(k);
      if (!acc) {
        acc = { static: 0, fire: 0, days: new Set() };
        train.set(k, acc);
      }
      if (p[iType] === "2") acc.static += 1;
      else if (p[iType] === "0") acc.fire += 1;
      acc.days.add(date);
    } else if (inBox(lat, lon)) {
      const t = Number(p[iTime]);
      test.push({
        lat,
        lon,
        type: p[iType]!,
        ts: Date.parse(
          `${date}T${String(Math.floor(t / 100)).padStart(2, "0")}:${String(t % 100).padStart(2, "0")}:00Z`,
        ),
      });
    }
  }
}

const registry = new Set<string>();
for (const [k, a] of train) {
  const total = a.static + a.fire;
  if (
    total &&
    qualifies({
      staticShare: a.static / total,
      activeDays: a.days.size,
      detectionCount: total,
    })
  )
    registry.add(k);
}
const centres = [...registry].map((k) => {
  const [y, x] = k.split(",").map(Number);
  return { lat: y! * 0.01, lon: x! * 0.01 };
});
const screened = (d: Det) =>
  centres.some(
    (c) => haversineKm(d.lat, d.lon, c.lat, c.lon) <= SCREEN_RADIUS_KM,
  );

function events(dets: Det[]) {
  const sorted = [...dets].sort((a, b) => a.ts - b.ts);
  const out: { lat: number; lon: number; last: number; n: number }[] = [];
  for (const d of sorted) {
    const hit = [...out]
      .reverse()
      .find(
        (e) =>
          d.ts - e.last <= 24 * 3600e3 &&
          haversineKm(e.lat, e.lon, d.lat, d.lon) <= 3,
      );
    if (hit) {
      hit.last = Math.max(hit.last, d.ts);
      hit.n += 1;
    } else out.push({ lat: d.lat, lon: d.lon, last: d.ts, n: 1 });
  }
  return out.filter((e) => e.n >= 5);
}

const realBefore = events(test.filter((d) => d.type === "0")).length;
const realAfter = events(
  test.filter((d) => d.type === "0" && !screened(d)),
).length;
const falseBefore = events(test.filter((d) => d.type === "2")).length;
const falseAfter = events(
  test.filter((d) => d.type === "2" && !screened(d)),
).length;

const loss = (realBefore - realAfter) / realBefore;
const removal = (falseBefore - falseAfter) / falseBefore;
console.log(`registry ${registry.size} cells`);
console.log(
  `real  alerting-size events: ${realBefore} -> ${realAfter}  (loss ${(loss * 100).toFixed(1)}%)`,
);
console.log(
  `false alerting-size events: ${falseBefore} -> ${falseAfter}  (removal ${(removal * 100).toFixed(1)}%)`,
);

if (loss > MAX_REAL_LOSS) {
  console.error(
    `FAIL: real-event loss ${(loss * 100).toFixed(1)}% exceeds ${MAX_REAL_LOSS * 100}%`,
  );
  process.exit(1);
}
if (removal < MIN_FALSE_REMOVAL) {
  console.error(
    `FAIL: false-event removal ${(removal * 100).toFixed(1)}% below ${MIN_FALSE_REMOVAL * 100}%`,
  );
  process.exit(1);
}
console.log("PASS");
```

- [ ] **Step 2: Add the script entry**

In `package.json` scripts:

```json
"evaluate:sources": "bun run scripts/evaluate-persistent-sources.ts",
```

- [ ] **Step 3: Run it and confirm the spec's numbers**

Run: `bun run evaluate:sources`
Expected: `PASS`, with real-event loss near 4.5% and false-event removal near 97.6%. If either number differs materially from the spec, stop and investigate before continuing — the registry or the criteria have drifted.

- [ ] **Step 4: Add the CI gate**

In `.github/workflows/ci.yml`, add a step to the existing test job. It needs the archive cache, so restore it rather than refetching:

```yaml
- name: Cache FIRMS archive
  uses: actions/cache@v4
  with:
    path: .cache/firms-archive
    key: firms-archive-v1
- name: Evaluate persistent-source screening
  env:
    FIRMS_MAP_KEY: ${{ secrets.FIRMS_MAP_KEY }}
  run: |
    bun run build:sources
    bun run evaluate:sources
```

- [ ] **Step 5: Verify the workflow parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
bun run format
git add package.json scripts/evaluate-persistent-sources.ts .github/workflows/ci.yml
git commit -m "Gate screening thresholds on a held-out confusion matrix"
```

---

### Task 7: Map layer and public endpoint

**Files:**

- Create: `src/routes/api/public/v1/sources.ts`
- Modify: `src/components/nadhir/LayerToggle.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/i18n/locales/ar.ts`, `fr.ts`, `en.ts`, `kab.ts`

**Interfaces:**

- Consumes: `public.persistent_sources`.
- Produces: `GET /api/public/v1/sources` returning `{ sources: Array<{ lat, lon, site_id, site_name, active_days, static_share }> }`, and a map layer toggle keyed `industrialSources`, default off.

- [ ] **Step 1: Write the endpoint**

Create `src/routes/api/public/v1/sources.ts`, following the envelope and rate-limit pattern of `risk.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/sources")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/public-api.server");
        return preflight();
      },
      GET: async ({ request }) => {
        const { publicSupabase, json, clampInt, enforceRateLimit } =
          await import("@/lib/public-api.server");
        const limited = await enforceRateLimit(request);
        if (limited) return limited;

        const url = new URL(request.url);
        const limit = clampInt(url.searchParams.get("limit"), 500, 1, 2000);
        const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);

        const { data, error } = await publicSupabase()
          .from("persistent_sources")
          .select(
            "lat, lon, site_id, site_name, active_days, observation_days, static_share, frp_p50",
          )
          .order("detection_count", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return json({ error: error.message }, 502);

        return json({
          licence: "CC-BY 4.0 — Nadhir, derived from NASA FIRMS",
          generated_at: new Date().toISOString(),
          note: "Persistent industrial heat sources. These are not wildfires; detections here are excluded from fire clustering.",
          limit,
          offset,
          count: data?.length ?? 0,
          sources: data ?? [],
        });
      },
    },
  },
});
```

- [ ] **Step 2: Verify the endpoint**

Run: `bun run dev` then in a second shell:

```bash
curl -s localhost:8080/api/public/v1/sources | head -c 400
```

Expected: JSON with a `sources` array whose first entries have `active_days` in the hundreds.

- [ ] **Step 3: Add the i18n keys**

Add to each of the four locale files, under the same object the other layer labels live in:
Add `layerIndustrialSources` to the `map` object in each file, beside the existing `layerFires` and `layerUnverified` keys (`en.ts:189-191`):

- `ar.ts`: `layerIndustrialSources: "مصادر حرارية صناعية معروفة"`
- `fr.ts`: `layerIndustrialSources: "Sources thermiques industrielles connues"`
- `en.ts`: `layerIndustrialSources: "Known industrial heat sources"`
- `kab.ts`: `layerIndustrialSources: "Iɣbula n uzɣal n tenzagt"`

Kabyle needs review by a speaker before release; flag it in the pull request rather than treating it as final.

- [ ] **Step 4: Verify key parity**

Run: `bun run test -- i18n`
Expected: PASS. The existing i18n parity test fails if any locale is missing the key.

- [ ] **Step 5: Extend the layer type and toggle**

In `src/components/FireMap.tsx:9-12`, extend the type:

```ts
export type MapLayers = {
  fires: boolean;
  unverified: boolean;
  industrialSources: boolean;
};
```

In `src/components/nadhir/LayerToggle.tsx`, add the third row:

```ts
const rows: { key: keyof MapLayers; label: string }[] = [
  { key: "fires", label: t("map.layerFires") },
  { key: "unverified", label: t("map.layerUnverified") },
  { key: "industrialSources", label: t("map.layerIndustrialSources") },
];
```

In `src/routes/index.tsx:80`, add `industrialSources: false` to the `useState<MapLayers>` initialiser so the layer is off by default.

- [ ] **Step 6: Render the markers**

In `src/components/FireMap.tsx`, add a maplibre source and layer for the registry, fetched from `/api/public/v1/sources`, gated on `layers.industrialSources`. Use a distinct marker from fire clusters — a hollow grey square rather than the fire palette — so it can never be read as a fire. Follow the existing `SRC = "fires"` source/layer registration pattern in that file; name the new source `"industrial"`.

- [ ] **Step 7: Verify in the browser**

Run `bun run dev`, open `http://localhost:8080`, confirm the layer is absent by default, then enable it and confirm markers appear at Arzew (35.81, −0.26) and Skikda (36.87, 6.96), labelled as industrial rather than as fires.

- [ ] **Step 8: Commit**

```bash
bun run format
git add src/routes/api/public/v1/sources.ts src/components/nadhir/LayerToggle.tsx src/routes/index.tsx src/i18n/locales
git commit -m "Publish industrial heat sources as an opt-in layer and API"
```

---

### Task 8: Drift — monthly rebuild and online candidates

**Files:**

- Create: `.github/workflows/sources-refresh.yml`
- Create: `supabase/migrations/20260830010000_<uuid>.sql`
- Modify: `src/lib/ingest/persistent.server.ts`

**Interfaces:**

- Consumes: `screenPersistentSources` from Task 4.
- Produces: `flagPersistentCandidates(): Promise<{ flagged: number }>`, and a monthly pull request regenerating the registry.

- [ ] **Step 1: Write the monthly workflow**

Create `.github/workflows/sources-refresh.yml`:

```yaml
name: sources-refresh

on:
  schedule:
    - cron: "0 3 1 * *"
  workflow_dispatch:

jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Rebuild registry
        env:
          FIRMS_MAP_KEY: ${{ secrets.FIRMS_MAP_KEY }}
        run: bun run build:sources
      - name: Evaluate before proposing
        run: bun run evaluate:sources
      - uses: peter-evans/create-pull-request@v6
        with:
          branch: sources-refresh
          title: "Monthly persistent-source registry refresh"
          body: "Regenerated from the FIRMS archive. Review the cell diff before merging — this changes what Nadhir suppresses."
          commit-message: "Refresh persistent-source registry"
          add-paths: data/flares/algeria-persistent-sources.json
```

The evaluation runs before the pull request opens, so a registry that breaches either bound never reaches review.

- [ ] **Step 2: Verify the workflow parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/sources-refresh.yml')); print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Add the candidate flag column**

Check the ledger for a free version as in Task 1, then create the migration:

```sql
alter table public.fire_clusters
  add column suspected_persistent_source boolean not null default false;

create index fire_clusters_suspected_idx
  on public.fire_clusters (suspected_persistent_source)
  where suspected_persistent_source;
```

Run: `bunx supabase db push`
Then: `bunx supabase gen types typescript --linked > src/integrations/supabase/types.ts`

- [ ] **Step 4: Write the failing test for the candidate rule**

Append to `src/lib/__tests__/persistent.test.ts`:

```ts
import { isPersistentCandidate } from "@/lib/ingest/persistent.server";

describe("online candidate detection", () => {
  const day = 24 * 3600e3;
  const now = Date.parse("2026-08-29T12:00:00Z");

  it("flags a cluster live for weeks with flat radiative power", () => {
    expect(
      isPersistentCandidate(
        {
          firstMs: now - 21 * day,
          lastMs: now,
          frps: [2.1, 2.3, 2.0, 2.2, 2.4],
        },
        now,
      ),
    ).toBe(true);
  });

  it("leaves a long-burning fire with varying power alone", () => {
    expect(
      isPersistentCandidate(
        { firstMs: now - 21 * day, lastMs: now, frps: [4, 55, 120, 18, 90] },
        now,
      ),
    ).toBe(false);
  });

  it("leaves a young cluster alone however flat it looks", () => {
    expect(
      isPersistentCandidate(
        { firstMs: now - 2 * day, lastMs: now, frps: [2.1, 2.2, 2.0] },
        now,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `bun run test -- persistent`
Expected: FAIL, `isPersistentCandidate` is not exported.

- [ ] **Step 6: Implement the candidate rule**

Append to `src/lib/ingest/persistent.server.ts`:

```ts
const CANDIDATE_MIN_DAYS = 14;
const CANDIDATE_MAX_CV = 0.35;

export function isPersistentCandidate(
  cluster: { firstMs: number; lastMs: number; frps: number[] },
  now: number,
): boolean {
  const spanDays = (cluster.lastMs - cluster.firstMs) / 86_400_000;
  if (spanDays < CANDIDATE_MIN_DAYS) return false;
  if ((now - cluster.lastMs) / 86_400_000 > 2) return false;
  const frps = cluster.frps.filter((f) => Number.isFinite(f) && f > 0);
  if (frps.length < 3) return false;
  const mean = frps.reduce((s, f) => s + f, 0) / frps.length;
  if (mean === 0) return false;
  const sd = Math.sqrt(
    frps.reduce((s, f) => s + (f - mean) ** 2, 0) / frps.length,
  );
  return sd / mean <= CANDIDATE_MAX_CV;
}
```

Then add the runtime pass. It flags only; it must never set `fp_reason` and never change cluster state, because a genuine long-burning fire must not be silenced by a heuristic:

```ts
export async function flagPersistentCandidates(): Promise<{ flagged: number }> {
  const clusters = await fetchAllPages<{
    id: string;
    first_detected_at: string;
    last_detected_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("fire_clusters")
      .select("id, first_detected_at, last_detected_at")
      .in("state", ["active", "unconfirmed", "contained_guess"])
      .eq("suspected_persistent_source", false)
      .range(from, to),
  );
  if (!clusters.length) return { flagged: 0 };

  const now = Date.now();
  const candidates: string[] = [];
  for (let i = 0; i < clusters.length; i += 100) {
    const slice = clusters.slice(i, i + 100);
    const dets = await fetchAllPages<{
      cluster_id: string;
      frp_mw: number | null;
    }>((from, to) =>
      supabaseAdmin
        .from("detections")
        .select("cluster_id, frp_mw")
        .in(
          "cluster_id",
          slice.map((c) => c.id),
        )
        .range(from, to),
    );
    const byCluster = new Map<string, number[]>();
    for (const d of dets) {
      if (d.frp_mw === null) continue;
      const bucket = byCluster.get(d.cluster_id);
      if (bucket) bucket.push(d.frp_mw);
      else byCluster.set(d.cluster_id, [d.frp_mw]);
    }
    for (const c of slice) {
      const frps = byCluster.get(c.id) ?? [];
      const input = {
        firstMs: Date.parse(c.first_detected_at),
        lastMs: Date.parse(c.last_detected_at),
        frps,
      };
      if (isPersistentCandidate(input, now)) candidates.push(c.id);
    }
  }

  for (let i = 0; i < candidates.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("fire_clusters")
      .update({ suspected_persistent_source: true })
      .in("id", candidates.slice(i, i + 200));
    if (error) throw new Error(`candidate flag failed: ${error.message}`);
  }
  return { flagged: candidates.length };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `bun run test -- persistent`
Expected: PASS, 13 tests.

- [ ] **Step 8: Call it from the pipeline**

In `src/lib/ingest/pipeline.server.ts`, after the `fuseDetections()` block, add:

```ts
await flagPersistentCandidates();
```

adding it to the existing import from `./persistent.server`.

- [ ] **Step 9: Verify end to end**

Run: `bunx tsc --noEmit && bun run lint && bun run test`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
bun run format
git add .github/workflows/sources-refresh.yml supabase/migrations src/integrations/supabase/types.ts src/lib/ingest/persistent.server.ts src/lib/ingest/pipeline.server.ts src/lib/__tests__/persistent.test.ts
git commit -m "Refresh the registry monthly and flag drifting clusters for review"
```

---

### Task 9: Documentation

**Files:**

- Modify: `GAPS.md`
- Modify: `README.md`
- Modify: `roadmap.md`

- [ ] **Step 1: Correct GAPS.md**

In §3, replace the citizen-reports bullet's neighbouring claim that fusion has no false-positive screening with the measured position: the registry now screens persistent industrial sources, removing 97.6% of alerting-size false events at a cost of 4.5% of alerting-size real ones, with roughly 0.8 false alerting events per month remaining.

In §4.3, remove "Fusion is the weakest spot: its commune attribution is guarded only by an assertion over the source text" only if Task 4–8 tests now cover it; otherwise leave it and note what remains uncovered.

- [ ] **Step 2: Add the source to README.md**

In the data-sources table, add a row recording that the FIRMS science-processed archive supplies the persistent-source registry, and note in the limitations section that industrial heat sources are screened and shown on an opt-in layer.

- [ ] **Step 3: Add the milestone to roadmap.md**

Add a completed entry describing the screening work and linking the spec.

- [ ] **Step 4: Commit**

```bash
bun run format
git add GAPS.md README.md roadmap.md
git commit -m "Document persistent-source screening"
```

---

## Notes for the implementer

The single most important property of this change is asymmetry: suppressing a real fire is far worse than showing a flare. Every threshold in `src/lib/persistent.ts` was set by measurement against NASA's own labels, and Task 6's CI gate exists so nobody can retune them without facing both error rates at once. If you find yourself loosening `MAX_REAL_LOSS` to make CI pass, that is the signal to stop and re-measure, not to adjust the bound.

Two claims in the spec are worth re-verifying rather than trusting, because they were measured on a fire-season-only archive (1 May – 15 Nov) while Task 2 builds on the full calendar year: the exact registry size, and the exact confusion matrix. Task 6 prints both. Expect them to move somewhat; expect the direction and rough magnitude to hold.
