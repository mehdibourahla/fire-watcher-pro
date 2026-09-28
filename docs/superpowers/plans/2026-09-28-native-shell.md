# Native shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The existing web app runs as an Android/iOS app from a bundled SPA build, talks to
https://nadhir.app from its own origin, and opens with no network.

**Architecture:** `vite build --mode native` builds TanStack Start in SPA mode into
`dist/client`, which Capacitor 8 ships as `webDir`. A build-time constant `NATIVE` gates every
native branch so web builds drop them. Remote calls get an absolute origin, private routes get an
allowlisted CORS, the session and preferences move to `localStorage` on native, and `nadhir.*`
storage keys are mirrored to the app's data directory.

**Tech Stack:** Capacitor 8.5 (`@capacitor/core`, `cli`, `android`, `ios`, `app`,
`filesystem`, `share`), TanStack Start SPA mode, supabase-js, Vitest.

Spec: `docs/superpowers/specs/2026-09-28-native-app-design.md` §1. Spike results (2026-09-28):
the SPA build prerenders `/index.html` (4.4 MB) and boots against production Supabase with zero
console errors when served statically.

## Global Constraints

- App id `app.nadhir`, app name `Nadhir`, Capacitor 8.5.x, Node ≥ 22.
- App origins exactly `capacitor://localhost` (iOS) and `https://localhost` (Android).
- `APP_ORIGIN` = `import.meta.env.VITE_APP_ORIGIN || "https://nadhir.app"`.
- Web behaviour must be byte-for-byte unchanged when `NATIVE` is false (except the
  server-function → route replacement in Task 2, which both use).
- Private routes authenticate by bearer token only; CORS never allows credentials.
- Zero comments unless a one-line non-obvious why. No new copy strings without all four
  locales (ar, fr, en, kab).
- CI gates (from `.github/workflows/ci.yml`): `bunx tsc --noEmit`, `bun run test`,
  `bun run lint`, `bash scripts/test-db.sh`, `bun run build`; this plan adds
  `bun run build:native`.

---

### Task 1: Native build and Capacitor scaffold

**Files:**
- Create: `src/lib/platform.ts`, `src/lib/__tests__/platform.test.ts`, `capacitor.config.ts`
- Modify: `vite.config.ts` (mode-aware SPA + no nitro), `package.json` (scripts, deps),
  `.gitignore`
- Generated: `android/`, `ios/` (committed, minus build outputs)

**Interfaces:**
- Produces: `NATIVE: boolean`, `APP_ORIGIN: string`,
  `apiUrl(path: string, native?: boolean, origin?: string): string`,
  `publicUrl(pathAndSearch: string, origin?: string): string`,
  `webOnlyPath(pathname: string): boolean`.

- [ ] **Step 1: Failing tests** — `src/lib/__tests__/platform.test.ts`

```ts
import { expect, it } from "vitest";
import { apiUrl, publicUrl, webOnlyPath } from "@/lib/platform";

it("keeps API paths relative on the web", () => {
  expect(apiUrl("/api/private/account", false)).toBe("/api/private/account");
});
it("prefixes the app origin on native", () => {
  expect(apiUrl("/api/private/account", true, "https://nadhir.app")).toBe(
    "https://nadhir.app/api/private/account",
  );
});
it("builds public links on the site origin", () => {
  expect(publicUrl("/fire/abc?lang=fr", "https://nadhir.app")).toBe(
    "https://nadhir.app/fire/abc?lang=fr",
  );
});
it("marks admin, contribute, developers, webhooks and share-card as web-only", () => {
  for (const p of ["/admin", "/admin/fires", "/contribute", "/contribute/language/kab",
    "/developers", "/webhooks", "/share-card/incident/x"])
    expect(webOnlyPath(p)).toBe(true);
  for (const p of ["/", "/fire/abc", "/survival", "/alerts", "/administration"])
    expect(webOnlyPath(p)).toBe(false);
});
```

- [ ] **Step 2:** `bunx vitest run src/lib/__tests__/platform.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/platform.ts`

