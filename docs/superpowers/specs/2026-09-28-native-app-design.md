# Nadhir native app (Android / iOS) — design

Decisions: ADR-0005 (Capacitor shell around the bundled web build), ADR-0006 (Current Commune
resolved on the device). Glossary: CONTEXT.md, Current Commune.

## Why a native app

The PWA cannot reliably do four things Nadhir exists for: deliver alerts (iOS web push needs a
home-screen install; Android needs a high-importance channel), keep a Survival Pack the OS will
not evict, follow the phone's commune in the background, and be found in the stores.

## Sub-projects, in build order

1. **Native shell** — the web app built as an SPA, inside Capacitor, working against
   https://nadhir.app from the phone's own origin, opening with no network.
2. **Native push** — FCM on Android and iOS, commune topics subscribed on the device, the user
   topic through the existing authorised endpoint, tap-to-open, App Links / Universal Links.
3. **Current Commune** — bundled commune outlines, background location in Kotlin and Swift,
   opt-in UI, Survival Mode entry near the Current Commune.
4. **Store readiness** — identity, icons, permission wording in four languages, privacy
   declarations, and the owner-only steps.

Each sub-project lands as its own PR, in this order; sub-project 1 is `feat/native-app`.

## 1. Native shell

### Build

- `vite build --mode native` builds TanStack Start in SPA mode (`spa.enabled`, shell prerendered
  to `/index.html`) without the nitro Cloudflare plugin. Output is Capacitor's `webDir`.
- One module, `src/lib/platform.ts`, exports `NATIVE = import.meta.env.MODE === "native"` (a
  build-time constant, so web builds drop native code) and `APP_ORIGIN`
  (`VITE_APP_ORIGIN`, default `https://nadhir.app`).
- App id `app.nadhir`, name `Nadhir`. Capacitor 8. Android scheme `https` (origin
  `https://localhost`), iOS origin `capacitor://localhost`.

### Talking to nadhir.app from another origin

| Coupling (from the 2026-09-28 inventory) | Native path |
|---|---|
| Relative `fetch("/api/...")` (push, reports, ensemble, account) | `apiUrl(path)` prefixes `APP_ORIGIN` when `NATIVE` |
| `/api/private/*` have no CORS | Shared CORS helper allowing exactly `capacitor://localhost` and `https://localhost`, with `Authorization`; bearer auth only, never cookies |
| `delete-account` rejects a foreign `Origin` | Accepts the two app origins as well |
| `runMyAlertCheck` server function (CSRF-guarded, same-origin RPC) | Replaced by `POST /api/private/alert-check` (bearer auth) for web and native; server function deleted |
| `getDeficits` server function (contribute) | Unchanged — contribute is web-only (below) |
| Session in a cookie (`@supabase/ssr` browser client) | Native uses `supabase-js` with `localStorage`; `hasSessionCookie` reads that session on native |
| Locale and theme cookies | Native persists them in `localStorage`; web unchanged |
| Auth redirect URLs from `window.location.origin` | `APP_ORIGIN/auth` on native; Google sign-in hidden on native until sub-project 2 (Google blocks OAuth inside WebViews) |
| Share links from `window.location.href` | `publicUrl(path)` = `APP_ORIGIN + path` on native |
| `navigator.share` (absent in Android WebView) | `@capacitor/share` on native for Check-In and share cards |
| Service workers, web push | Not registered on native; push arrives in sub-project 2 |

### Web-only routes

Admin (`/admin/*`), contribute, developers, webhooks and the share-card render page stay on the
web. The native build hides their links; navigating to one opens `APP_ORIGIN + path` in the
system browser and returns to `/`.

### Offline and the Survival Pack

- All code and the survival screens ship inside the app, so the app opens with no network.
  `prepareSurvivalShell` is a no-op on native: its job — caching the survival route — is done by
  installation.
- The pack and survival flags stay in `localStorage` (synchronous reads during render are
  unchanged) and are mirrored to a file in the app's private data directory
  (`@capacitor/filesystem`, `Directory.Data`). At startup, before the first render, any mirrored
  key missing from `localStorage` is restored. iOS may purge WebView storage under disk pressure;
  it never purges the app's data directory.
- Map tiles are not offline (unchanged: the pack holds the commune outline, not tiles).

### Native intents

`tel:` (SOS, 14) and `sms:` (Check-In) open the dialer and messages app through Capacitor's
external-URL handling; verified on the Android emulator, not assumed. Geolocation uses the
WebView's `navigator.geolocation` with the platform permission declared (Android manifest, iOS
`NSLocationWhenInUseUsageDescription`).

### Error handling

A failed remote call surfaces exactly as on the web. A failed mirror write raises
`survival.packFailed` — a pack is not ready until it is durable. A missing `VITE_SUPABASE_*` at
native build time fails the build, not the app at runtime.

## 2. Native push (key decisions)

- `@capacitor-firebase/messaging`. Commune topics (`v1.commune.<code>.<lang>`) are subscribed
  with the native SDK — Nadhir's server never learns a native subscriber's communes (ADR-0006).
- The user topic (`v1.user.<id>`) keeps going through `/api/private/user-push`, which checks the
  bearer token: a client-side subscribe would let anyone join another user's topic.
- Server messages gain `android` (priority high, channel `fire_alerts`) and `apns`
  (`apns-priority: 10`, `interruption-level: time-sensitive`) blocks and a `data.link` path;
  the app creates the channels at startup and routes a tap to `data.link`.
- `/.well-known/assetlinks.json` and `apple-app-site-association` make nadhir.app links (push,
  share, auth emails) open the app. Google sign-in returns through them via the system browser.
- Excluded: native delivery receipts (web-only diagnostics today); iOS Critical Alerts
  (needs an Apple entitlement request — owner decision later).

## 3. Current Commune (key decisions)

- A script exports simplified commune outlines (code, bbox, polygon) to a versioned asset shipped
  in the app; target under 2 MB.
- A local Capacitor plugin, written twice (Kotlin, Swift): coarse location (Android low-power
  updates with background permission; iOS significant-change with Always), point-in-polygon with
  a bbox prefilter, then unsubscribe the old commune topic and subscribe the new one natively.
  It runs without the WebView.
- One JSON fixture of points and expected communes is asserted by the TypeScript, Kotlin and
  Swift tests, so the three resolvers cannot drift.
- Opt-in, off by default, explained before the OS prompt. "While using" permission gives
  foreground-only updates; that is a working mode, not an error.

## 4. Store readiness (key decisions)

Icons and splash from the existing logo on `#03332c`; permission wording in ar/fr/en/kab; iOS
privacy manifest; Play data-safety and background-location declaration text; privacy page
updated for the app and Current Commune.

Owner-only: Apple Developer Program, Xcode 26, APNs key into Firebase, Firebase Android/iOS app
registration (or `firebase login` so it can be scripted), Play Console account and signing, the
background-location demo video, store listings.

## Testing

- Vitest for `apiUrl`, `publicUrl`, the storage mirror, the alert-check route, CORS helper, and
  the extended FCM payloads.
- A CI step builds the native bundle (`vite build --mode native`), so a server-only import that
  leaks into the SPA fails the PR.
- Android: `assembleDebug`, JVM unit tests for the Kotlin resolver, emulator smoke of launch,
  offline launch, survival, SOS dial intent, sign-in.
- iOS: blocked on Xcode; Swift resolver tests share the fixture and run once Xcode exists.
