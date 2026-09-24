# Watch zones revamp — design

Date: 2026-09-24
Status: approved (first of the public-page revamps: zones → fire detail → report → forecast → settings/alerts → status/history/contribute)
Design authority: `2026-08-28-nadhir-ui-redesign-design.md`. Mobbin supplies structure only.

## Why

A zone is the gate to every alert, and adding one meant typing latitude and longitude into boxes prefilled
with `36.7 / 4.05`. The redesign spec's map picker never shipped. Delete had no confirmation, a zone could not
be edited after creation, and the level badge was white text on a solid hazard fill — the 1.63:1 defect the
redesign spec forbids.

## Design

- **List first.** One card per zone: name, commune, radius, `RiskChip` for the alert level, what it follows,
  and a live line ("2 fires, nearest 3.1 km"). Actions: Edit, Pause/Resume, Delete behind a confirmation.
  The offline pack stays on the card. Empty state: why a zone matters plus "Add your first zone".
- **Add a zone** opens the editor; disabled with the reason at 10 of 10.
- **Editor** (add and edit), full screen on phones, side panel on desktop. Map with a fixed centre pin that
  the user moves the map under (SmartThings pattern) and the radius circle drawn live (Too Good To Go
  pattern). Panel: commune search, "Use my location", radius 2–60 km, name prefilled from the nearest
  commune and editable, alert level as five level chips, fire and danger switches, Save.
- **Placement is deliberate.** The map opens on the user's position only if location permission is already
  granted; otherwise on northern Algeria. Save stays disabled until the pin was placed by search, location or
  moving the map, so no zone is saved on a default point.
- **No schema change.** Constraints and the `zones_limit` trigger already enforce the rules.
- `LocationPicker` is built for reuse by the report flow.

## Verification

Unit tests for the circle geometry and nearest-commune lookup; browser pass in `en` and `ar` at 1280 and
390 px (add, edit, pause, delete, limit); typecheck, tests, lint, build.
