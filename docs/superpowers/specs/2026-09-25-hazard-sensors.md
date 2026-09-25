# Hazard sensors: official warnings, earthquakes, observed weather, lightning

Tier 1 and 2 of the road to a national-grade warning service. Research and live probes of
2026-09-25 decided the scope; numbers below are from those probes, not from documentation.

Design Read: ENERGY 2 / RHYTHM 2 / MOTION 1 (unchanged from the 2026-08-28 redesign).

## Rules carried in

- Nadhir informs; only authorities direct (ADR 0002). Every new layer is Information with its
  source and observation time. Standing Guidance is pre-written and reviewed, never an LLM.
- LLM first where there is meaning to extract (DGPC posts), with deterministic guards around it.
  Numeric feeds (FDSN, METAR, WMS) are parsed deterministically: a model adds risk there.
- National sources only for adapters; international scientific feeds are fine.
- Silence never ends a situation; only an authority does.

## What the research ruled out

- ONM CAP cancellation chains: 80 distinct archived feed versions since 9 September, 7,203
  entries, all `msgType=Alert`, none with `references`. ONM renews by reissuing and withdraws
  by dropping the entry. Nothing to adapt; dropping is silence and must not cancel anything.
- CRAAG has no feed (10-row HTML page since June). EMSC carries CRAAG's contributions.
- Tsunami: CENALT publishes nothing public; no Algerian gauge in the IOC network.
- Ground networks: 0 Sensor.Community nodes, 0 Raspberry Shake stations in Algeria.
  Blitzortung forbids raw-data use without permission. A web app cannot sense in background.
- ANRH hydrometry answered HTTP 500; flood models return nulls on the Soummam.
- H SAF satellite rainfall needs the first EUMETSAT Data Store OAuth client: deferred.

## Slice A (Tier 1): ONM episodes and push receipts

**Episode dedupe.** Each ONM warning gets its episode once, when it is first stored: a BEFORE
INSERT trigger copies `episode_id` and `episode_peak` (highest severity so far) from the most
recently sent warning of the same area and event whose validity overlaps, else starts its own.
Zone weather alerts key on `weather:<episode_id>:<episode_peak>`. A renewal stays silent, an
escalation alerts, a downgrade stays silent, as broadcasts already do. Nothing is recomputed
later, so send order, onset order and episode length cannot change a key. Existing rows are
backfilled in send order; no alert key is rewritten, so there is no deploy race.

