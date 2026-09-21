# Official multi-hazard notification policy

## Purpose

Relay actionable official warnings to affected subscribers without turning every collected
report into a notification. Collection and recovery are automatic; source authority,
meaning, validity and channel eligibility remain separate decisions.

## Source and channel rules

| Source | Information surface | Automatic push | Public Telegram |
| --- | --- | --- | --- |
| Registered DGPC fire incidents | Map and source-linked detail | Existing fresh, located official-fire rules | Existing DGPC-only relay |
| ONM structured warnings | Official warning and weather detail | Severe/Extreme, resolved wilaya, valid warning | No |
| DGPC non-fire social posts | Retained evidence; reviewed publication requires a supported workflow | Not enabled until the warning adapter meets the contract below | Not enabled merely because the source is DGPC |
| Operator-entered authority warnings | Existing reviewed authority notice | Existing restricted operator workflow; not an automatic source adapter | No |
| Reviewed ITA publications | Map/API, explicitly attributed media information | No | No |
| Open-Meteo forecasts | Forecast evidence alongside official warnings | No model-derived emergency trigger | No |
| Satellite fire observations | Existing evidence-qualified fire information | Existing fire publication policy | No |

An ITA post quoting an authority remains ITA evidence. A display label, CAP document or
operator publication does not itself establish an official source. Unknown source/hazard
combinations require review and an explicitly onboarded adapter before automatic delivery.
Private operational watchdog messages are outside citizen alerting.

## Contract for new official hazards

- Preserve the registered origin, source URL/identifier, source text and issue time. Extract
  meaning with the LLM where needed; reject unsupported evidence rather than inventing facts.
- Represent hazard, authority-declared severity/urgency/certainty, affected area, onset and
  expiry. A retrospective casualty report is not proof of a continuing threat. Missing or
  ambiguous authority, geography, severity or lifecycle goes to review.
- Preserve the authority's instructions and attribution. Nadhir must not generate evacuation,
  shelter or routing instructions, or infer an all-clear from expiry or silence.
- Match only the stated area. ONM targeting is currently wilaya-wide; a forecast grid point
  does not narrow or contradict that official footprint.
- Automatically deliver structured Severe/Extreme warnings only through approved channels.
  Ambiguous social posts require review. Moderate/Minor information belongs on the map unless
  a later, explicit hazard-specific policy authorizes delivery.
- Use a stable source identity and revision chain. Identical reissues are silent; escalation,
  changed affected areas and material authority instructions can justify updates. Corrections
  and cancellations reference the earlier warning and invalidate its pending deliveries.
- Recheck validity and channel eligibility at publication and delivery. Preserve independent
  queues, destination receipts, retry budgets, pauses and the global kill switch.

Rain and thunderstorms retain ONM authority plus independently collected Open-Meteo context.
Forecast disagreement or unavailable model data does not cancel an official warning. Weather
codes and CAPE are supporting evidence, not observations of lightning or new trigger thresholds.

## Enforcement in this release

ONM publication rejects expired, invalid and future-issued warnings. Advance warnings whose
onset is later remain eligible. If ONM omits expiry, the existing bounded fallback is 24 hours
after onset, or issue time when onset is absent. This is an internal delivery deadline, not
an authority-declared expiry or all-clear. Identical rules bound queued ONM deliveries; an
earlier source expiry shortens pending/leased work, including retries. Existing receipt and
retry history remains intact, and extending validity cannot reopen an old delivery window.

## Explicit remaining onboarding work

The current ONM adapter does not preserve CAP message type/reference cancellation chains.
The existing operator-entry model lacks source issue time, explicit expiry, hazard and
revision identity. DGPC's current incident model is fire-specific. These adapters must be
extended and tested against real source messages before claiming complete multi-hazard
initial/update/cancel delivery. This policy does not silently enable those missing paths.

Acceptance for each new adapter includes source provenance, ambiguous/expired input,
duplicate reissues, escalation, area changes, cancellation before and during retry,
missing model evidence, unauthorized publication and zero ITA/model-weather public sends.
