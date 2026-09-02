# Commune Alert State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fire push mean something changed for that commune, so a Jijel-scale night produces a few escalating pushes per commune instead of 9,575.

**Architecture:** The broadcast thread keeps its coverage (`commune_codes`), and two new columns separate what is pushed (`push_codes`) from where the fire is inside a polygon (`inside_codes`). Pure rules in `src/lib/broadcast-rules.ts` decide levels and push sets from the open threads; `publishBroadcasts` wires them with a bounded fetch of fresh detections; delivery reads `push_codes`. The committed replay harness (`scripts/replay-window.ts`) runs the real rules over the cached 25–28 August FCI archive and is the regression gate.

**Tech Stack:** TypeScript on bun, vitest, Supabase Postgres migrations with pgTAP under `supabase/tests`, Cloudflare Worker.

## Global Constraints

- Nadhir never issues an Instruction (ADR-0002). Every copy change below is Information; the instruction line stays the pre-approved Standing Guidance already in `broadcast-copy.ts`.
- Kabyle copy is pending native review (`broadcast-copy.ts` header). New KAB strings ship with the same caveat; do not add KAB to language pickers.
- Migration filenames use offset minutes (`…185000`, not `…180000`) — GAPS §5 trap. Check the ledger before adding one.
- Never run `supabase db reset`. Apply locally with `supabase migration up --local`.
- Zero comments unless a non-obvious why; commit messages one or two lines, no attribution trailers.
- Numbers to beat, from the replay baseline (FCI only, 25–28 Aug): 381 initials, 9,575 commune pushes, peak 44 pushes to one commune in one day. Target from the `dedup+escalate` run: about 2,000 pushes, peak under 10, every DGPC-named Jijel commune pushed after the fire enters it.

---

### Task 1: Severity needs intensity, and a thread reopens as an update

**Files:**
- Modify: `src/lib/broadcast-rules.ts:138-146` (`fireSeverity`), `src/lib/broadcast-rules.ts:174-218` (`planFireBroadcast`, `FirePlan`)
- Modify: `src/lib/__tests__/broadcast-rules.test.ts:83-89` (`fireSeverity` block), `:122-207` (`planFireBroadcast` block)

**Interfaces:**
- Produces: `fireSeverity(nearestSettlementKm: number | null, maxFrpMw: number | null): "Extreme" | "Severe"`; `EXTREME_MIN_FRP_MW = 20`; `REOPEN_WINDOW_HOURS = 24`; `type OpenThread = { phase: string; severity: string; communeCodes: string[]; insideCodes: string[]; atMs: number }`; `FirePlan` initial and update variants both carry `inside: string[]`; `planFireBroadcast` takes `inside: string[]` and `open: OpenThread | null`.

- [ ] **Step 1: Replace the `fireSeverity` test and add the reopen tests**

In `src/lib/__tests__/broadcast-rules.test.ts`, replace the `fireSeverity` describe block with:

```ts
describe("fireSeverity", () => {
  it("is Extreme only for an intense fire near a settlement", () => {
    expect(fireSeverity(3, 45)).toBe("Extreme");
    expect(fireSeverity(3, 9.7)).toBe("Severe");
    expect(fireSeverity(3, null)).toBe("Severe");
    expect(fireSeverity(12, 45)).toBe("Severe");
    expect(fireSeverity(null, 45)).toBe("Severe");
  });
});
```

In the `planFireBroadcast` block, change `base` to include `inside: []`, and replace the test `"reopens a fresh thread if a closed fire flares up again"` with:

```ts
  it("reopens as an update while the end is less than 24 h old", () => {
    expect(
      planFireBroadcast({
        ...base,
        open: {
          phase: "end",
          communeCodes: ["1503"],
          insideCodes: [],
          severity: "Severe",
          atMs: now - 6 * HOUR,
        },
      }),
    ).toEqual({
      action: "update",
      codes: ["1503", "1510"],
      added: ["1510"],
      inside: [],
    });
  });

  it("opens a fresh thread once the end is a day old", () => {
    expect(
      planFireBroadcast({
        ...base,
        open: {
          phase: "end",
          communeCodes: ["1503"],
          insideCodes: [],
          severity: "Severe",
          atMs: now - 25 * HOUR,
        },
      }),
    ).toEqual({ action: "initial", codes: ["1503", "1510"], inside: [] });
  });

  it("updates when the fire enters a covered commune", () => {
    expect(
      planFireBroadcast({
        ...base,
        inside: ["1503"],
        open: {
          phase: "initial",
          communeCodes: ["1503", "1510"],
          insideCodes: [],
          severity: "Severe",
          atMs: now - HOUR,
        },
      }),
    ).toEqual({
      action: "update",
      codes: ["1503", "1510"],
      added: [],
      inside: ["1503"],
    });
  });
```

Every other `open:` literal in that block gains `insideCodes: [], atMs: now - HOUR`, and every expected `{ action: "initial", codes }` gains `inside: []`, every expected `update` gains `inside: []`.

- [ ] **Step 2: Run the file to see it fail**

Run: `bun run vitest run src/lib/__tests__/broadcast-rules.test.ts`
Expected: FAIL — `fireSeverity` called with two arguments returns Extreme for 9.7 MW; type errors on `insideCodes`/`atMs`/`inside`.

- [ ] **Step 3: Implement**

In `src/lib/broadcast-rules.ts` replace `fireSeverity` with:

