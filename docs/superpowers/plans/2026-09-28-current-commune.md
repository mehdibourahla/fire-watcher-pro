# Current Commune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With the user's opt-in, the phone follows the commune it is in and receives that
commune's Broadcast Alerts, while Nadhir learns nothing about where anyone is (ADR-0006).

**Architecture:** A build-time export turns the 1536 commune outlines (22.9 MB, ~1M points in
`admin_units.geom`) into one simplified asset, `public/geo/communes.v1.json` (target < 2 MB),
shipped inside the app. A native tracker — Kotlin on Android, Swift on iOS — receives coarse
location updates without the WebView, resolves the commune by point-in-polygon with a bbox
prefilter, and swaps the FCM topic itself. JS only switches it on/off and passes the language and
the manually picked communes (which the tracker must never unsubscribe).

**Tech Stack:** Capacitor local plugins, Android FusedLocationProvider
(`play-services-location`), iOS CoreLocation significant-change, Firebase Messaging native SDKs,
Vitest + JUnit + a swiftc test runner sharing one fixture.

Spec: `docs/superpowers/specs/2026-09-28-native-app-design.md` §3; glossary Current Commune.

## Global Constraints

- Location and commune never leave the device; no server call is added (ADR-0006).
- Opt-in, off by default; "while using" permission is a working mode (foreground updates only).
- Outside every outline (sea, simplification sliver): keep the previous commune, never guess.
- The tracker never unsubscribes a topic that is also a manual Subscription.
- Topic names unchanged: `v1.commune.<code>.<lang>`.
- All new copy in ar, fr, en, kab.

---

### Task 1: Commune outline asset and the shared resolver contract

**Files:** Create `scripts/export-commune-outlines.ts`, `public/geo/communes.v1.json`,
`src/lib/commune-resolver.ts`, `src/lib/__tests__/commune-resolver.test.ts`,
`data/geo/commune-fixture.json`; Modify `package.json` (`export:outlines`).

**Interfaces:**
- Asset: `{ "v": 1, "communes": [{ "c": "<code>", "b": [minLon, minLat, maxLon, maxLat], "p": [[[[lon, lat], …]]] }] }` — `p` is MultiPolygon coordinates, 4-decimal.
- `resolveCommune(asset, lon, lat): string | null` — code of the first commune whose bbox and
  polygon (even-odd across rings) contain the point.
- Fixture: `[{ "lon", "lat", "code" }]` — 40 points taken from `admin_units.lat/lon` whose FULL
  outline contains them, plus 3 sea points with `code: null`; every resolver (TS, Kotlin, Swift)
  must return the fixture's answer.

- [ ] Test first (fixture agreement, sea → null, bbox prefilter skips far communes), then the
  resolver, then the export (RDP simplification per ring, tolerance tuned until < 2 MB and the
  fixture still agrees). Commit.

### Task 2: Android tracker

**Files:** Create `android/app/src/main/java/app/nadhir/commune/{CommuneResolver.kt,
CommuneTracker.kt, CommuneLocationReceiver.kt, CommuneBootReceiver.kt, CurrentCommunePlugin.kt}`,
`android/app/src/test/java/app/nadhir/commune/CommuneResolverTest.kt`; Modify `MainActivity.java`
(register plugin), `AndroidManifest.xml` (ACCESS_BACKGROUND_LOCATION, RECEIVE_BOOT_COMPLETED,
receivers), `android/app/build.gradle` (play-services-location, org.json for tests,
kotlin plugin if absent).

- [ ] JUnit resolver test on the shared fixture → resolver. Tracker: `LocationRequest`
  balanced power, 15 min interval, 1 km minimum distance, delivered to a `PendingIntent`
  broadcast (survives process death); on each fix resolve → if changed and not pinned, unsubscribe
  old topic, subscribe new, persist `{commune, lang, pinned, enabled, updatedAt}` in
  SharedPreferences. Boot receiver re-registers when enabled. Plugin: `start({lang, pinned})`,
  `stop()`, `setPinned({pinned, lang})`, `status()`, `requestBackground()`.
- [ ] Emulator proof: `adb emu geo fix` into two communes with the app killed; logcat shows the
  topic swap. Commit.

### Task 3: iOS tracker

**Files:** Create `ios/App/App/Commune/{CommuneResolver.swift, CommuneTracker.swift,
CurrentCommunePlugin.swift}`, `ios/App/App/MainViewController.swift`, a swiftc test runner in
`ios/App/CommuneTests/main.swift`; Modify `AppDelegate.swift` (start tracker on launch),
`Main.storyboard` (MainViewController), `Info.plist` (`NSLocationAlwaysAndWhenInUseUsageDescription`).

- [ ] Resolver test on the shared fixture via `swiftc`. Tracker: significant-change monitoring,
  started from `didFinishLaunching` when enabled (iOS relaunches the app without a scene for
  location events); same persistence and pinning rules via UserDefaults. Plugin registered in
  `MainViewController.capacitorDidLoad`. Simulator proof with `xcrun simctl location`. Commit.

### Task 4: JS surface

**Files:** Create `src/lib/current-commune.ts`, test; Modify `src/lib/push-native.ts`
(pinned handoff on subscribe/unsubscribe), `src/components/nadhir/SubscribeSheet.tsx` (toggle,
explanation, current commune name), locales ×4.

- [ ] Tests: turning it on passes the manual communes as pinned; unsubscribing all never removes
  the current commune topic; turning it off leaves manual topics intact. UI verified on the
  emulator. Commit.
