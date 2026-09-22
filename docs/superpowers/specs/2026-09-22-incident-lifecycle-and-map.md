# Incident lifecycle, confidence and map

Approved in brainstorming on 2026-09-22. One model for how every incident becomes stale, how sure Nadhir is about it, and how the map shows both. Delivered as seven sub-projects (below), each with its own plan.

## Evidence (prod, 2026-09-22)

- The map showed 247 situations; 188 were ONM warnings while the live ONM feed held 74. ONM republishes its whole bulletin several times a day as new `Alert` messages without `references`; `onm.server.ts` only upserts, so replaced versions stay active until their own expiry (In-Salah: 12 rows, three identical morning copies).
- Fires end by silence alone (`fusion.server.ts` `stateFor`: 6 h → `contained_guess`, 24 h → `extinguished`) and `fire.$id.tsx` shows "Éteint" from that. Cloud or smoke cover produces the same silence.
- Authorities rarely announce ends: of 84 official incidents, 1 is `extinguished`, 2 `contained`, 77 `ongoing`.
- The inbox (`alerts.ts`) lists the latest 200 notifications with no link to the incident's current state; `observation_ended` follow-ups render like new alerts.
- Of 738 northern fires that reached Detected in 25 days, 15 coincide with a DGPC incident (coarse match: ~15 km, ±48 h). Most are likely real but harmless burns rather than absent fires; unverified.

## Decisions

1. **Expiry means "no longer verified", never "over".** When a lease lapses the incident fades silently; new evidence revives the same incident. Only an authority source can mark an incident ended. Satellite silence never produces an end state or wording. This follows CAP/IPAWS practice: expiry stops distribution without a public message, Update supersedes, and all-clear is a separate authority message.
2. **One live record per incident.** Every notification about an incident renders its current state, and a newer message replaces the older one on each surface where the channel allows it.
3. **Confidence is a single ladder shared by every hazard,** decided by who says so, not by the hazard.
4. **Only an authority gets red.** Nadhir's own evidence tops out at orange.
5. **Visual grammar:** icon = hazard type, color = confidence level, geometry = location precision, opacity/outline = freshness. Motion is reserved for one pulse on a live fire near the user.
6. **ONM warnings keep ONM's own vigilance colors,** drawn as area tints from their CAP polygon with a static texture per phenomenon (rain, storm, sand, wind, heat). Tints and markers never share a meaning.
7. **The LLM never decides an incident's state.** It may later act as the reviewer that proposes keep/deactivate with cited sources; code enforces the allowed transitions (sub-project 7).

## Lifecycle

| State | Condition | Map | Push / Survival Mode |
|---|---|---|---|
| Live | within lease | full weight | allowed per confidence |
| Fading | lease lapsed, no new evidence | dotted outline, "last seen 8 h ago", from wilaya zoom only | never |
| Archived | past the per-type cap | history only, "no news since …" | never |
| Ended | authority states it | history, "Ended · Protection civile, 09:10" | never |

A Fading incident returns to Live on new evidence, keeping its identity. Archived is terminal for satellite fires: fusion stops attaching detections to a cluster silent for 24 h, so later heat starts a new incident. Leases are computed by code; an authority-supplied expiry wins over the default. Internal DB states (`contained_guess`, `extinguished`) stay; the public phase is derived from timestamps in `src/lib/incident-lifecycle.ts`. A satellite fire is Ended only when an operator closed it (`resolved_at` set by `resolve_fire`; the fusion timer never sets it).

| Type | Source | Default lease | Revived / renewed by |
|---|---|---|---|
| Fire | satellite | 6 h | each new look |
| Fire | DGPC | 24 h after last mention | each new mention |
| Fire | citizen sighting | 3 h | corroboration |
| Weather | ONM | CAP `expires`, or replaced when absent from a successful non-empty feed fetch | next bulletin |
| Flood | ITA / citizen | 6 h | corroboration |
| Road | ITA / citizen | 2 h | new report on the same segment |

Archive: satellite 24 h, citizen reports 24 h, DGPC and ITA 72 h after the source. The civil agent's `expires_at` is capped at the lease in code: in prod, 20 of 27 road publications had received the 72 h maximum despite the prompt.

## Confidence ladder

