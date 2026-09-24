# Multi-hazard watch zones — design

Date: 2026-09-24
Status: approved 2026-09-24
Decisions taken by the project owner: zone engine + device push; per-user FCM topic; road incidents notify at
commune and wilaya level; every zone follows all hazards by default, each switchable.

## Why

Nadhir covers fire, weather, road and other hazards, but a watch zone produces only `fire` and `risk` (fire
danger) alerts (`alerts-engine.server.ts:399`, `:565`; `alerts.kind` CHECK allows only those two). ONM, DGPC and
relayed authority warnings reach people only through anonymous commune push; road publications (41 last week)
reach nobody. And zone alerts never reach a closed phone: they surface in-app, as a browser `Notification` while
a tab is open (`AlertNotifier.tsx:74`), or by webhook.

## Hazards a zone follows

| Kind       | Source                                                                      | Zone matches when                                                                                                                | Wording rule                                                                                                                        |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `fire`     | `fire_clusters`                                                             | a detection lies within the radius (unchanged)                                                                                   | unchanged; candidates never pushed (CONTEXT :76)                                                                                    |
| `risk`     | `risk_forecasts`                                                            | `zone.commune_id` (unchanged)                                                                                                    | unchanged                                                                                                                           |
| `weather`  | `onm_vigilance`                                                             | warning polygon intersects the zone circle; fallback: zone commune's wilaya = `wilaya_id`                                        | ONM text relayed verbatim with attribution, never merged into Nadhir text (:121–124); expiry is not an all-clear (:44–47)           |
| `official` | `official_incidents`, `authority_warnings`                                  | zone commune = incident commune, else zone wilaya = incident wilaya; authority: zone commune code ∈ `commune_codes`, else wilaya | attributed to the authority; "confirmed" only from authority evidence (:108); Nadhir never originates an Instruction (:37–40)       |
| `road`     | `civil_publications` with `hazard = 'road'`, `state` published, not expired | `area_id` = zone commune, or `area_id` = the zone commune's wilaya                                                               | worded as Nadhir Information from a reviewed publication; review does not confer authority; withdrawal is not an all-clear (:33–35) |

The road row is the explicit eligibility rule CONTEXT :34 requires before a publication may notify anyone.

Citizen hazard reports stay out: they are unmoderated and the display asymmetry is deliberate (:141–150).

## Data

- `zones`: add `notify_weather`, `notify_official`, `notify_road` (boolean, default true); backfill true.
- `alerts.kind` CHECK widens to `fire, risk, weather, official, road`; `alerts` gains `source_table` and `source_id`
  so a non-fire alert points at its origin. Dedupe keys: `<kind>:<zone>:<source_id>` (one alert per zone per
  hazard item; a revised ONM or publication version gets a new id and so a new alert).
- Existing `quiet_hours` apply. Break-through: fire inside the zone (unchanged), `weather` at ONM red, and
  `official` items — the settings copy promises this for extreme danger, and official warnings are life-safety.

## Delivery

- **Push**: per-user FCM topic `v1.user.<user_id>`. On sign-in each device with notification permission joins it;
  on sign-out it leaves. The server sends each new zone alert to the topic after quiet-hours filtering. No
  device-token table (consistent with ADR 0004). The notification `tag` is the hazard item id, so a device that
  also holds an anonymous commune Subscription shows one notification for the same hazard, not two.
- In-app list, open-tab notification and webhooks carry every kind. Webhook consumers receive new `kind` values:
  documented in the public API docs as an additive change.
- CAP events stay limited to what Nadhir itself asserts (fire); relayed ONM and authority items are not re-issued
  as Nadhir CAP alerts.

## UI

- Zone editor and card: per-hazard switches (fire, fire danger, weather, official, road) replace the two current
  ones; the card's "Follows" line lists them.
- Alerts inbox: rows for the new kinds with source attribution and a link to the map item.
- Settings: a "Push on this device" control (join/leave the user topic) with honest state when permission is
  denied or push is unsupported.

## Phases

1. Schema + tests: zone switches, alerts kind/source columns, backfill.
2. Engine: weather, official, road matching, dedupe, quiet hours, wording rules; unit tests per kind.
3. Push: user topic join/leave, server send, tag collapse; verify FCM server credentials in prod first.
4. UI: zone switches, inbox rows, settings push control; four languages.
5. Verification: replay last week's prod hazards against current zones (counts per kind, no double sends), browser
   pass in en/ar.

## Out of scope

Citizen hazard reports as alerts; email delivery; settlement names in broadcast text (tracked separately).
