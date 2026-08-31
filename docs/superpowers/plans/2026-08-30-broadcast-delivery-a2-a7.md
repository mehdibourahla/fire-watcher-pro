# Broadcast Delivery (AMBER slices A2–A7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the A1 publisher to real channels and surfaces: FCM commune-topic push (A2), accountless web subscription (A3), per-wilaya Telegram channels (A4), the in-app banner (A5), the admin surface (A6), and status honesty (A7) — all on `feat/broadcast-publisher-a1` / PR #40.

**Architecture:** Delivery is a separate pipeline step after `publishBroadcasts`: it scans `broadcasts` rows whose per-channel `*_delivered_at` stamp is null (24 h retry window), renders the stored CAP object (fires) or the `onm_vigilance` row (relays), and fans out — one FCM send per commune×lang topic, one Telegram message per wilaya channel. Missing credentials degrade the source honestly (markSource) instead of crashing the pipeline; missing rows/config in safety paths fail closed. Owner supplies secrets before merge: `FIREBASE_SERVICE_ACCOUNT`, `TELEGRAM_BOT_TOKEN` (Cloudflare worker secrets + `.env.local`), Firebase web config + VAPID public key (public, committed), Telegram channel chat ids (seeded into `telegram_channels`).

**Tech Stack:** crypto.subtle RS256 for Google OAuth (no new server deps), `firebase` JS SDK client-side only (A3), existing TanStack Start / i18n / RLS patterns.

## Global Constraints

- Topics: `v1.commune.<code>.<lang>` with `<lang>` ∈ ar, fr, en, kab (ADR-0004); notification text comes from the CAP info block of that lang; deep link `https://nadhir.app/fire/<short_id>`.
- ONM/authority relays render verbatim, attributed, never merged into Nadhir text (CONTEXT.md); no danger-level pushes ever.
- Subscriptions are anonymous: server stores nothing durable per subscriber; FCM holds the topic mapping; the backend endpoint only proxies subscribe/unsubscribe (ADR-0004).
- A5: emergency broadcasts only OFFER Survival Mode via the existing proximity-gated interstitial (`SURVIVAL_AUTO_KM`); commune-wide delivery must never itself trigger Survival entry — verify no new entry path is added.
- Delivery metrics count topics/channels, never people (A7).
- Worker subrequest budget: cap FCM sends per run (`FCM_SEND_BUDGET = 500`); undelivered rows retry next run.
- Two-step permission UX (maquette artboard 2): the OS notification prompt is only requested after the explainer; first-visit sheet shows once (localStorage).
- CI gates unchanged: `bunx tsc --noEmit`, `bun run test`, `bun run lint`. Same PR #40; commit per task.
- UI copy in all four locales via `src/i18n/locales/*`; surfaces follow the approved maquette artboards (Entry/Main/Permission/Banner/AlertDetail) with Nadhir tokens.

## File Structure

- `src/lib/fcm.ts` — pure: `fcmTopic(code, lang)`, `fcmMessagesForBroadcast(...)` (per-topic message JSON from CAP info / ONM row), lang list. TDD.
- `src/lib/ingest/fcm.server.ts` — Google OAuth token from `FIREBASE_SERVICE_ACCOUNT` (crypto.subtle RS256, cached until expiry), `fcmSend(message)`, `fcmSubscribeTopics(token, topics, add)`.
- `src/lib/telegram.ts` — pure: `telegramMessageHtml(...)` (CAP/ONM → HTML-escaped message), severity floor. TDD.
- `src/lib/ingest/telegram.server.ts` — Bot API `sendMessage` per channel via `TELEGRAM_BOT_TOKEN`.
- `src/lib/ingest/delivery.server.ts` — `deliverBroadcasts()`: undelivered scan, fan-out, stamps, budget; called from `runDetectionPipeline` after `publishBroadcasts`; `markSource("broadcast", …)` (A7).
- `src/routes/api/public/v1/subscribe.ts` — POST proxy: validate {token, communes ≤ 10, lang, action} → IID batchAdd/batchRemove.
- `src/lib/push.ts` + `public/firebase-messaging-sw.js` + `src/components/nadhir/SubscribeSheet.tsx`, first-visit invite, header bell (A3, maquette artboards 0–2).
- `src/components/nadhir/BroadcastBanner.tsx` on the home route (A5, artboard 4).
- `src/routes/_authenticated/broadcasts.tsx` — kill-switch toggle, audit view, manual authority relay (A6).
- Migrations: delivery stamps + `telegram_channels` + `authority_warnings` + admin RLS + `data_sources` row.
- `src/integrations/supabase/types.ts` hand-updates alongside each migration.