| Level | Who says so | Color | Push |
|---|---|---|---|
| Official | Protection Civile, ONM, relayed authority | solid (red for fire; ONM uses its own scale) | yes |
| Corroborated | two independent kinds of evidence | orange | Zones and Subscriptions |
| Single source | one satellite look set, one citizen, one ITA post | grey | no |
| Model | FWI, CAMS smoke/dust | separate layer, off by default | no (opt-in Zone owners only) |

Fire promotion: satellite alone is a **Heat signal**; satellite plus forest land cover, extreme FWI or a citizen report is a **Probable fire**; a DGPC mention is **Confirmed**. Road: two independent reports make it Corroborated. Person trapped stays non-public under the SOS rule. Glossary changes (Heat signal replacing user-facing "Detected", Probable fire, Fading) land in `CONTEXT.md` with sub-project 3.

## Map

- A status line replaces mixed-type clusters: counts per type and level ("1 confirmed fire · 2 probable · 11 heat signals · ONM warnings in 9 wilayas"). Clustering, where kept, is per type.
- Heat signals and Fading items render from wilaya zoom only; they appear in counts at national zoom.
- ONM: current bulletin only; periods whose onset is in the future are hatched and labelled "from 03:00".
- Road incidents render as a 3–5 km segment with direction on the named road, snapped at publication from a static OSM extract of motorways and national roads. When snapping fails, a commune point labelled "location approximate".
- FWI danger and CAMS are layers, off by default, never styled like incidents.

## Sub-projects

| # | Scope | Rough size |
|---|---|---|
| 1 | ONM supersession: `superseded_at`, set for rows absent from a successful non-empty feed fetch; map, API and delivery exclude them | 1 h |
| 2 | Lifecycle core: lease/fade/archive/ended/revive for fires, DGPC, ITA, citizen reports; remove silence-derived "Éteint" and "Probablement maîtrisé" wording | 2–3 days |
| 3 | Confidence ladder and promotion rules, push eligibility, glossary update | 1–2 days |
| 4 | Map redesign: visual grammar, status line, ONM polygons with textures and ONM colors, zoom rules | 3–5 days |
| 5 | Road segments: OSM extract, agent extraction of road/place/direction, snapping, fallback | 2–3 days |
| 6 | Inbox and tray: one row per incident with live state; notification tag replacement on push | 1 day |
| 7 | Re-scoped, awaiting owner decision (see below) | — |

Order: 1, then 2 → 3 → 4, with 5 and 6 after 4. All 1,536 communes carry a `geom` in `admin_units` (wilayas none); ONM warnings carry their own polygon.

## Sub-project 7, re-scoped (2026-09-23)

After sub-projects 2 and 3, keep/extend is decided by structured evidence (new looks, new DGPC mentions, sightings) and an authority's end is already extracted by the DGPC pipeline (`status = extinguished`). A keep/deactivate reviewer would re-decide those less reliably, so it is not built.

The measured gap an LLM can close: of 85 DGPC incidents in 30 days, 26 are located only to a wilaya, and 12 of those coincide with an unconfirmed satellite fire in that wilaya (−24 h/+6 h). Code cannot match them, so the fire stays a heat signal (22 Sept: a straw-bale fire named "wilaya de Chlef" and the Boukadir cluster). Proposal: an LLM linker chooses among code-supplied candidates (same wilaya, time window) with a quoted reason; code allows it only to raise a heat signal to Probable (satellite + authority mention = two independent kinds of evidence), never to Confirmed or Ended. This lets an LLM enable a push, so it needs the owner's go.

## Open hypotheses (check before relying on them)

- Carto tiles expose Algerian road refs as "RN12"/"A1" in `transportation_name.ref`. Check: decode one tile around Naciria.
- Most satellite-only fires are agricultural or waste burns. Check: sample 20 against land cover.
- ~~The map labels future-onset ONM periods "Current".~~ Refuted: `useSituationLabels` already returns "upcoming" when onset is in the future.

## Known gaps

- Between midnight and the next risk publication, the map reads the published snapshot at horizon 0 while the push gate reads today's date through `publishedRiskTarget`, so a card can say "Feu probable" on danger alone for a fire the gate held back (or the reverse). Display only; the push decision is the server's.

## Out of scope

Protection Civile Telegram editing, new sources, and any change to the Instruction rule.

## Verification

Per sub-project: unit tests on lease and promotion rules (twice, out of order, after terminal, revive), database tests for supersession and transitions, and browser checks on the live map at national and wilaya zoom in all four languages. Sub-project 1 is verified by the ONM count on the map matching the live feed.
