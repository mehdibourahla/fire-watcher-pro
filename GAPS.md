# Known gaps

What Nadhir does not do yet, why it matters, and where to start. Every claim here was checked
against the running system on 2026-08-28; where a number is quoted, the query that produced it
is named so you can re-run it rather than trust this file.

Nadhir is a wildfire early-warning service. A gap in a warning system is not the same as a
missing feature in a normal app: if the danger scale is wrong or an alert never sends, the
product is confidently useless at the moment it matters. The list is ordered accordingly.

**The project is not a safe warning service today.** It is a working data platform with an
honest status page. Treat §1 as the distance between those two things.

## 1. Blocking a real warning service

### 1.1 The danger scale is not calibrated for Algeria

Today's forecast puts **1057 of 1536 communes (68.8%) at level 5 "Extreme"**, 12.2% at level 4
and 18.9% at level 3. **No commune is at level 1 or 2.** A scale that never says "Low" carries
no information, and a public that sees "Extreme" every day stops reading it.

This is not an arithmetic bug. The CFFDRS implementation is verified against Van Wagner's
published worked example to ±0.01 in `src/lib/__tests__/risk.test.ts`. The numbers are right;
the _thresholds_ are borrowed from a Canadian boreal regime and applied to an arid one.

Do not "fix" it by editing the FWI maths. The options are recalibrated level thresholds
(spec §9.1), a scale that only covers the forested north, or deferring to EFFIS as the
authority. All three need a fire scientist's judgement, not a patch.

Reproduce: `select danger_level, count(*) from risk_forecasts where horizon_days=0 group by 1;`
Start at: `dangerFromFwi`, `src/lib/ingest/fwi.ts:134`.

### 1.2 Nobody can register

`auth.users` is **0**. Sign-up requires an email confirmation, and the project has no custom
SMTP, so it falls back to Supabase's built-in sender — capped at **2 emails/hour project-wide**
and documented by Supabase as not for production.