```ts
export const NATIVE = import.meta.env.MODE === "native";
export const APP_ORIGIN: string =
  import.meta.env["VITE_APP_ORIGIN"] || "https://nadhir.app";

export function apiUrl(path: string, native = NATIVE, origin = APP_ORIGIN) {
  return native ? `${origin}${path}` : path;
}

export function publicUrl(pathAndSearch: string, origin = APP_ORIGIN) {
  return `${origin}${pathAndSearch}`;
}

const WEB_ONLY = /^\/(admin|contribute|developers|webhooks|share-card)(\/|$)/;

export function webOnlyPath(pathname: string) {
  return WEB_ONLY.test(pathname);
}
```

- [ ] **Step 4:** re-run → PASS.

- [ ] **Step 5: Vite native mode** — in `vite.config.ts`: `({ command, mode })`; inside
  `tanstackStart({...})` add
  `...(mode === "native" ? { spa: { enabled: true, prerender: { outputPath: "/index" } } } : {})`;
  change the nitro guard to `command === "build" && mode !== "native"`.

- [ ] **Step 6: Dependencies and scripts**

```bash
bun add @capacitor/core@^8.5.2 @capacitor/app@^8 @capacitor/filesystem@^8 @capacitor/share@^8
bun add -d @capacitor/cli@^8.5.2 @capacitor/android@^8.5.2 @capacitor/ios@^8.5.2
```
`package.json` scripts: `"build:native": "vite build --mode native"`,
`"cap:sync": "bun run build:native && cap sync"`.

- [ ] **Step 7: `capacitor.config.ts`**

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.nadhir",
  appName: "Nadhir",
  webDir: "dist/client",
  backgroundColor: "#03332c",
  android: { allowMixedContent: false },
};

export default config;
```

- [ ] **Step 8: Platforms** — `bunx cap add android && bunx cap add ios` (iOS generation must not
  need Xcode; if it does, commit Android only and record the blocker). Add to `.gitignore`:
  `android/app/build/`, `android/.gradle/`, `android/local.properties`, `ios/App/Pods/`,
  `ios/App/build/`, `android/app/src/main/assets/public/`, `ios/App/App/public/`.

- [ ] **Step 9: Verify** — `bun run build:native` → `dist/client/index.html` exists; `bun run build`
  (web) still succeeds; `bunx tsc --noEmit`.

- [ ] **Step 10: Commit** — `git commit -m "Add Capacitor shell and native SPA build"`

---

### Task 2: Remote calls from the app origin

**Files:**
- Create: `src/lib/app-cors.server.ts`, `src/lib/__tests__/app-cors.test.ts`,
  `src/routes/api/private/alert-check.ts`, `src/lib/alert-check.server.ts`,
  `src/lib/__tests__/alert-check.test.ts`
- Modify: `src/routes/api/private/{account,ensemble,push-test,report-publish,user-push}.ts`,
  `src/lib/delete-account.server.ts:10-11`, `src/lib/__tests__/delete-account.test.ts`,
  `src/lib/push.ts:99,129,198`, `src/lib/reports.ts:404`, `src/lib/ensemble-preview.ts:9`,
  `src/routes/_authenticated/settings.tsx:45`, `src/components/share/IncidentShareSheet.tsx:51`,
  `src/routes/_authenticated/alerts.tsx:23,50` (+ its call site), `src/components/fire/FireDetailPage.tsx:46`,
  `src/routes/index.tsx:497`
- Delete: `src/lib/alerts.functions.ts`

**Interfaces:**
- Consumes: `apiUrl`, `publicUrl`, `NATIVE` (Task 1).
- Produces: `APP_ORIGINS: ReadonlySet<string>`, `appOrigin(request): string | null`,
  `appPreflight(request, methods: string): Response`,
  `withAppCors(request, response): Response`; `POST /api/private/alert-check` →
  `{ created: number }` (same value `evaluateAlerts` returned).

- [ ] **Step 1: Failing tests** — `src/lib/__tests__/app-cors.test.ts`

```ts
import { expect, it } from "vitest";
import { appPreflight, withAppCors } from "@/lib/app-cors.server";