**Push receipts.** "Sent" today means FCM accepted it; FCM also accepts a topic with no
device. Each push carries its alert id and a server HMAC of it. A plain `push` listener in
`firebase-messaging-sw.js` (it fires beside the Firebase SDK's own) posts both to
`/api/public/push-receipt`; a service worker holds no session, so the signature is the proof.
`alerts.push_received_at` records the first valid receipt.
The admin delivery page shows sent vs received per day. Nothing is inferred from a missing
receipt: a closed browser may simply not wake.

## Slice B (Tier 1): Protection Civile beyond fire (LLM first)

Measured in prod, 25 Aug to 25 Sep: 192 DGPC posts; 111 road-accident or activity summaries,
17 drowning recoveries, 17 weather posts. Two kinds carry live value:

1. **Weather-impact situation reports** ("الحالة العامة إثر التقلبات الجوية"): per wilaya and
   commune, current impacts, e.g. "RN104 closed by the rising Oued Merhoum", "tunnel on RN4
   closed", rescues from flood water.
2. **ONM bulletin relays with Protection Civile advice** under "⚠️ تنبيه", e.g. "drive
   carefully, secure loose objects, keep away from trees".

Posts the regex router does not send to the fire pipeline (today counted `posts_not_fire` and
dropped) go to a new LLM step (gemini-2.5-flash, strict JSON schema, temperature 0) that returns:

- `disposition`: `situation_report` | `weather_relay` | `retrospective` | `activity_summary`
  | `fire` | `other`.
- For situation reports, `items[]`: `hazard` (`flood`, `road`, `structure`, `storm`, `other`),
  `place_text` (as written), `road_ref`, `state` (`ongoing` | `cleared` | `unknown`), and
  `evidence` (a span copied from the post).
- For weather relays, `advice` (the authority's own sentence), `wilayas[]`, `valid_from`,
  `valid_to`.

Deterministic guards: every `evidence` and `advice` must be a verbatim substring of the post
(else the item goes to review); places resolve through the existing gazetteer or go to review;
`retrospective` and `activity_summary` publish nothing (a past casualty is not a continuing
threat); `fire` re-enters the fire pipeline, so the LLM is the catch-all the regex lacks.

Storage: `official_incidents` gains `hazard` (default `fire`), non-fire kinds, and status
`cleared`. Fire confirmation, the public Telegram relay and the recall view filter to fire.
Non-fire incidents live 12 h from their as-of time, then fade; `cleared` from the authority
ends them. They appear on the map under their category and alert zones through the existing
`notify_official` switch, worded "Protection Civile reports ... at <time>".
Weather advice is stored per ONM warning it matches (same wilaya, overlapping validity) and is
shown and pushed verbatim, attributed to Protection Civile, beside ONM's own text.

## Slice C (Tier 2): Earthquakes (EMSC)

Source: EMSC FDSN event service, polled every 2 minutes with `updatedafter`, Algeria box plus
100 km. Past year: 78 Algerian events, M2.0 to 4.7 (49 in M3, 4 at M4+); USGS saw 20, none
below M3. Contract `emsc`, criticality high, archived through `archivedFetch`.

- `earthquakes` table keyed by EMSC `unid`: time, lat, lon, depth, magnitude and type, region,
  reporting network (e.g. CRAAG, IGN), `updated_at`. Revisions overwrite; no history needed.
- Map: new category `earthquake` (citizen earthquake reports move there from "other"); a
  circle scaled by magnitude, shown 72 h. Wording: "Earthquake M4.2, recorded 14:02 by EMSC
  (network: CRAAG)".
- Zones: `notify_earthquake` (default on), kind `earthquake`. Push when magnitude >= 4.0 and the
  epicentre is within 100 km of the zone; once per event; an upward revision across 4.0 pushes
  then; a downward revision never retracts. Quiet hours do not hold M5+.
- Standing Guidance, pre-written for review before merge: during aftershocks (drop, cover, hold
  on), after shaking (gas, damaged buildings, call 14), and a coastal line shown only for
  offshore events M5+ ("strong shaking by the sea: move away from the shore"). It names no
  route, place or timing.

## Slice D (Tier 2): Observed weather and lightning

**METAR.** aviationweather.gov JSON, every 30 minutes; 26 Algerian airports reported in the
last 2 hours, all with visibility. Table `weather_observations` (station, time, temperature,
wind, gust, visibility, weather codes, raw). Map layer "Measured at airports" with age.
Dust or sand codes (DU, SA, SS, DS, BLSA) with visibility under 1,000 m are shown as
"Sandstorm measured at <airport>". Zone cards list it when the station is within 50 km. No
push: the policy keeps weather delivery on ONM authority.

**Lightning.** EUMETSAT's anonymous WMS layer `mtg_fd:li_afa` (Lightning Imager accumulated
flash area, 10-minute steps, about 5 minutes behind) as a map overlay toggle with its time
shown. No ingestion, no push. CSP gains `https://view.eumetsat.int` for images only.

## Glossary changes (CONTEXT.md)

- Official Incident: an authority-named event of any hazard, not only fire.
- Earthquake: an instrumental measurement (magnitude, epicentre, time) from a seismological
  network; Information, never "confirmed" damage.
- Measured Weather: an airport observation with its station and time; not a forecast.

## Order and delivery

A, then B, C, D; one PR each. Each slice ships its tests, pgTAP where the schema changes,
browser checks at 390 px in Arabic and English, and a database review for migrations.
Out of scope: H SAF rainfall, USGS fallback, tsunami feeds, deployed hardware.