```ts
export const EXTREME_MIN_FRP_MW = 20;

export function fireSeverity(
  nearestSettlementKm: number | null,
  maxFrpMw: number | null,
): "Extreme" | "Severe" {
  return nearestSettlementKm !== null &&
    nearestSettlementKm <= SETTLEMENT_EMERGENCY_KM &&
    maxFrpMw !== null &&
    maxFrpMw >= EXTREME_MIN_FRP_MW
    ? "Extreme"
    : "Severe";
}
```

Replace `FirePlan` and `planFireBroadcast` with:

```ts
export const REOPEN_WINDOW_HOURS = 24;

export type OpenThread = {
  phase: string;
  severity: string;
  communeCodes: string[];
  insideCodes: string[];
  atMs: number;
};

export type FirePlan =
  | { action: "initial"; codes: string[]; inside: string[] }
  | { action: "update"; codes: string[]; added: string[]; inside: string[] }
  | { action: "end" }
  | { action: "cancel" }
  | null;

export function planFireBroadcast(args: {
  state: string;
  confidence: number;
  lastDetectedMs: number;
  nowMs: number;
  severity: "Extreme" | "Severe";
  open: OpenThread | null;
  targets: string[];
  additions: string[];
  inside: string[];
  fuelLimited?: Set<string>;
}): FirePlan {
  const burnable = (codes: string[]) =>
    args.fuelLimited ? codes.filter((c) => !args.fuelLimited!.has(c)) : codes;
  const live =
    args.open && (args.open.phase === "initial" || args.open.phase === "update")
      ? args.open
      : null;
  const reopened =
    args.open &&
    args.open.phase === "end" &&
    args.nowMs - args.open.atMs < REOPEN_WINDOW_HOURS * HOUR
      ? args.open
      : null;

  if (live) {
    if (args.state === "false_positive") return { action: "cancel" };
    if (args.nowMs - args.lastDetectedMs >= BROADCAST_END_AFTER_HOURS * HOUR)
      return { action: "end" };
    if (args.state !== "active" || args.confidence < MIN_CONFIDENCE)
      return null;
    const escalated = live.severity === "Severe" && args.severity === "Extreme";
    const additions = burnable(args.additions);
    const codes = [...live.communeCodes, ...additions];
    const insideNew = burnable(args.inside).filter(
      (c) => codes.includes(c) && !live.insideCodes.includes(c),
    );
    if (additions.length || escalated || insideNew.length)
      return {
        action: "update",
        codes,
        added: additions,
        inside: [...live.insideCodes, ...insideNew],
      };
    return null;
  }

  if (args.state === "active" && args.confidence >= MIN_CONFIDENCE) {
    const codes = burnable(args.targets);
    if (!codes.length) return null;
    const inside = burnable(args.inside).filter((c) => codes.includes(c));
    if (reopened)
      return {
        action: "update",
        codes,
        added: codes.filter((c) => !reopened.communeCodes.includes(c)),
        inside,
      };
    return { action: "initial", codes, inside };
  }
  return null;
}
```

- [ ] **Step 4: Run the file to see it pass**