const req = (origin: string | null) =>
  new Request("https://nadhir.app/api/private/account", {
    headers: origin ? { origin } : {},
  });

it("allows the two app origins without credentials", () => {
  for (const origin of ["capacitor://localhost", "https://localhost"]) {
    const res = appPreflight(req(origin), "DELETE");
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  }
});
it("refuses any other origin", () => {
  expect(appPreflight(req("https://evil.example"), "POST").status).toBe(403);
  expect(appPreflight(req(null), "POST").status).toBe(403);
});
it("stamps responses only for app origins", () => {
  const ok = withAppCors(req("https://localhost"), Response.json({ ok: true }));
  expect(ok.headers.get("access-control-allow-origin")).toBe("https://localhost");
  expect(ok.headers.get("vary")).toContain("Origin");
  const web = withAppCors(req("https://nadhir.app"), Response.json({ ok: true }));
  expect(web.headers.get("access-control-allow-origin")).toBeNull();
});
```

Add to `delete-account.test.ts`: a request with `origin: "capacitor://localhost"` passes the
origin gate (reaches `getUser`), and `origin: "https://evil.example"` still gets 403.

- [ ] **Step 2:** run both files → FAIL.

- [ ] **Step 3: Implement** `src/lib/app-cors.server.ts`

```ts
export const APP_ORIGINS: ReadonlySet<string> = new Set([
  "capacitor://localhost",
  "https://localhost",
]);

export function appOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  return origin && APP_ORIGINS.has(origin) ? origin : null;
}

