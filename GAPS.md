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

Decided design: model the alert as a **CAP object** first (`event`, `severity`, `urgency`,
`certainty`, `effective`/`expires`, area, `instruction`, language) and make each channel a
renderer over it. While zero channels exist that is one table and a serializer; after four
channels ship it is four rewrites plus a backfill of everything already sent. Object model
only — signing, approval chains and Cell Broadcast are institutional work, not code.

Start at: `src/lib/alerts-engine.server.ts`.

### 1.4 Fires outside Algeria are labelled as Algerian communes

Nothing clips detections to the country. The FIRMS bounding box (`-3,33.2,9,37.6`,
`src/lib/ingest/firms.server.ts:6`) reaches 70–130 km into Morocco and about 35 km past the
Tunisian border at its northern end, exactly where the Kroumirie–El Kala forest belt runs
continuous. Fusion then attributes any cluster within 60 km of a commune centroid to that
commune (`MAX_COMMUNE_DISTANCE_KM`, `src/lib/ingest/fusion.server.ts:13`, applied at :352),
and once a `commune_id` is set `placeLabel` returns `approximate: false`
(`src/lib/nadhir.ts:150`) — a definite Algerian place name for a fire in another country.

Two things to fix: widen the east edge to about 10.5 so the Tunisian forest belt is actually
covered, and make attribution able to say "outside Algeria" instead of guessing a commune.

### 1.5 No sub-5-minute detection

The §1.4 target depends on the geostationary EUMETSAT MTG FCI feed. Credentials are valid and
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
- **Citizen reports** accept uploads with no EXIF stripping, no captcha and no antivirus scan.
  Currently 0 reports, so this is a gap to close before promoting the feature, not a live
  exposure.
- **Admin console** has no cluster resolve (US-6), no broadcast, and no audit log.
- **Public API** has no GeoJSON output, no `/stats`, no WebSocket and no tiles. What exists is
  `/api/public/v1/fires` and `/api/public/v1/risk`; the risk endpoint takes `?commune=<code>`
  using `admin_units.code`, not a place name.

## 4. Contributing, tooling and licence

These are the things most likely to trip a newcomer, and most are small.

### 4.1 There is no LICENSE file

The app's own terms pages declare the code AGPL-3.0 and derived data CC-BY 4.0, but the
repository contains no `LICENSE`. Until one is added that declaration has no legal force and
nobody can safely reuse the code. **This is the single most valuable small contribution to an
open-source repo that currently has none.**

### 4.2 `supabase/config.toml` names the wrong project

It still reads `project_id = "qiyrlktcngedwbandtwn"`, while the linked project is
`kuukthyenirwgdfkltlm` (`supabase/.temp/project-ref`). CLI errors quote the stale id, so a
`supabase db push` can be aimed at the wrong database while the error message looks plausible.
Verify the target before any migration push.

### 4.3 `bun run lint` fails on a clean clone

1651 errors across 77 files — and **every one of them is `prettier/prettier` formatting. There
are zero real code errors.** The only other output is 7
`react-refresh/only-export-components` warnings in shadcn/ui files, which are HMR ergonomics.

`bun run format` fixes the lot. It has not been run because it touches 77 files and would
collide with in-flight work; doing it as one isolated commit is a good first contribution.

### 4.4 There is no CI

The only workflow is `.github/workflows/risk-refresh.yml`, which runs the daily FWI job.
Nothing runs `bun run test`, `bunx tsc --noEmit` or `bun run lint` on a pull request, so
nothing stops a regression landing. The test suite is fast (38 tests, well under a second).

### 4.5 Test coverage is narrow

38 tests across 6 files cover the FWI maths, FWI state advancement, alert rule evaluation,
geo seeding, i18n key parity and ingest guards. There is no coverage of clustering/fusion,
RLS policies, the public API routes, or any UI. Fusion (§1.4) is both untested and the place
where a wrong answer is user-visible.

### 4.6 Password policy is inconsistent

Supabase Auth accepts a 6-character minimum while the sign-up form enforces 8. The API is the
real boundary, so the effective policy is 6. Captcha is disabled, which combined with §1.2's
2-emails/hour ceiling means a bot could exhaust the project's email quota trivially.

### 4.7 Hosting needs the Workers Paid plan

React SSR costs more than the Cloudflare free plan's 10 ms CPU budget. On the free plan roughly
70% of page loads return 503 `exceededCpu` while the JSON API and static assets keep returning
200 — that asymmetry is the signature of the CPU limit, not a broken deploy. The paid plan's
default is 50 ms, which is also too low; the deployed limit is set explicitly to 30 s in
`vite.config.ts`.

### 4.8 The brand palette and the app palette disagree

The logo is built on forest green `#03332c`, which appears nowhere in the app's design tokens
(ink `#14181d` with a blue `#2171cc` accent). Reconciling them is a design decision, not a
mechanical change.

## Where to start

| If you want                    | Look at                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| A genuinely small first PR     | §4.1 licence, §4.3 formatting, §4.4 CI                         |
| Data engineering               | §2.1 ESA WorldCover, §2.2 EFFIS                                |
| Backend with real consequences | §1.3 CAP alert model, §1.4 cross-border attribution            |
| Domain science                 | §1.1 danger-scale calibration — the highest-value problem here |
| Ops                            | §1.2 SMTP, §1.5 netCDF decoding off-Worker                     |

Before changing anything that decides what a user is told, read `ORIGINAL-SPEC.md` for the
intended model and `roadmap.md` for what is already built. The spec is authoritative except on
the wilaya count: Algeria has 69, not the 58 the spec lists, and the code asserts 69 in
`src/lib/__tests__/geo-seed.test.ts`.