Run: `bun run vitest run src/lib/__tests__/broadcast-rules.test.ts`
Expected: PASS. `bunx tsc --noEmit` will now fail in `broadcast.server.ts` (arity of `fireSeverity`, shape of `open`) — that is Task 5's job; do not patch it here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/broadcast-rules.ts src/lib/__tests__/broadcast-rules.test.ts
git commit -m "Extreme needs 20 MW; a thread ended under 24 h reopens as an update"
```

---

### Task 2: Commune levels and push sets

**Files:**
- Modify: `src/lib/broadcast-rules.ts` (append after `applyDailyLimit`)
- Modify: `src/lib/__tests__/broadcast-rules.test.ts` (append)

**Interfaces:**
- Consumes: `OpenThread`, `pointInMultiPolygon`, `CommuneShape` from Task 1 / existing.
- Produces:
  - `insideCommunes(points: { lat: number; lon: number }[], codes: string[], byCode: Map<string, CommuneShape>): string[]`
  - `type Coverage = Map<string, Map<string, 1 | 2>>` — commune code → cluster id → level
  - `coverageOf(threads: Iterable<[string, OpenThread]>): Coverage`
  - `pushCodesFor(args: { clusterId: string; action: "initial" | "update" | "end" | "cancel"; codes: string[]; inside: string[]; previous: OpenThread | null; coverage: Coverage }): string[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/broadcast-rules.test.ts`:

```ts
import { coverageOf, insideCommunes, pushCodesFor, type OpenThread } from "@/lib/broadcast-rules";

describe("insideCommunes", () => {
  const east = square("1510", 4.4, 4.6, 36.6, 36.8);
  const byCode = new Map([home, east].map((s) => [s.code, s]));
  it("names the target communes that contain a detection pixel", () => {
    const points = [
      { lat: 36.7, lon: 4.3 },
      { lat: 36.7, lon: 4.9 },
    ];
    expect(insideCommunes(points, ["1503", "1510", "1599"], byCode)).toEqual(["1503"]);
  });
});

describe("pushCodesFor", () => {
  const now = Date.parse("2026-08-26T14:00:00Z");
  const thread = (
    communeCodes: string[],
    insideCodes: string[] = [],
    phase = "initial",
  ): OpenThread => ({ phase, severity: "Severe", communeCodes, insideCodes, atMs: now });

  it("pushes every commune of a first thread when nothing covers them", () => {
    expect(
      pushCodesFor({
        clusterId: "A",
        action: "initial",
        codes: ["1503", "1510"],
        inside: ["1503"],
        previous: null,
        coverage: coverageOf([]),
      }),
    ).toEqual(["1503", "1510"]);
  });

  it("stays silent for a commune another thread already covers at the same level", () => {
    const coverage = coverageOf([["A", thread(["1503", "1510"])]]);
    expect(
      pushCodesFor({
        clusterId: "B",
        action: "initial",
        codes: ["1510", "1520"],
        inside: [],
        previous: null,
        coverage,
      }),
    ).toEqual(["1520"]);
  });

  it("pushes a commune the fire has entered even if a ring already covered it", () => {
    const coverage = coverageOf([["A", thread(["1503", "1510"])]]);
    expect(
      pushCodesFor({
        clusterId: "B",
        action: "initial",
        codes: ["1510"],
        inside: ["1510"],
        previous: null,
        coverage,
      }),
    ).toEqual(["1510"]);
  });

  it("on update pushes only communes whose level rose for this thread", () => {
    const previous = thread(["1503", "1510"], []);
    const coverage = coverageOf([["A", previous]]);
    expect(
      pushCodesFor({
        clusterId: "A",
        action: "update",
        codes: ["1503", "1510", "1520"],
        inside: ["1503"],
        previous,
        coverage,
      }),
    ).toEqual(["1503", "1520"]);
  });

  it("does not re-push a rise another thread already announced", () => {
    const previous = thread(["1503"], []);
    const coverage = coverageOf([
      ["A", previous],
      ["B", thread(["1503"], ["1503"])],
    ]);
    expect(
      pushCodesFor({
        clusterId: "A",
        action: "update",
        codes: ["1503"],
        inside: ["1503"],
        previous,
        coverage,
      }),
    ).toEqual([]);
  });

  it("ends only where no other thread still covers the commune", () => {
    const previous = thread(["1503", "1510"]);
    const coverage = coverageOf([
      ["A", previous],
      ["B", thread(["1510"])],
    ]);
    expect(
      pushCodesFor({
        clusterId: "A",
        action: "end",
        codes: ["1503", "1510"],
        inside: [],
        previous,
        coverage,
      }),
    ).toEqual(["1503"]);
  });

  it("ignores closed threads when computing coverage", () => {
    const coverage = coverageOf([["A", thread(["1503"], [], "end")]]);
    expect(coverage.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bun run vitest run src/lib/__tests__/broadcast-rules.test.ts`
Expected: FAIL — `insideCommunes`, `coverageOf`, `pushCodesFor` are not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/broadcast-rules.ts`:

```ts
export function insideCommunes(
  points: { lat: number; lon: number }[],
  codes: string[],
  byCode: Map<string, CommuneShape>,
): string[] {
  return codes.filter((code) => {
    const shape = byCode.get(code);
    return (
      !!shape &&
      points.some((p) => pointInMultiPolygon(p.lat, p.lon, shape.geom))
    );
  });
}

export type Coverage = Map<string, Map<string, 1 | 2>>;

export function coverageOf(threads: Iterable<[string, OpenThread]>): Coverage {
  const coverage: Coverage = new Map();
  for (const [clusterId, t] of threads) {
    if (t.phase !== "initial" && t.phase !== "update") continue;
    for (const code of t.communeCodes) {
      const byCluster = coverage.get(code) ?? new Map<string, 1 | 2>();
      byCluster.set(clusterId, t.insideCodes.includes(code) ? 2 : 1);
      coverage.set(code, byCluster);
    }
  }
  return coverage;
}

function levelElsewhere(coverage: Coverage, code: string, self: string): number {
  let best = 0;
  for (const [id, level] of coverage.get(code) ?? [])
    if (id !== self && level > best) best = level;
  return best;
}

/* A push means the commune's alert level rose: a ring-covered commune hears
 * again only when the fire is inside it, and never twice from two clusters. */
export function pushCodesFor(args: {
  clusterId: string;
  action: "initial" | "update" | "end" | "cancel";
  codes: string[];
  inside: string[];
  previous: OpenThread | null;
  coverage: Coverage;
}): string[] {
  if (args.action === "end" || args.action === "cancel")
    return args.codes.filter(
      (code) => levelElsewhere(args.coverage, code, args.clusterId) === 0,
    );
  const mine = (code: string) =>
    args.previous?.insideCodes.includes(code)
      ? 2
      : args.previous?.communeCodes.includes(code)
        ? 1
        : 0;
  return args.codes.filter((code) => {
    const level = args.inside.includes(code) ? 2 : 1;
    return (
      level >
      Math.max(mine(code), levelElsewhere(args.coverage, code, args.clusterId))
    );
  });
}
```

- [ ] **Step 4: Run to see it pass**

Run: `bun run vitest run src/lib/__tests__/broadcast-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/broadcast-rules.ts src/lib/__tests__/broadcast-rules.test.ts
git commit -m "Commune alert levels: push only on a rise, end only when uncovered"
```

---

### Task 3: Schema — `push_codes` and `inside_codes` on broadcasts

**Files:**
- Create: `supabase/migrations/20260902185000_broadcast_push_codes.sql`
- Create: `supabase/tests/broadcast_push_codes.test.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerated)

**Interfaces:**
- Produces: `broadcasts.push_codes text[] not null`, `broadcasts.inside_codes text[] not null default '{}'`; `broadcast_audit.payload` carries `{ pushed: string[] }` for fire rows (no schema change, jsonb).

- [ ] **Step 1: Write the pgTAP test**

`supabase/tests/broadcast_push_codes.test.sql`:

```sql
begin;
set local search_path = public, extensions;
select plan(4);

select has_column('public', 'broadcasts', 'push_codes', 'push_codes exists');
select has_column('public', 'broadcasts', 'inside_codes', 'inside_codes exists');
select col_not_null('public', 'broadcasts', 'push_codes', 'push_codes is not null');
select col_default_is('public', 'broadcasts', 'inside_codes', '''{}''::text[]', 'inside_codes defaults to empty');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `supabase start` (if not running) then `supabase test db`
Expected: the new file fails on `has_column ... push_codes`.

- [ ] **Step 3: Write the migration**

Check the ledger first: `ls supabase/migrations | tail -3` must not contain `20260902185000`. Then `supabase/migrations/20260902185000_broadcast_push_codes.sql`:

```sql
alter table public.broadcasts
  add column push_codes text[],
  add column inside_codes text[] not null default '{}';

update public.broadcasts set push_codes = commune_codes where push_codes is null;

alter table public.broadcasts alter column push_codes set not null;
```

- [ ] **Step 4: Apply locally and run the suite**

Run: `supabase migration up --local && supabase test db`
Expected: all suites PASS, including the four new assertions.

- [ ] **Step 5: Regenerate types**

Run: `bunx supabase@2.116.0 gen types typescript --local > src/integrations/supabase/types.ts`
Then: `git diff --stat src/integrations/supabase/types.ts` shows only the `broadcasts` Row/Insert/Update gaining `push_codes` and `inside_codes`. If the diff touches anything else, the local schema is behind `main`: run `supabase migration up --local` again and regenerate.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902185000_broadcast_push_codes.sql supabase/tests/broadcast_push_codes.test.sql src/integrations/supabase/types.ts
git commit -m "broadcasts: push_codes (delivered) beside commune_codes (covered), inside_codes for level 2"
```

---

### Task 4: Copy — name the communes the fire has entered

**Files:**
- Modify: `src/lib/broadcast-copy.ts:3-10` (`BroadcastVars`), `:29-160` (`COPY`), `:181-215` (`description`)
- Modify: `src/lib/__tests__/broadcast-copy.test.ts`

**Interfaces:**
- Produces: `BroadcastVars.inside: Record<"ar" | "fr" | "en" | "kab", string[]>` — commune names per language for the thread's `inside` set; `Copy.insideOne` / `Copy.insideMany` templates.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/broadcast-copy.test.ts`, extend `vars` with `inside: { ar: [], fr: [], en: [], kab: [] }` and append:

```ts
describe("inside communes", () => {
  const withInside: BroadcastVars = {
    ...vars,
    inside: {
      ar: ["الميلية"],
      fr: ["El Milia"],
      en: ["El Milia"],
      kab: ["El Milia"],
    },
  };
  it("names the commune the fire has entered on initial and update", () => {
    for (const phase of ["initial", "update"] as const) {
      const fr = broadcastTexts(phase, withInside).find((t) => t.language === "fr-DZ")!;
      expect(fr.description).toContain("Détections à l'intérieur de la commune d'El Milia");
    }
  });
  it("lists several communes", () => {
    const fr = broadcastTexts("update", {
      ...withInside,
      inside: { ...withInside.inside, fr: ["El Milia", "Texenna"] },
    }).find((t) => t.language === "fr-DZ")!;
    expect(fr.description).toContain("Détections à l'intérieur des communes : El Milia, Texenna");
  });
  it("says nothing about communes on end and cancel, or when none is inside", () => {
    for (const phase of ["end", "cancel"] as const)
      expect(
        broadcastTexts(phase, withInside).find((t) => t.language === "fr-DZ")!.description,
      ).not.toContain("intérieur");
    expect(
      broadcastTexts("initial", vars).find((t) => t.language === "fr-DZ")!.description,
    ).not.toContain("intérieur");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bun run vitest run src/lib/__tests__/broadcast-copy.test.ts`
Expected: FAIL — type error on `inside`, then missing sentence.

- [ ] **Step 3: Implement**

In `src/lib/broadcast-copy.ts`:

Add to `BroadcastVars`: `inside: Record<"ar" | "fr" | "en" | "kab", string[]>;`

Add to `Copy`: `insideOne: string; insideMany: string;`

Add to each locale of `COPY` (after `cancelDesc`):

```ts
    // ar
    insideOne: " رُصدت نقاط حرارية داخل بلدية {{communes}}.",
    insideMany: " رُصدت نقاط حرارية داخل البلديات: {{communes}}.",
    // fr
    insideOne: " Détections à l'intérieur de la commune d'{{communes}}.",
    insideMany: " Détections à l'intérieur des communes : {{communes}}.",
    // en
    insideOne: " Detections inside the commune of {{communes}}.",
    insideMany: " Detections inside the communes: {{communes}}.",
    // kab
    insideOne: " Aḍfar deg tɣiwant n {{communes}}.",
    insideMany: " Aḍfar deg tɣiwanin: {{communes}}.",
```

The French `d'{{communes}}` elides before a vowel only; for a consonant-initial name it reads "d'Texenna". Use `de ` and let the test expect `de El Milia`? No: keep French correct with a helper:

```ts
function frDe(name: string): string {
  return /^[aeiouyhâéèêîôûAEIOUYH]/.test(name) ? `d'${name}` : `de ${name}`;
}
```

and set the French `insideOne` to `" Détections à l'intérieur de la commune {{communes}}."` with the value pre-formatted by `frDe` when `locale === "fr"`. Adjust the test expectation to `"Détections à l'intérieur de la commune d'El Milia"` (El starts with a vowel, so the helper yields `d'El Milia`).

In `description`, after computing the phase text and only for `initial` and `update`, append the inside sentence:

```ts
function insideSentence(copy: Copy, locale: keyof typeof COPY, names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1)
    return fill(copy.insideOne, { communes: locale === "fr" ? frDe(names[0]!) : names[0]! });
  return fill(copy.insideMany, { communes: names.join(locale === "ar" ? "، " : ", ") });
}
```

`description` gains a `locale` parameter; the `initial` case returns `${base}${drift}.${insideSentence(copy, locale, vars.inside[locale])}` and the `update` case returns `${fill(copy.updateDesc, slots)}${drift}${insideSentence(copy, locale, vars.inside[locale])}`. `broadcastTexts` passes `locale` through.

- [ ] **Step 4: Run to see it pass**

Run: `bun run vitest run src/lib/__tests__/broadcast-copy.test.ts src/lib/__tests__/cap.test.ts`
Expected: PASS (cap tests construct `BroadcastVars`? If they do, add `inside: { ar: [], fr: [], en: [], kab: [] }` there too).

- [ ] **Step 5: Commit**

```bash
git add src/lib/broadcast-copy.ts src/lib/__tests__/broadcast-copy.test.ts
git commit -m "Broadcast copy names the communes the fire has entered"
```

---

### Task 5: Wire the publish loop

**Files:**
- Modify: `src/lib/ingest/broadcast.server.ts` (`publishBroadcasts`, `relayAuthorityWarnings`, `relayOnmWarnings`)

**Interfaces:**
- Consumes: `fireSeverity(km, frp)`, `OpenThread`, `planFireBroadcast({ ..., inside })`, `insideCommunes`, `coverageOf`, `pushCodesFor` (Tasks 1–2); `BroadcastVars.inside` (Task 4); `broadcasts.push_codes`, `inside_codes` (Task 3).
- Produces: fire rows with `commune_codes` = coverage, `push_codes` = delivered set after the daily cap, `inside_codes` = level-2 set; audit payload `{ identifier, pushed, rate_limited?, added?, inside? }` and reason `silent` when nothing is pushed.

- [ ] **Step 1: Read the open threads with what the rules need**

In `publishBroadcasts`, the `recent` select becomes `"cluster_id, phase, severity, commune_codes, inside_codes, created_at"` and `latestByCluster` is typed `Map<string, OpenThread>`, filled with:

```ts
    latestByCluster.set(b.cluster_id, {
      phase: b.phase,
      severity: b.severity,
      communeCodes: b.commune_codes,
      insideCodes: b.inside_codes,
      atMs: Date.parse(b.created_at),
    });
```

`openClusterIds` must also include threads whose latest phase is `end` less than `REOPEN_WINDOW_HOURS` old, so the reopen rule can see them:

```ts
  const openClusterIds = [...latestByCluster.entries()]
    .filter(
      ([, b]) =>
        b.phase === "initial" ||
        b.phase === "update" ||
        (b.phase === "end" && Date.now() - b.atMs < REOPEN_WINDOW_HOURS * HOUR),
    )
    .map(([id]) => id);
```

Add `const HOUR = 3600_000;` next to the other constants and import `REOPEN_WINDOW_HOURS`, `coverageOf`, `insideCommunes`, `pushCodesFor`, `type OpenThread` from `@/lib/broadcast-rules`.

- [ ] **Step 2: Select FRP and fetch fresh detection pixels**

Add `max_frp_mw` to `clusterFields` and to `ClusterRow`. After `clusters` is known and before the loop, fetch the last 30 minutes of detections for those clusters, deduped to the ~375 m pixel grid so a 1,000-pixel FCI night costs one polygon test per distinct cell:

```ts
  const FRESH_DETECTIONS_MIN = 30;
  const pointsByCluster = new Map<string, { lat: number; lon: number }[]>();
  {
    const ids = clusters.map((c) => c.id);
    const since = new Date(now - FRESH_DETECTIONS_MIN * 60_000).toISOString();
    for (let i = 0; i < ids.length; i += 100) {
      const rows = await fetchAllPages<{ cluster_id: string; lat: number; lon: number }>(
        (from, to) =>
          supabaseAdmin
            .from("detections")
            .select("cluster_id, lat, lon")
            .in("cluster_id", ids.slice(i, i + 100))
            .gte("created_at", since)
            .order("id")
            .range(from, to),
      );
      const seen = new Set<string>();
      for (const r of rows) {
        const key = `${r.cluster_id}:${Math.round(r.lat / PIXEL_GRID)}:${Math.round(r.lon / PIXEL_GRID)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const bucket = pointsByCluster.get(r.cluster_id) ?? [];
        bucket.push({ lat: r.lat, lon: r.lon });
        pointsByCluster.set(r.cluster_id, bucket);
      }
    }
  }
```

Move `const now = Date.now();` above this block (it is currently declared just before the loop) and import `PIXEL_GRID` from `./fusion-geometry`. Level 2 is sticky through `OpenThread.insideCodes`, which is why only fresh rows are read; a thread that started before this deploy simply gains its inside set from its next 30 minutes of pixels.

- [ ] **Step 3: Compute coverage once per run and the push set per cluster**

Before the loop: `const coverage = coverageOf(latestByCluster);`

Inside the loop replace the severity and plan computation with:

```ts
    const open = latestByCluster.get(cluster.id) ?? null;
    const severity = fireSeverity(cluster.nearest_settlement_km, cluster.max_frp_mw);
    const targets = targetCommunes(/* unchanged */);
    const inside = insideCommunes(pointsByCluster.get(cluster.id) ?? [], targets, shapeByCode);
    const additions = open && (open.phase === "initial" || open.phase === "update")
      ? downwindAdditions(/* unchanged */)
      : [];
    const plan = planFireBroadcast({
      state: cluster.state,
      confidence: cluster.confidence,
      lastDetectedMs: Date.parse(cluster.last_detected_at),
      nowMs: now,
      severity,
      open,
      targets,
      additions,
      inside,
      fuelLimited,
    });
    if (!plan) continue;
```

Then, replacing the `wanted`/`applyDailyLimit`/`allowed.length` block:

```ts
      const phase: BroadcastPhase = plan.action;
      const closed = phase === "end" || phase === "cancel";
      const messageSeverity = closed
        ? ((open?.severity ?? severity) as "Extreme" | "Severe")
        : severity;
      const covered =
        plan.action === "initial" || plan.action === "update"
          ? plan.codes
          : (open?.communeCodes ?? []);
      const insideCodes =
        plan.action === "initial" || plan.action === "update"
          ? plan.inside
          : (open?.insideCodes ?? []);
      const rose = pushCodesFor({
        clusterId: cluster.id,
        action: plan.action,
        codes: covered,
        inside: insideCodes,
        previous: open,
        coverage,
      });
      const { allowed: pushed, dropped } = applyDailyLimit(
        rose,
        sentToday,
        closed || messageSeverity === "Extreme",
      );
```

Delete the `if (!allowed.length) { suppressed += 1; ... continue; }` block: a plan with nothing to push still advances the thread. The `sentToday` map is built from `push_codes`, so change that select to `"push_codes"` and iterate `row.push_codes`.

- [ ] **Step 4: Build the CAP text with the inside communes and insert both code sets**

The `texts:` call gains:

```ts
          inside: {
            ar: insideCodes.map((code) => nameOf(code, "name_ar")),
            fr: insideCodes.map((code) => nameOf(code, "name_fr")),
            en: insideCodes.map((code) => nameOf(code, "name_en")),
            kab: insideCodes.map((code) => nameOf(code, "name_kab")),
          },
```

where `units` is selected with `"id, code, name_fr, name_ar, name_en, name_kab, parent_id, lat, lon, level"`, `Unit` gains the three name fields, `unitByCode = new Map(units.map((u) => [u.code, u]))`, and:

```ts
  const nameOf = (code: string, field: "name_ar" | "name_fr" | "name_en" | "name_kab") =>
    unitByCode.get(code)?.[field] ?? unitByCode.get(code)?.name_fr ?? code;
```

The broadcasts insert becomes:

```ts
        .insert({
          kind: "fire",
          phase,
          cluster_id: cluster.id,
          cap_alert_id: capRow.id,
          severity: messageSeverity,
          commune_codes: covered,
          push_codes: pushed,
          inside_codes: insideCodes,
        });
```

`sentToday` increments over `pushed`. The audit row becomes:

```ts
      await auditRow({
        action: "published",
        reason: pushed.length ? phase : "silent",
        kind: "fire",
        cluster_id: cluster.id,
        phase,
        severity: messageSeverity,
        commune_codes: covered,
        payload: {
          identifier: cap.identifier,
          pushed,
          ...(dropped.length ? { rate_limited: dropped } : {}),
          ...(plan.action === "update" ? { added: plan.added, inside: plan.inside } : {}),
          ...(plan.action === "initial" ? { inside: plan.inside } : {}),
        },
      });
```

`suppressed` now counts only the kill switch; remove its `+= 1` in the loop.

- [ ] **Step 5: Relay inserts set `push_codes`**

In `relayAuthorityWarnings` and `relayOnmWarnings`, the `broadcasts` insert gains `push_codes: codes`. ONM and authority relays keep their current semantics; their dedup is a separate task outside this plan.

- [ ] **Step 6: Type-check and run the suite**

Run: `bunx tsc --noEmit && bun run test && bun run lint`
Expected: clean. The `broadcasts.tsx` admin table and `BroadcastBanner.tsx` keep reading `commune_codes` — that is coverage, which is what they mean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingest/broadcast.server.ts
git commit -m "Publish: coverage vs push, level-2 from fresh pixels, FRP in severity"
```

---

### Task 6: Deliver `push_codes`

**Files:**
- Modify: `src/lib/ingest/delivery.server.ts:33-43` (`PendingRow`), `:48-62` (`pendingRows`), `:124-170` (`fcmMessagesFor`), `:136-206` (`deliverTelegram`)

**Interfaces:**
- Consumes: `broadcasts.push_codes` (Task 3).
- Produces: FCM topics and Telegram wilaya channels derived from `push_codes`; a row with empty `push_codes` is stamped delivered with zero topics and zero channels.

- [ ] **Step 1: Read `push_codes`**

`PendingRow` gains `push_codes: string[]`; the `pendingRows` select adds `push_codes`.

- [ ] **Step 2: FCM from `push_codes`**

In `fcmMessagesFor`, every `communeCodes: row.commune_codes` becomes `communeCodes: row.push_codes`. In `deliverFcm`, `fcmMessagesFor` returning an empty array is a legitimate silent row: the loop already stamps `fcm_topics: messages.length` (0) and `fcm_delivered_at`, so no change beyond ensuring the `messages === null` guard stays distinct from `messages.length === 0`.

- [ ] **Step 3: Telegram from `push_codes`**

In `deliverTelegram`, the wilaya lookup select uses `pending.flatMap((p) => p.push_codes)` and the per-row `wilayaIds` mapping iterates `row.push_codes`. A row with no push codes yields zero chats and is stamped with `telegram_channels: 0` by the existing path.

- [ ] **Step 4: Type-check and run the suite**

Run: `bunx tsc --noEmit && bun run test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/delivery.server.ts
git commit -m "Delivery targets push_codes, not coverage"
```

---

### Task 7: Commit the replay harness as the regression gate and record the numbers

**Files:**
- Modify: `scripts/replay-window.ts` (untracked today; the variant flags come out, the library rules go in)
- Modify: `package.json:31-32` (scripts)
- Modify: `README.md` commands table, `GAPS.md` §1.3
- Create: `data/replay/README.md`

**Interfaces:**
- Consumes: `fireSeverity`, `planFireBroadcast`, `insideCommunes`, `coverageOf`, `pushCodesFor`, `OpenThread` (Tasks 1–2).
- Produces: `bun run replay:window --data <dir> --tag <tag> --from <iso> --through <iso> [--focus codes]` writing `<dir>/out-<tag>.md` and `.json`.

- [ ] **Step 1: Replace the publish section of the harness with the library rules**

In `scripts/replay-window.ts`, delete `VARIANT`, `FRP_EXTREME_MW`, `looks`, `silentJoins`, the `coveredBy`/`levelFor` block, and the `pushed` ternary. Import `coverageOf`, `insideCommunes`, `pushCodesFor`, `type OpenThread` from `../src/lib/broadcast-rules` and `PIXEL_GRID` from `../src/lib/ingest/fusion-geometry`. Type `threads` as `Map<string, OpenThread>`. The per-cluster body of `publish` becomes:

```ts
  const coverage = coverageOf(threads);
  for (const c of candidates) {
    const open = threads.get(c.id) ?? null;
    const severity = fireSeverity(c.nearest_settlement_km, c.max_frp_mw);
    const targets = targetsFor(c);
    const fresh = c.dets.filter((d) => d.available_at > now - 30 * 60_000);
    const seen = new Set<string>();
    const points = fresh.filter((d) => {
      const key = `${Math.round(d.lat / PIXEL_GRID)}:${Math.round(d.lon / PIXEL_GRID)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const inside = insideCommunes(points, targets, shapeByCode);
    const plan = planFireBroadcast({
      state: c.state,
      confidence: c.confidence,
      lastDetectedMs: Date.parse(c.last_detected_at),
      nowMs: now,
      severity,
      open,
      targets,
      additions: [],
      inside,
      fuelLimited,
    });
    if (!plan) continue;
    const closed = plan.action === "end" || plan.action === "cancel";
    const messageSeverity = closed ? (open?.severity ?? severity) : severity;
    const covered = plan.action === "initial" || plan.action === "update" ? plan.codes : (open?.communeCodes ?? []);
    const insideCodes = plan.action === "initial" || plan.action === "update" ? plan.inside : (open?.insideCodes ?? []);
    const rose = pushCodesFor({ clusterId: c.id, action: plan.action, codes: covered, inside: insideCodes, previous: open, coverage });
    const { allowed: pushed, dropped } = applyDailyLimit(rose, sentToday, closed || messageSeverity === "Extreme");
    threads.set(c.id, { phase: plan.action, severity: messageSeverity, communeCodes: covered, insideCodes, atMs: now });
    if (!pushed.length) {
      silent += 1;
      continue;
    }
    broadcasts.push({
      at: new Date(now).toISOString(),
      cluster: c.id,
      phase: plan.action,
      severity: messageSeverity,
      codes: pushed,
      dropped,
      detections: c.detection_count,
      confidence: c.confidence,
      sources: [...new Set(c.dets.map((d) => d.sensor))],
      min_since_first: Math.round((now - Date.parse(c.first_detected_at)) / 60_000),
      min_since_confirmed: c.first_confirmed_at ? Math.round((now - Date.parse(c.first_confirmed_at)) / 60_000) : null,
    });
  }
```

Declare `let silent = 0;` where `silentJoins` was and print it as `- silent thread advances: ${silent}` in the report. The reopen rule needs closed threads to stay visible for a day, so the `candidates` filter becomes:

```ts
      ((c.state === "active" && c.confidence >= MIN_CONFIDENCE) ||
        (threads.has(c.id) &&
          (["initial", "update"].includes(threads.get(c.id)!.phase) ||
            (threads.get(c.id)!.phase === "end" && now - threads.get(c.id)!.atMs < REOPEN_WINDOW_HOURS * HOUR))))
```

with `REOPEN_WINDOW_HOURS` imported.

- [ ] **Step 2: Type-check the harness**

`tsconfig.json` includes only `src/**` and `vite.config.ts`, so check the script directly:

Run: `bunx tsc --noEmit --module esnext --moduleResolution bundler --target es2022 --strict --skipLibCheck --baseUrl . --paths '{"@/*":["./src/*"]}' scripts/replay-window.ts`
Expected: no errors. If `--paths` is rejected on the command line, run the script instead: `bun run scripts/replay-window.ts --data <dir> --tag prodcheck --from 2026-08-30T12:00:00Z --through 2026-09-02T17:00:00Z` and confirm it writes both output files.

- [ ] **Step 3: Wire the script and document the data directory**

`package.json` scripts gain `"replay:window": "bun run scripts/replay-window.ts"`.

`data/replay/README.md`:

```markdown
# Replay data

`bun run replay:window` needs a data directory holding:

- `units.json`, `geoms.json`, `settlements.json` — the public `admin_units` (with `geom`
  for communes) and `settlements` rows, fetched with the publishable key.
- `fci/<tag>-*.json` — EUMETSAT WFS `mtg_fd:frp` GetFeature pages, `application/json`,
  time-filtered, BBOX lat-first `33.2,-3.2,37.6,9.7`. The layer serves months of archive.
- `firms/*-<SENSOR>.csv` — optional FIRMS area CSVs (`VIIRS_SNPP`, `VIIRS_NOAA20`,
  `VIIRS_NOAA21`, `MODIS`), available 10 days back with a `FIRMS_MAP_KEY`.

The 25–28 August 2026 window (Jijel) is the regression case: 44,534 FCI pixels. The
cache is not committed; the fetch recipe is in `docs/superpowers/plans/2026-09-02-commune-alert-state.md`.
```

README.md commands table gains the row `| bun run replay:window -- --data <dir> --tag <tag> --from <iso> --through <iso> | replay ingest → fusion → broadcast planning offline over a cached window |`.

- [ ] **Step 4: Run the Jijel replay against the new rules**

The cached window from the audit session lives in the session scratchpad under `replay/` (copy it to a directory of your choice). Run:

```bash
bun run replay:window -- --data <dir> --tag jijel --from 2026-08-25T00:00:00Z --through 2026-08-29T00:00:00Z --focus "$(cat <dir>/focus.txt)"
```

Expected, against the baseline of 381 initials, 9,575 commune pushes, peak 44 per commune-day: initials at most half the baseline, commune pushes below 2,500, peak per commune-day at most 10, and in the focus table every DGPC-named Jijel commune (El Milia, Ziama Mansouriah, Texenna, Chekfa, Sidi Maarouf, Ouled Yahia Khedrouche, Boudria Ben Yadjis, Ouled Rabah, Selma Ben Ziada, Boussif Ouled Askeur) with a pixel has an `initial` or `update` push within 60 minutes of its first in-polygon pixel. If a named commune misses that bar, the pixel-in-polygon level is not firing for it: check `insideCommunes` receives that cluster's fresh pixels (the 30-minute window) before touching thresholds.

Also rerun the fidelity window: `--tag prodcheck --from 2026-08-30T12:00:00Z --through 2026-09-02T17:00:00Z`. Expected: the seven FCI-first fires still get a first push within 10 minutes of the production times recorded in the audit (Boukhadra 11:00, Kouinine 09:10, Boufarik 13:40, Tolga 11:50, Aïn El Bel 12:10, Hanancha 10:40, Ahnif 16:40).

- [ ] **Step 5: Record the outcome in GAPS.md**

In GAPS.md §1.3, after the CAP paragraph, add one paragraph with the real numbers from Step 4 in this shape:

```markdown
**Commune alert state — shipped 2026-09-0N.** A push now means a commune's alert level
rose (fire within 15 km, then fire inside the commune), computed against every open
thread; ends push only where nothing else covers the commune; Extreme needs 20 MW; a
thread ended under 24 h reopens as an update. Replayed over 25–28 Aug FCI (44,534
pixels, `bun run replay:window`): <initials> initials and <pushes> commune pushes
against 381 and 9,575 before, peak <peak> pushes to one commune in a day against 44,
every DGPC-named Jijel commune pushed within <max> min of its first in-polygon pixel.
Rejected with numbers: requiring two looks before a push removed 12 of 381 initials on
that night and cost 10 min at median — it addresses single-look artefacts, not fatigue.
```

- [ ] **Step 6: Gates, then commit**

Run the gates derived from `.github/workflows/ci.yml`: `bun run test`, `bun run lint`, `bun run format` (check mode as CI runs it), `bunx tsc --noEmit`, `supabase test db`. Then:

```bash
git add scripts/replay-window.ts package.json README.md GAPS.md data/replay/README.md
git commit -m "Replay harness as the broadcast regression gate; Jijel numbers in GAPS"
```

---

## Self-review

- Spec coverage: severity floor (T1), reopen-as-update (T1), inside levels and push sets (T2), schema (T3), copy (T4), publish wiring (T5), delivery (T6), harness plus ledger plus two-looks rejection recorded (T7). ONM relay dedup and the event-driven chain are out of scope and are named in the audit, not here.
- Type consistency: `OpenThread` has `phase, severity, communeCodes, insideCodes, atMs` everywhere; `FirePlan` initial/update carry `inside`; `pushCodesFor` takes `previous: OpenThread | null` and `coverage: Coverage`; `fireSeverity(km, frp)` in T1, T5, T7.
- Placeholders: none. Numbers in the GAPS paragraph are filled from Step 4's output, not guessed.