---

### Task A2.1: Pure FCM message building

**Files:** Create `src/lib/fcm.ts`; Test `src/lib/__tests__/fcm.test.ts`.

**Produces:**
```ts
export const FCM_LANGS = ["ar", "fr", "en", "kab"] as const;
export function fcmTopic(code: string, lang: string): string; // v1.commune.<code>.<lang>
export type FcmMessage = {
  topic: string;
  notification: { title: string; body: string };
  webpush: { fcm_options: { link: string } };
  data: { broadcast_id: string; severity: string; kind: string };
};
export function fcmMessagesForFire(args: {
  broadcastId: string; severity: string; communeCodes: string[];
  shortId: string; info: { language: string; headline: string; description: string }[];
}): FcmMessage[]; // codes × langs, title/body from the matching CAP info block (ar-DZ→ar etc.)
export function fcmMessagesForOnm(args: {
  broadcastId: string; severity: string; communeCodes: string[];
  title: string; headlineFr: string | null; sent: string;
}): FcmMessage[]; // verbatim + attribution "ONM · Météo Algérie", link to /forecast
```

- [ ] RED: tests — topic format; codes×4 messages per fire; info-block matching by language tag prefix; fire link `https://nadhir.app/fire/<shortId>`; ONM body verbatim (title + headline_fr), attributed, all langs get the same verbatim text; no danger-level content.
- [ ] GREEN, gates, commit `feat: FCM topic message building`.

### Task A2.2: Google auth + send + delivery step

**Files:** Create `src/lib/ingest/fcm.server.ts`, `src/lib/ingest/delivery.server.ts`; migration `broadcasts add column fcm_topics integer, fcm_delivered_at timestamptz, telegram_channels integer, telegram_delivered_at timestamptz` + `insert into data_sources (name,label,status,note) values ('broadcast','Broadcast delivery','degraded','Never delivered yet.')`; Modify `pipeline.server.ts`, `types.ts`.

Key server pieces (glue, no unit tests — repo pattern):
```ts
// fcm.server.ts
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/cloud-platform";
export function fcmConfigured(): boolean; // FIREBASE_SERVICE_ACCOUNT set
async function accessToken(): Promise<string>; // JWT RS256 (crypto.subtle importKey pkcs8 → sign) → oauth2.googleapis.com/token, cached ~50 min
export async function fcmSend(message: FcmMessage): Promise<void>; // POST fcm.googleapis.com/v1/projects/<project_id>/messages:send; throw on !ok except 404 UNREGISTERED
export async function fcmSubscribeTopics(token: string, topics: string[], add: boolean): Promise<void>; // iid.googleapis.com/iid/v1:batchAdd|batchRemove, header access_token_auth: true
```
`deliverBroadcasts()`: rows `fcm_delivered_at is null and created_at > now-24h`, joined to `cap_alerts.info` (fires) / `onm_vigilance` (relays); build messages; send up to `FCM_SEND_BUDGET`; stamp `fcm_topics` (count) + `fcm_delivered_at` only when every message for the row went out; `markSource("broadcast", …)` with sent counts, degraded note when `!fcmConfigured()`. Pipeline: call after `publishBroadcasts`, own recordRun("delivery").

- [ ] Migration + types; implement; gates; commit `feat: FCM delivery step with per-run send budget`.

### Task A3.1: Subscribe proxy endpoint

**Files:** Create `src/routes/api/public/v1/subscribe.ts`.

POST body `{ token: string, communes: string[], lang: "ar"|"fr"|"en"|"kab", action: "subscribe"|"unsubscribe" }`; 400 on bad shape, >10 communes, or codes not in `admin_units` (level commune); 503 when `!fcmConfigured()`; topics = communes × the ONE given lang; call `fcmSubscribeTopics`; respond `{ok, topics}`. No auth (accountless by design), no server-side state.

- [ ] Implement; gates; commit `feat: accountless topic-subscribe proxy`.

### Task A3.2: Client push + subscription UI

**Files:** Add `firebase` dep; create `public/firebase-messaging-sw.js`, `src/lib/push.ts` (web config + VAPID const — real values from owner before merge, empty-config guard shows unavailable state), `SubscribeSheet.tsx`, first-visit invite, header bell; i18n strings ×4 locales.

Flow per maquette 0→1→2: invite sheet (once) → commune picker (search, ≤10, lang from current locale) → explainer → OS prompt → `getToken({vapidKey})` → POST subscribe; persist `{communes, lang}` in localStorage; re-POST on `getToken` refresh at app load. Unsubscribe = action unsubscribe + clear storage.

