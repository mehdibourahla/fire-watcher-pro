# Nadhir weather evidence and broader positioning

Approved scope, 15 September 2026. Implemented and locally verified; production release pending owner merge approval.

## Product identity

Keep the Nadhir / نذير name and current visual identity. Change the service description to:

- English: Local hazards and alerts for Algeria.
- French: Risques locaux et alertes en Algérie.
- Arabic: الأخطار المحلية والتنبيهات في الجزائر.

Mission: Help people in Algeria understand hazards near their chosen locations through weather forecasts, satellite observations and clearly attributed official warnings.

Avoid claims of government status, guaranteed delivery, real-time lightning detection or complete national emergency coverage.

## Weather evidence

Use Open-Meteo independently of ONM availability. The existing daily fire-weather integration cannot serve as the rain/thunderstorm assessment: its inputs are reduced for FWI and it does not request thunderstorm weather codes or precipitation probabilities.

Collect 48-hour weather snapshots at hourly resolution every six hours, tied to the existing administrative locations and source capture/archive machinery. The six-hour refresh limits upstream requests across all communes. Persist requested and returned grid coordinates, valid times, retrieval time, model-selection parameters, units, raw response, parser version and normalized values. Missing values remain unknown. Retain superseded runs for analysis; publish only complete validated snapshots per commune.

Inputs: precipitation, rain, showers, precipitation probability, WMO weather code, wind gusts and CAPE when available. Label total precipitation separately from liquid rain plus showers. Respect Open-Meteo's preceding-hour convention for precipitation and gusts. CAPE is supporting information, not proof of a thunderstorm.

First release provides forecast evidence and an attributed ONM comparison. It does not invent automatic danger thresholds. A model-derived broadcast policy needs replay/calibration against local incidents before activation. Model weather codes are forecasts, not lightning observations.

Keep official ONM warnings separate from model assessments. Match by geography and overlapping validity, and expose missing model coverage without suppressing the official warning. Group overlapping same-event/area bulletins with the latest prominent and earlier originals accessible; do not claim supersession without CAP reference lineage, which the current ingestion does not retain. Full CAP update/cancellation reconciliation is a separate ingestion change. Do not infer that a quiet grid point disproves a wilaya-wide warning.

Live feasibility probe: Djelfa and Algiers both returned 48 hourly values for all requested inputs. Evidence: /tmp/nadhir-openmeteo-rain-probe.json. This proves API availability at those points, not nationwide coverage or forecast accuracy.

## Citizen experience and text inventory

Update platform-level identity consistently across header/footer, default metadata and social previews, PWA manifest, About/mission/source descriptions, contribution introduction, authentication/subscription descriptions, privacy/terms service descriptions, and any matching email or OAuth branding text. Translate enabled English, French and Arabic surfaces; preserve the existing disabled-language fallback policy.

Organize forecasts into weather and fire-danger sections. Weather shows selected location, source, forecast validity, retrieval time, precipitation amount/probability, predicted storm conditions and related official warnings. An unavailable or stale model shows an explicit state rather than zero danger. Location selection must work without an ONM warning or a fire forecast.

Keep fire-specific labels for fire details, satellite fire layers, fire history and the Fire Weather Index. Only broaden the map title when weather layers are actually visible. Do not rename fire-only report forms to imply they accept every hazard.

Survival Mode remains explicitly fire-specific until hazard-appropriate, reviewed standing guidance exists. In particular, its low-ground guidance must never appear as flooding advice. Remove misleading confirmation language: satellite evidence is detected information; confirmation requires an official source.

## Verification and release

- Backend: real upstream fixture, hourly/timezone/unit handling, nullable values, stale snapshots, incomplete batches and overlapping warning versions.
- Behavior: model evidence available without ONM; official warning retained during model outage/disagreement; no new Telegram eligibility or unsolicited broadcasts.
- UI: location selection, populated/loading/error/empty states, phone widths, Arabic RTL, titles/social metadata and installation description.
- Persistence: raw and normalized weather evidence remain available for later analysis with timestamps and provenance.
- Review: evaluate weather semantics and safety copy independently before release. Merge remains a separate owner action.

References: https://open-meteo.com/en/docs ; src/lib/ingest/weather.server.ts ; src/routes/forecast.tsx ; src/i18n/locales/{en,fr,ar,kab}.ts ; public/site.webmanifest ; CONTEXT.md.