export function appPreflight(request: Request, methods: string): Response {
  const origin = appOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

export function withAppCors(request: Request, response: Response): Response {
  const origin = appOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.append("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
```

`delete-account.server.ts:10`: allow `origin === new URL(request.url).origin || APP_ORIGINS.has(origin)`.

- [ ] **Step 4: Wire routes.** Each private route gains
  `OPTIONS: async ({ request }) => (await import("@/lib/app-cors.server")).appPreflight(request, "<METHOD>")`
  and wraps its handler result: `return withAppCors(request, await handleX(request))`.
  Methods: account `DELETE`, ensemble `GET`, push-test `POST`, report-publish `POST`,
  user-push `POST`, alert-check `POST`.

- [ ] **Step 5: Alert check route (replaces the server function).** Test first
  (`alert-check.test.ts`): 401 without bearer; 401 when `supabaseAdmin.auth.getUser` errors;
  200 `{ created: 3 }` when `evaluateAlerts` (mocked `@/lib/alerts-engine.server`) returns 3 for
  the token's user id. Then `src/lib/alert-check.server.ts`:

```ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function handleAlertCheck(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return json({ error: "unauthorized" }, 401);
  const { evaluateAlerts } = await import("@/lib/alerts-engine.server");
  return json({ created: await evaluateAlerts(data.user.id) }, 200);
}
```
  Check what `evaluateAlerts` returns before writing the test fixture and match it exactly.
  `alerts.tsx`: drop `useServerFn(runMyAlertCheck)`; call a client helper that POSTs
  `apiUrl("/api/private/alert-check")` with the session bearer. Delete `alerts.functions.ts`
  and grep for `runMyAlertCheck` → zero hits.

- [ ] **Step 6: Client call sites.** Wrap each relative path in `apiUrl(...)`:
  `push.ts:99,129,198`, `reports.ts:404`, `ensemble-preview.ts:9`, `settings.tsx:45`,
  `IncidentShareSheet.tsx:51` (`apiUrl(shareImagePath(...))`). Share links:
  `FireDetailPage.tsx:46` and `index.tsx:497` use
  `NATIVE ? publicUrl(location.pathname + location.search) : window.location.href`.

- [ ] **Step 7: Verify** — `bun run test`, `bunx tsc --noEmit`, `bun run lint`.

- [ ] **Step 8: Commit** — `git commit -m "Let the app origin call private routes; alert check becomes a route"`

---

### Task 3: Native session, locale and theme

**Files:**
- Modify: `src/integrations/supabase/client.ts:66-77`, `session-cookie.ts`,
  `legacy-session.ts`, `src/i18n/locale-cookie.ts`, `src/lib/theme.ts`,
  `src/routes/auth.tsx:174-176` and the sign-up / forgot / Google entry points,
  `src/lib/__tests__/session-cookie.test.ts`
- Test: `src/lib/__tests__/native-prefs.test.ts`

**Interfaces:**
- Produces: `hasStoredSession(keys: string[]): boolean` (session-cookie.ts);
  `parseLocale(value: string | null): Locale` (locale-cookie.ts);
  `parseTheme(value: string | null): Theme` (theme.ts).

- [ ] **Step 1: Failing tests**

```ts
import { expect, it } from "vitest";
import { hasStoredSession } from "@/integrations/supabase/session-cookie";
import { parseLocale } from "@/i18n/locale-cookie";
import { parseTheme } from "@/lib/theme";

it("detects a supabase session key in storage", () => {
  expect(hasStoredSession(["nadhir.locale", "sb-kuuk-auth-token"])).toBe(true);
  expect(hasStoredSession(["nadhir.locale", "sb-kuuk-auth-token-code-verifier"])).toBe(false);
  expect(hasStoredSession([])).toBe(false);
});
it("parses stored preferences with the cookie defaults", () => {
  expect(parseLocale("kab")).toBe("kab");
  expect(parseLocale("xx")).toBe("ar");
  expect(parseLocale(null)).toBe("ar");
  expect(parseTheme("dark")).toBe("dark");
  expect(parseTheme(null)).toBe("system");
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: Implement.**
  - `session-cookie.ts`: `export function hasStoredSession(keys: string[]) { return keys.some((k) => /^sb-.*-auth-token$/.test(k)); }`;
    `.client(() => NATIVE ? hasStoredSession(Object.keys(window.localStorage)) : hasAuthCookie(document.cookie))`.
  - `client.ts` browser branch: when `NATIVE`, build with `createClient<Database>(URL, KEY, { global, auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" } })`, keeping the `recoveryProof` listener for both branches.
  - `legacy-session.ts`: first line `if (NATIVE) return false;` — on native that key *is* the live session and the migration would delete it.
  - `locale-cookie.ts`: extract `parseLocale(value)` from `parse`; client reader:
    `NATIVE ? parseLocale(window.localStorage.getItem("nadhir.locale")) : parse(document.cookie)`;
    `writeLocaleCookie` returns early on native (`applyLocale` already writes `nadhir.locale`).
  - `theme.ts`: extract `parseTheme`; on native `readThemeCookie` reads `nadhir.theme`,
    `applyTheme` writes `nadhir.theme` instead of the cookie, and `THEME_BOOT_SCRIPT` reads
    `localStorage.getItem("nadhir.theme")` (choose the script string by `NATIVE`).
  - `auth.tsx`: `redirectTo` uses `APP_ORIGIN` on native. On native, sign-up, forgot-password
    and Google open `publicUrl("/auth?mode=<mode>")` with `window.open(url, "_blank")` instead
    of running in-app (PKCE verifiers would sit in the app while the email link opens the
    browser; App Links in sub-project 2 bring them back in-app).

- [ ] **Step 4:** run tests → PASS; `bunx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -m "Keep the native session and preferences in app storage"`

---

### Task 4: Durable storage and the offline Survival Pack

**Files:**
- Create: `src/lib/durable-storage.ts`, `src/lib/__tests__/durable-storage.test.ts`
- Modify: `src/routes/__root.tsx:101,188-208`, `src/lib/survival-pack-prepare.ts:24`

**Interfaces:**
- Produces: `type MirrorFs = { write(key: string, value: string): Promise<void>; remove(key: string): Promise<void>; readAll(): Promise<Record<string, string>> }`;
  `createMirror(fs: MirrorFs): { set(key: string, value: string): void; remove(key: string): void; flush(): Promise<void> }`;
  `restoreMirror(storage: Pick<Storage, "getItem" | "setItem">, fs: MirrorFs): Promise<number>`;
  `startDurableStorage(): Promise<void>`; `flushDurableStorage(): Promise<void>`.

- [ ] **Step 1: Failing tests** (`MirrorFs` fake; `restoreMirror` gets a `Map`-backed getItem/setItem)

```ts
import { expect, it } from "vitest";
import { createMirror, restoreMirror, type MirrorFs } from "@/lib/durable-storage";

function memoryFs(fail = false): MirrorFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    write: async (k, v) => { if (fail) throw new Error("disk"); files.set(k, v); },
    remove: async (k) => void files.delete(k),
    readAll: async () => Object.fromEntries(files),
  };
}

it("mirrors nadhir.* writes and removals in order, ignores other keys", async () => {
  const fs = memoryFs();
  const mirror = createMirror(fs);
  mirror.set("nadhir.survival.pack", "{}");
  mirror.set("sb-x-auth-token", "secret");
  await mirror.flush();
  expect([...fs.files.keys()]).toEqual(["nadhir.survival.pack"]);
  mirror.set("nadhir.survival.pack", "{\"v\":2}");
  mirror.remove("nadhir.survival.pack");
  await mirror.flush();
  expect(fs.files.size).toBe(0);
});
it("flush rejects once when a mirror write failed", async () => {
  const mirror = createMirror(memoryFs(true));
  mirror.set("nadhir.survival.pack", "{}");
  await expect(mirror.flush()).rejects.toThrow("disk");
  await expect(mirror.flush()).resolves.toBeUndefined();
});
it("restores only keys missing from storage", async () => {
  const fs = memoryFs();
  fs.files.set("nadhir.survival.pack", "old");
  fs.files.set("nadhir.locale", "fr");
  const m = new Map([["nadhir.locale", "kab"]]);
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  expect(await restoreMirror(storage, fs)).toBe(1);
  expect(m.get("nadhir.survival.pack")).toBe("old");
  expect(m.get("nadhir.locale")).toBe("kab");
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: Implement** `src/lib/durable-storage.ts`: `createMirror` serialises writes on one
  promise chain (so a set-then-remove lands in order), records the first failure, logs it with
  `console.error`, and `flush` rethrows it once. `restoreMirror` copies `nadhir.*` entries whose
  key is absent from storage. `startDurableStorage` (native only, idempotent) builds the
  `@capacitor/filesystem` `MirrorFs` (`Directory.Data`, folder `storage`, file name
  `encodeURIComponent(key)`, UTF-8; `readAll` treats a missing folder as empty), awaits
  `restoreMirror(window.localStorage, fs)`, then patches `Storage.prototype.setItem` /
  `removeItem`: call the original, and when `this === window.localStorage` also call
  `mirror.set` / `mirror.remove` (an own-property assignment on a `Storage` instance would store
  an item named "setItem", hence the prototype). `flushDurableStorage` awaits `mirror.flush()`.

- [ ] **Step 4: Wire.**
  - `__root.tsx` `beforeLoad`: `async () => { if (NATIVE) await (await import("@/lib/durable-storage")).startDurableStorage(); return { locale: initLocale() }; }`.
  - `__root.tsx:188-208`: skip `migrateLegacySession`, service-worker registration and web-push
    `syncSubscription`/`syncUserPush` when `NATIVE`.
  - `survival-pack-prepare.ts`: `prepareSurvivalShell` returns immediately when `NATIVE`
    (installation already holds the survival screens), and `prepareZonePack` passes
    `NATIVE ? flushDurableStorage : undefined` as a new optional `afterSave` argument of
    `preparePack`, awaited after `savePack` — the pack is ready only once it is durable.
    `survival-pack.test.ts` gets a case: a rejecting `afterSave` makes `preparePack` reject.

- [ ] **Step 5:** `bun run test`, `bunx tsc --noEmit`.

- [ ] **Step 6: Commit** — `git commit -m "Mirror nadhir storage to the app data directory on native"`

---

### Task 5: Native glue — web-only routes, sharing, safe areas, permissions

**Files:**
- Create: `src/lib/native-share.ts`
- Modify: `src/routes/__root.tsx` (`beforeLoad` guard), `src/routes/survival/checkin.tsx:55`,
  `src/components/fire/FireDetailPage.tsx:44-55`,
  `src/components/share/IncidentShareSheet.tsx` (`shareImage`, `save`, `canShareFiles`),
  `src/styles.css`, `android/app/src/main/AndroidManifest.xml`, `ios/App/App/Info.plist`

**Interfaces:**
- Consumes: `NATIVE`, `APP_ORIGIN`, `webOnlyPath`, `publicUrl` (Task 1).
- Produces: `shareText(text: string, url?: string): Promise<void>`,
  `shareImageFile(file: File): Promise<void>` (native only; reject on failure,
  resolve on user cancel).

- [ ] **Step 1: Web-only guard** — root `beforeLoad` (after storage restore):
  `if (NATIVE && webOnlyPath(location.pathname)) { window.open(publicUrl(location.href), "_blank"); throw redirect({ to: "/", replace: true }); }`.
  `location.href` here is the router's path+search, not an absolute URL — confirm with a
  `console.log` during the emulator smoke, then remove it.

- [ ] **Step 2: Sharing** — `native-share.ts` wraps `@capacitor/share` (`Share.share({ text, url })`;
  files: write the blob to `Directory.Cache` via `@capacitor/filesystem` as base64, then
  `Share.share({ files: [uri] })`; treat the plugin's cancel error as success).
  Call sites branch on `NATIVE`: Check-In `onSend`, the fire page share button, and the
  incident share sheet (`canShareFiles` is `true` on native once an image loaded; `save` uses
  `shareImageFile` on native since `<a download>` does nothing in a WebView).

- [ ] **Step 3: Safe areas** — `styles.css`: `html.native body { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }`
  and set the `native` class on `<html>` in `RootShell` when `NATIVE`. Verify on the emulator
  that the header clears the status bar and nothing is double-padded; adjust to the specific
  fixed elements (bottom tabs, map controls) if the body padding does not reach them.

- [ ] **Step 4: Permissions** — Android manifest: `ACCESS_COARSE_LOCATION`,
  `ACCESS_FINE_LOCATION` (INTERNET is already there). iOS `Info.plist`:
  `NSLocationWhenInUseUsageDescription` = "Nadhir uses your location to show hazards near you
  and to prepare your Survival Pack." (localized strings arrive in sub-project 4).

- [ ] **Step 5:** `bun run test`, `bunx tsc --noEmit`, `bun run lint`.

- [ ] **Step 6: Commit** — `git commit -m "Native sharing, safe areas, web-only routes and location permission"`

---

### Task 6: CI gate, Android build and emulator smoke

**Files:**
- Modify: `.github/workflows/ci.yml` (add `bun run build:native` after `bun run build`),
  `README.md` (a short "Native app" section: build, sync, open)

- [ ] **Step 1:** add the CI step; `bun run build:native` locally.
- [ ] **Step 2:** `bunx cap sync android && cd android && ./gradlew assembleDebug` → APK built.
- [ ] **Step 3: Emulator smoke** (Android 36 arm64). Each item needs a screenshot or log line:
  1. App launches to the live map with data.
  2. Airplane mode, force-stop, relaunch → app opens; `/survival` renders the prepared pack.
  3. SOS "call 14" opens the dialer with 14; Check-In opens the share sheet.
  4. Sign in with a test account → `/alerts` loads; the alert-check button returns a count
     (needs the Task 2 routes deployed or `VITE_APP_ORIGIN` pointed at a local dev server
     reachable from the emulator).
  5. `/admin` from the account menu opens the system browser; the app returns to the map.
  6. Hardware back navigates history, and exits only from `/`.
  7. Header clears the status bar in portrait.
- [ ] **Step 4:** full gate list (Global Constraints) green.
- [ ] **Step 5: Commit** — `git commit -m "Build the native bundle in CI"`
