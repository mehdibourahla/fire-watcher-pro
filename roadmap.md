# Nadhir — build roadmap

Stack adaptation: TanStack Start + React + Supabase (Postgres) replaces
FastAPI/Celery/Redis. Source work runs as isolated Postgres-backed jobs consumed by
Cloudflare Workers and GitHub Actions.
Geometry stored as lat/lon columns (ADR-001) instead of PostGIS.

## Live project

Supabase `nadhir` — ref `kuukthyenirwgdfkltlm`, region eu-west-3 (Paris).
Seed and ops credentials live in `~/.config/nadhir/`, never in this repo.

## Data sources actually connected

| Source                                        | State                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| NASA FIRMS (SNPP, NOAA-20, NOAA-21, MODIS)    | connected, ingesting                                                             |
| Open-Meteo (weather + local FWI + winds)      | connected                                                                        |
| OpenStreetMap (admin boundaries, settlements) | seeded via `bun run seed:geo`                                                    |
| EUMETSAT MTG FCI                              | connected — public WFS fire-radiative-power points ingest every 10 minutes       |
| EFFIS / GWIS                                  | connected — daily danger classes per commune from the EFFIS WMS (`effis_danger`) |

## Phases

- [x] P1 Foundation: schema, design system, i18n (ar/fr/en/kab), app shell
- [x] P2 Live map, cluster markers, today panel
- [x] P3 Fire detail (timeline, wind, nearest settlements)
- [x] P4 Forecast page (6-day outlook, commune search)
- [x] P5 Accounts & zones (auth, zones CRUD, settings)
- [x] P6 Alerting (zone rules, dedup fan-out, alerts feed, isolated evaluation job)
- [x] P7 Ingestion workers; the original `ingest_runs` journal is superseded by the
      reliability-control-plane epic below
- [x] P8 Fusion + risk engines (clustering, FSM, confidence, CFFDRS FWI)
- [x] P9 Citizen reports + moderation console
- [x] P10 History & burned areas (unbounded archive query, recharts)
- [x] P11 Public API (v1 fires/risk), signed webhooks, rate limiting, legal pages
- [x] UI/UX rebuild — see `docs/superpowers/specs/2026-08-28-nadhir-ui-redesign-design.md`
- [x] Real geography — 69 wilayas, 1536 communes, 10257 settlements from OSM
- [x] FWI state persistence (`fwi_state`) so runs advance instead of re-fetching history
- [x] Cross-border watch strips into Morocco and Tunisia; fires outside Algeria keep their
      coordinates instead of borrowing the nearest Algerian commune name
