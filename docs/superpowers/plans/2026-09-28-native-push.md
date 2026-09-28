# Native push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broadcast Alerts and personal zone alerts arrive as system notifications on Android
and iOS, open the right screen when tapped, and commune subscriptions never touch Nadhir's server.

**Architecture:** `@capacitor-firebase/messaging` behind the existing `src/lib/push.ts` interface.
On native, commune topics are joined with the native SDK (ADR-0006); the user topic keeps going
through `/api/private/user-push`, which checks the bearer token. The server adds `android` and
`apns` blocks plus `data.link` to every message it already sends. Android shows foreground
messages through `@capacitor/local-notifications` on the same channel (the plugin only raises a
JS event there); iOS uses the plugin's `presentationOptions`.

**Tech Stack:** `@capacitor-firebase/messaging` 8.5.x, `@capacitor/local-notifications` 8.x,
FCM HTTP v1. Firebase apps registered 2026-09-28: Android `1:1038175256338:android:26b7f75e3e1ea03d11bdcb`,
iOS `1:1038175256338:ios:575152507ce22e0511bdcb`, both `app.nadhir`.

Spec: `docs/superpowers/specs/2026-09-28-native-app-design.md` §2.

## Global Constraints

- Topic names unchanged: `v1.commune.<code>.<lang>`, `v1.user.<id>` (ADR-0004).
- Web push behaviour unchanged when `NATIVE` is false.
- One Android channel `alerts`, importance high; the channel name is translated (ar/fr/en/kab).
- A native client never calls `/api/public/v1/subscribe`.
- Never send a verification push to a commune or user topic: real people are subscribed. Test
  sends go to the emulator's own registration token.
- Excluded: native delivery receipts, iOS Critical Alerts, App Links (need the release signing
  key and Apple Team ID — owner).

---

### Task 1: Server messages carry native delivery blocks

**Files:** Modify `src/lib/fcm.ts`; Test `src/lib/__tests__/fcm.test.ts`

**Interfaces:**
- Produces: every `FcmMessage` / `FcmUserMessage` gains
  `android: { priority: "high"; notification: { channel_id: "alerts"; tag?: string } }`,
  `apns: { headers: { "apns-priority": "10"; "apns-collapse-id"?: string }; payload: { aps: { sound: "default"; "interruption-level": "time-sensitive" } } }`,
  and `data.link` = the path part of the web link (`/fire/<shortId>`, `/alerts`, `/forecast?commune=…`, `/`).

- [ ] Step 1: failing tests — a fire message has `android.priority === "high"`,
  `android.notification.channel_id === "alerts"`, `android.notification.tag === "fire-<id>"`,
  `apns.headers["apns-collapse-id"] === "fire-<id>"`, `data.link === "/fire/<id>"`; an authority
  message has no tag/collapse-id and `data.link === "/"`; a user alert without short_id has
  `data.link === "/alerts"`.
- [ ] Step 2: run → FAIL. Step 3: add `nativeDelivery(link, tag?)` used by `message()` and
  `fcmMessageForAlert`; derive `data.link` with `new URL(link).pathname + search`.
- [ ] Step 4: `bun run test` → PASS (existing delivery tests assert shapes: update only the new
  fields). Commit `Send native delivery blocks with every FCM message`.

### Task 2: Native push client behind push.ts

**Files:** Create `src/lib/push-native.ts`; Modify `src/lib/push.ts`,
`src/components/DevicePush.tsx`, `src/components/nadhir/SubscribeSheet.tsx`,
`src/routes/__root.tsx`, `src/client.tsx`, `capacitor.config.ts`; Test
`src/lib/__tests__/push-native.test.ts`

**Interfaces:**
- Produces in `push.ts`: `notificationPermission(): Promise<"granted" | "denied" | "prompt">`,
  `requestNotificationPermission(): Promise<boolean>`; existing exports keep their signatures.
- `push-native.ts`: `nativeToken()`, `joinTopics(topics)`, `leaveTopics(topics)`,
  `startNativePush(navigate: (path: string) => void, channelName: string)`.

- [ ] Step 1: failing tests with the plugin mocked (`vi.mock("@capacitor-firebase/messaging")`):
  `subscribeToCommunes` on native joins exactly the new topics, leaves stale ones, and never
  calls `fetch("/api/public/v1/subscribe")`; `setUserPush(true)` posts the native token to
  `/api/private/user-push`; a tap with `data.link = "/fire/x"` calls `navigate("/fire/x")`; a
  link that is not a same-app path (`https://evil.example`, `//x`) is ignored. Native branches
  take `native` as a parameter so tests do not depend on the build mode.
- [ ] Step 2: implement. Permission reads move from `Notification.permission` to
  `notificationPermission()` in DevicePush and SubscribeSheet (render-time read becomes state set
  in an effect). `startNativePush` creates the `alerts` channel, listens for
  `notificationActionPerformed` and local-notification taps → `navigate(link)`, re-posts Android
  foreground messages as local notifications, and on `tokenReceived` re-runs `syncUserPush`.
  `capacitor.config.ts`: `FirebaseMessaging.presentationOptions = ["alert", "sound"]` and the SPM
  symlink option from the plugin README.
- [ ] Step 3: `bun run test`, `bunx tsc --noEmit`, `bun run lint`. Commit.

### Task 3: Android notification icon and emulator proof

**Files:** Create `android/app/src/main/res/drawable/ic_stat_nadhir.xml`; Modify
`android/app/src/main/AndroidManifest.xml` (default icon, channel id meta-data).

- [ ] Step 1: white-on-transparent vector icon; manifest meta-data
  `com.google.firebase.messaging.default_notification_icon` and
  `default_notification_channel_id = alerts`.
- [ ] Step 2: emulator: grant notifications, subscribe a commune, read the token over CDP, send
  one FCM v1 message **to that token** with the Task 1 blocks (service account from
  `.env.local`). Evidence: notification in the shade (background), notification while open
  (foreground re-post), tap opens `/fire/<id>` path. Commit.

### Task 4: iOS wiring (unverified until Xcode)

**Files:** Modify `ios/App/App/AppDelegate.swift`, `ios/App/App/Info.plist`
(`UIBackgroundModes` = `remote-notification`), `ios/App/App/App.entitlements`
(`aps-environment`).

- [ ] Step 1: add the three AppDelegate forwards from the plugin README. Commit, and list the
  owner steps: APNs auth key upload to Firebase, Push Notifications + Time Sensitive capabilities.