Login itself is fine, and was verified end to end: password grant issues a token, the app's
lazy profile creation succeeds, zone creation succeeds, and RLS holds (inserting a zone under
another user's id is rejected 403). The wall is purely getting confirmed in the first place.

Two related settings were wrong and are now fixed: `site_url` pointed at `http://localhost:3000`
so every confirmation link was dead, and `uri_allow_list` was empty so the app's
`emailRedirectTo` was ignored.

Remaining work: configure an SMTP provider (Resend, Postmark, SES) in Supabase Auth. Until
then no user account can exist, so zones, alerts and the whole authenticated half of the
product are unreachable.

### 1.3 No alert reaches a human

Alerts are computed and stored (`alerts` table) but nothing delivers them. Push, SMS, email
and Telegram are all unwired; a Firebase service account exists but is not connected. The
alerts table currently holds 0 rows, which is expected given §1.2.

The **CAP object** every channel must render is now built (`cap_alerts`, `src/lib/cap.ts`):
each fire alert links to one CAP 1.2 warning carrying all four languages, so a channel added
later renders an approved object instead of inventing its own payload. It was done while zero
channels exist because that is one table and a serializer; after four channels ship it would
be four rewrites plus a backfill. Signing, approval chains and Cell Broadcast remain
institutional work, not code.

What is left is the delivery itself: pick a provider per channel and render the CAP object to
it. **The `cap_alerts` migration has not been applied to the live project yet**, and the
engine writes to that table, so apply it before deploying.

Start at: `src/lib/alerts-engine.server.ts`, `src/lib/cap.ts`.

### 1.4 No sub-5-minute detection

The spec's §1.4 target depends on the geostationary EUMETSAT MTG FCI feed. Credentials are valid and
the feed is polled for health, but the granules are netCDF and the edge runtime cannot decode
them, so **no FCI detection is ever written**. A test pins this behaviour in
`src/lib/__tests__/ingest.test.ts` so it cannot regress silently.

Detection latency is therefore whatever the polar-orbiting satellites give — hours, not
minutes. Fixing it means decoding netCDF somewhere that is not a Worker.

## 2. Data quality

### 2.1 `forest_fraction` is effectively unpopulated

Only **13 of 1536 communes** and 10 of 69 wilayas have a non-zero value (max 0.72). The §9.3
wind bump in the risk model is implemented but reads 0 for 99% of the country, so it almost
never fires. Populating it needs ESA WorldCover land-cover data joined to commune geometry.

Reproduce: `select level, count(*) filter (where coalesce(forest_fraction,0)>0), count(*) from admin_units group by level;`

### 2.2 EFFIS / GWIS is not connected

The European fire information system is the natural external authority for §1.1 and is not
wired at all. `/status` correctly reports it unavailable rather than pretending.

## 3. Product surface

- **Alert rules R2 (growth) and R5 (all-clear)** are unimplemented. R5 additionally needs the
  `alerts.kind` CHECK constraint widened before it can be inserted.
- **Citizen reports** strip Exif before upload (`src/lib/image-metadata.ts`), which also
  narrows accepted photos to JPEG and PNG — anything else is refused rather than stored
  unsanitised. The strip runs **in the browser**, so it protects a reporter from leaking their
  own GPS but is not a control against someone who uploads to Storage without it; the bucket
  enforces the size and mime limits server-side, nothing more. Captcha and antivirus scanning
  are still missing. Currently 0 reports, so those are gaps to close before promoting the
  feature, not a live exposure.
- **Admin console** has no cluster resolve (US-6), no broadcast, and no audit log.
- **Public API** has no WebSocket and no tiles. What exists is `/api/public/v1/fires`
  (with `?format=geojson`), `/api/public/v1/risk` and `/api/public/v1/stats`; the risk
  endpoint takes `?commune=<code>` using `admin_units.code`, not a place name.

## 4. Contributing, tooling and licence

### 4.1 Dependency advisories are dev-only

`bun audit` reports 5 high advisories in `brace-expansion`, `nanoid` and `js-yaml`. All three
arrive through eslint, typescript-eslint and vite's postcss chain, and all are denial-of-service
classes. None reach the deployed Worker — verified by searching the built bundle for the package
names _and_ for their runtime signatures (nanoid's alphabet constant, js-yaml's `YAMLException`),
which returns nothing. Dependabot is enabled and will carry the fixes; clearing them today means
taking the eslint 10 and vitest 4 major bumps, which is a judgement call, not a security urgency.

### 4.2 Password policy is inconsistent

Supabase Auth accepts a 6-character minimum while the sign-up form asks for 8. The API is the
real boundary, so the effective policy is 6. Captcha is disabled, which combined with §1.2's
2-emails/hour ceiling means a bot could exhaust the project's email quota trivially.

### 4.3 Test coverage is narrow

77 tests across 12 files cover the FWI maths, FWI state advancement, alert rule evaluation, geo
seeding, i18n key parity, ingest guards, the cross-border watch area, place labelling, Exif
stripping, CAP construction, the public API helpers and the webhook URL guard. There is still no
coverage of clustering/fusion internals, RLS policies, the route handlers end to end, or any UI.
Fusion is the weakest spot: its commune attribution is guarded only by an assertion over the
source text, not by exercising the function.

### 4.4 Hosting needs the Workers Paid plan

React SSR costs more than the Cloudflare free plan's 10 ms CPU budget. On the free plan roughly
70% of page loads return 503 `exceededCpu` while the JSON API and static assets keep returning
200 — that asymmetry is the signature of the CPU limit, not a broken deploy. The paid plan's
default is 50 ms, which is also too low; the deployed limit is set explicitly to 30 s in
`vite.config.ts`.

## Where to start

| If you want                    | Look at                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| A genuinely small first PR     | §4.1 licence, §4.3 formatting, §4.4 CI                         |
| Data engineering               | §2.1 ESA WorldCover, §2.2 EFFIS                                |
| Backend with real consequences | §1.3 wiring a delivery channel onto the CAP object             |
| Domain science                 | §1.1 danger-scale calibration — the highest-value problem here |
| Ops                            | §1.2 SMTP, §1.4 netCDF decoding off-Worker                     |

Before changing anything that decides what a user is told, read `ORIGINAL-SPEC.md` for the
intended model and `roadmap.md` for what is already built. The spec is authoritative except on
the wilaya count: Algeria has 69, not the 58 the spec lists, and the code asserts 69 in
`src/lib/__tests__/geo-seed.test.ts`.