- [x] Exif stripped from citizen report photos before upload (JPEG and PNG only)
- [x] Public API: GeoJSON on `/fires`, plus `/stats`
- [x] CAP 1.2 alert object (`cap_alerts`) — migration applied to the live project 2026-08-29
- [x] P12 Survival mode v1 — chrome-less `/survival` (hub with Standing Guidance, SOS +
      position card, check-in via the user's own SMS/WhatsApp, open areas), entry points on
      the live map (pill, position-based interstitial, zone banner), offline Survival Pack +
      service worker, hazard report kinds. Language and invariants: `CONTEXT.md`,
      `docs/adr/0002`, `docs/adr/0003`. Migration applied and `open_areas` seeded with
      2068 OSM rows on 2026-08-29.

- [x] Persistent-source screening — 567-cell registry in 158 sites learned from NASA's
      `type` label in the FIRMS science archive, applied at ingest via `detections.fp_reason`,
      with a held-out confusion matrix gated in CI (`bun run evaluate:sources`). Removes 98.4%
      of alerting-size false fires for 5.5% of real ones. Spec:
      `docs/superpowers/specs/2026-08-29-persistent-source-screening-design.md`.

- [x] P13 Contribute page — `/contribute` states what is missing rather than what is wanted:
      four deficits read live from the database, eight contribution lanes ordered by need
      with code eighth, and a moderated idea board with anonymous voting. Adds
      `open_areas.verified_at` so the headline deficit is a real query and field
      verification has somewhere to land. Submissions and votes run through rate-limited
      server routes, so the tables carry no anon insert policy. Spec:
      `docs/superpowers/specs/2026-08-30-contribute-page-design.md`.

## Known gaps

The full, evidence-checked list lives in [GAPS.md](GAPS.md) — kept there rather than duplicated
here so the two cannot drift. Headline blockers: the danger scale reads Extreme for 68.8% of
communes and Low for none, registration cannot complete without SMTP, and broadcast delivery
waits on the Firebase and Telegram runtime secrets.

## Operations

- Deployed to Cloudflare Workers as `nadhir` — <https://nadhir.app> and `www`. The
  `workers.dev` hostname is off: declaring `routes` sets `workers_dev` false.
  Every push to `main` deploys through the CI `deploy` job (the `production` GitHub
  environment holds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`); manual fallback
  is `bun run build && bunx wrangler deploy`. Requires the Workers **Paid** plan
  (active): React SSR exceeds the free plan's 10ms CPU budget, so pages 503 there while the
  JSON API still answers.
- Supabase cron and Cloudflare cron independently enqueue the same normalized source slots
  every minute. Cloudflare consumes short jobs; expired leases are recovered in Postgres.
- Daily FWI and EFFIS run on GitHub Actions (`.github/workflows/source-jobs-github.yml`)
  because they are CPU-bound; pg_cron dispatches the workflow per due job through
  `repository_dispatch`. Each consumer drains its contract; obsolete current-only slots are audited as unrecoverable instead of running fresh
  data against an old interval. Pending backoff keeps the consumer alive, while retries that
  outlive their usefulness window are terminalized and audited in bounded batches. Replay is
  offered only while provider retention can still cover the gap.
- The Worker cron evaluates the `source_watchdog` view every five minutes and sends one
  Telegram message to `NADHIR_OPERATOR_CHAT_ID` per state transition (red with the issue list,
  then recovered); `operator_alert_state` holds the last announced fingerprint.
- `bun run seed:geo --prune` — reseed geography from `data/geo/` (monthly, idempotent).
- FIRMS and FCI gaps replay exact retained intervals only by UUID through
  `bun run replay:source -- <gap-uuid>`; unsupported terminal gaps are unrecoverable.
- Secrets needed by the deployed app: `FIRMS_MAP_KEY`, `EUMETSAT_CONSUMER_KEY/SECRET`,
  `NADHIR_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT`,
  `TELEGRAM_BOT_TOKEN` (the last two pending — delivery reports degraded until set).

## Epic: Broadcast Alerts (codename AMBER — never user-facing)

Decisions from the 2026-08-30 discovery session; glossary in CONTEXT.md
(Broadcast Alert, Subscription), architecture in ADR-0004.

**What it is.** Nadhir-originated Information pushed to every subscriber of an
area, seconds after a fire confirms — plus authority warnings relayed verbatim
alongside. Never an Instruction; danger levels never broadcast (same rule as
Survival Mode entry). Delivery fans out at the platform (FCM commune topics +
Telegram wilaya channels), one CAP object per alert, O(areas) sends — the same
topics serve the future native mobile apps unchanged.

Slices, in dependency order:

- [x] A1 CAP → broadcast publisher: trigger on confirmed clusters (≥0.6, severity
      by settlement proximity) and ONM Severe+; targeting = containing commune +
      ~15 km polygon ring, updates extend pure-downwind; lifecycle initial →
      update → observation-honest end ("no detections for N h", never all-clear);
      per-commune daily rate limit, global kill-switch, append-only audit log.
      Lifecycle in CAP terms: msgType Alert for the initial, Update/Cancel with
      fresh identifiers chained via references — never reuse an identifier, the
      cap_alerts unique-identifier upsert would silently drop the update.
- [x] A2 FCM integration: connect the existing Firebase service account; publish
      to `v1.commune.<code>.<lang>` notification-type topics (4 langs, from the
      CAP object); deep links to the fire page.
- [x] A3 Web subscription UI: accountless — pick communes + language; client
      gets an FCM registration token and calls the backend topic-subscribe
      endpoint (ADR-0004), re-invoked on token refresh; no durable per-subscriber
      server state.
- [x] A4 Telegram channels: per-wilaya public channels; one message per channel
      per alert, CAP-rendered, cluster-deduped, HTML-escaped, severity floor.
- [x] A5 In-app surface: active-broadcast banner for subscribed communes, read
      from the public broadcast table (AlertNotifier and the alerts table are
      authenticated-only and cannot serve accountless subscribers); an
      emergency-severity broadcast only OFFERS Survival Mode through the existing
      proximity-gated interstitial (device location within SURVIVAL_AUTO_KM) —
      commune-wide delivery must never itself trigger Survival entry.
- [x] A6 Admin: manual relay of attributed authority warnings (phone-call
      case), kill-switch UI, audit log view. Closes part of GAPS §3.
- [x] A7 Status honesty: `broadcast` source row + freshness; delivery metrics
      by topic count, never per-person (Subscriptions stay anonymous).

Owner actions gating the epic: Firebase service account key into deploy secrets
(exists per GAPS §1.3, unconnected); Telegram bot + channel creation; later
SMS/email providers (per-recipient queues enter only then).

## Epic: Data Reliability Control Plane

**Why this is first.** Nadhir cannot make upstream providers stay online, but it must know
when a scheduler, source, derived product or delivery channel is late; preserve the last
validated watermark; and never present partial data as current. The approved architecture is
in `docs/superpowers/specs/2026-08-31-data-reliability-control-plane-design.md`.

Slices, in dependency order:

- [x] M1A Contracts and truthful health: versioned source contracts, atomic checkpoints,
      append-only private run evidence, one database-derived health view, structured reporting
      from every current pipeline stage, four-language status UI, and the sanitized
      `/api/public/v1/status` endpoint. The legacy `data_sources` and `ingest_runs` relations
      remain dormant for one expand/contract deploy window; their removal is the next release.
- [ ] M2 Isolated execution: implementation is complete for per-contract queue jobs and leases,
      bounded retries, recorded gaps, ID-only replay, Cloudflare plus database triggers,
      independent GitHub consumers
      for FWI/EFFIS, and an out-of-band watchdog. The old direct cron endpoints and combined
      pipeline are removed. Production rollout and its observation window remain operator gates.
- [ ] M3 Atomic daily risk: stage a complete 1,536-commune × 6-horizon snapshot, publish one
      manifest transactionally, and block risk alerts from stale or partial products.
- [ ] M4 Delivery reliability: separate FCM and Telegram attempts, retry each independently,
      measure backlog against objectives, and open incidents without rewriting broadcast state.
- [ ] M5 Operator response: deduplicated incidents, independent notifications, acknowledge /
      pause / resume / replay controls, audit trail, retention, and failure drills.
- [ ] M6 New-source gate: require every proposed layer to ship an adapter contract, captured
      producer fixtures, licence/provenance, coverage and recency validation, fallback behavior,
      and replay tests. Candidate layers remain NDVI/fuel condition, soil moisture, lightning,
      burned area, population exposure, rainfall, ensemble weather, and smoke transport.