- [ ] Implement; browser-verify manually later (config-gated); gates; commit `feat: web subscription flow`.

### Task A4: Telegram channels

**Files:** Create `src/lib/telegram.ts` (+ test), `src/lib/ingest/telegram.server.ts`; migration `create table telegram_channels (wilaya_id uuid primary key references admin_units(id), chat_id text not null, created_at timestamptz default now())` service-role only; extend `deliverBroadcasts`.

Pure: `telegramMessageHtml(broadcast, capInfoFr|onmRow, wilayaName)` — HTML-escaped, severity floor `Severe`, attribution for relays, link to fire page. TDD: escaping (`<`, `&` in place names), floor, one message per alert (dedupe by `telegram_delivered_at`). Server: `sendMessage(chat_id, html)` via Bot API; channels = `telegram_channels` rows for wilayas of the target communes; stamp `telegram_channels` count + `telegram_delivered_at`; skip + degraded note when `TELEGRAM_BOT_TOKEN` unset or mapping empty.

- [ ] RED/GREEN pure part; server + wiring; gates; commit `feat: per-wilaya Telegram channel delivery`.

### Task A5: In-app banner

**Files:** Create `BroadcastBanner.tsx`; mount on `src/routes/index.tsx`; i18n ×4.

Reads `broadcasts` (public) for localStorage-subscribed communes: rows < 24 h old, latest per cluster/onm id, phase ≠ end/cancel shows live style, end shows the quiet-hours line (artboard 4). Links to `/fire/<short_id>` (join via cluster_id → fire_clusters.short_id in the query) or `/forecast` for relays. MUST NOT touch Survival entry logic — banner is display + link only; grep survival entry paths to confirm untouched.

- [ ] Implement; gates; commit `feat: home broadcast banner for subscribed communes`.

### Task A6: Admin surface

**Files:** Migration: `authority_warnings` table (`id, source text not null, received_via text not null, body text not null, wilaya_id uuid references admin_units(id), commune_codes text[], severity text check (severity in ('Extreme','Severe')) not null, created_by uuid, created_at`), `broadcasts.kind` check widened to `('fire','onm','authority')` + `broadcasts.authority_warning_id uuid references authority_warnings(id)` + unique partial index like ONM's; RLS: admin insert/select on `authority_warnings`, admin select on `broadcast_audit`, admin select+update(enabled) on `broadcast_settings` (has_role pattern); publisher relays unrelayed authority_warnings exactly like ONM (targets = commune_codes override or all communes of wilaya); delivery renders body verbatim + attribution from `source`. Create `src/routes/_authenticated/broadcasts.tsx`: kill-switch toggle (direct RLS update), audit table (latest 200), manual relay form. types.ts updates. Closes part of GAPS §3 — update that section.

- [ ] Migration + types; publisher + delivery extension; UI; gates; commit `feat: admin broadcast surface — kill-switch, audit, manual authority relay`.

### Task A7: Status honesty

**Files:** `delivery.server.ts` already writes the `broadcast` source row (A2.2); add freshness/status wiring on `src/routes/status.tsx` if data_sources rows don't render automatically (check first); delivery metrics line: topics/channels sums from `broadcasts` over 24 h — counts only. Tick A2–A7 boxes in roadmap.md; update GAPS §1.3/§3 lines that this work closes; note owner checklist in PR body.

- [ ] Implement; gates; commit `feat: broadcast status row and topic-count metrics`.

### Task FIN: lean pass + reviews + PR update

- [ ] Lean diff re-read; spec review then quality review (migrations + RLS in diff → inline review required); fix findings; push; update PR #40 body with the owner checklist:
  1. `bunx wrangler secret put FIREBASE_SERVICE_ACCOUNT` (paste full service-account JSON) + same var in `.env.local`.
  2. Firebase console: register a web app, send me `{apiKey, authDomain, projectId, messagingSenderId, appId}` + Web Push certificate public key (VAPID) → I commit them (public values).
  3. `bunx wrangler secret put TELEGRAM_BOT_TOKEN`; create per-wilaya public channels, add the bot as poster, then seed `telegram_channels` (I provide the SQL).

## Self-Review

Covered: A2 topics/langs/deep links (A2.1–2.2), A3 endpoint + token refresh + accountless (A3.1–3.2), A4 CAP-rendered, deduped, escaped, floored (A4), A5 public-table banner + Survival constraint (A5), A6 manual relay/kill-switch/audit UI + GAPS §3 (A6), A7 source row + topic-count metrics (A7). Types consistent (`FcmMessage`, `fcmConfigured`, stamps). Out of scope: SMS/email (per-recipient queues), native apps.
