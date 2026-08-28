# Nadhir UI/UX redesign — design

Date: 2026-08-28
Status: approved
Supersedes: the presentation layer described in ORIGINAL-SPEC §12

## Mandate

Rebuild the entire presentation layer across all routes. The spec's information
architecture, danger-level semantics, four-language RTL requirement and
emergency-numbers block remain binding. Palette, typography and layout language
are re-derived.

Two decisions were taken by the project owner and override ORIGINAL-SPEC:

1. The palette is redesigned rather than inherited from §12.1.
2. The semicircular Danger Dial named in §12.1 as the signature element is
   **replaced** by a horizontal gradient scale (`DangerScale`). It reads more
   clearly at the small sizes the spec's primary persona uses.

Three blocking data defects are fixed as part of this work so screens render real
data. Everything else from the conformance audit is out of scope.

## Why the current UI fails

Measured, not asserted:

- Danger levels 1–3 render at 1.63–2.49:1 contrast on the paper background.
  `--risk-2 #F2C14E` at 1.63:1 is the worst. The scale is least legible exactly
  where it carries the most meaning.
- The brand colour `--cedar #2F5D50` is a desaturated green adjacent to
  `--risk-1 #7FB069`. Chrome and hazard compete for the same signal.
- Every screen is a vertical stack of identical `.panel` boxes. The map is a grid
  cell rather than the ground layer, contradicting §12.3's "the map is the
  homepage, not a hero page".
- Absent entirely: layer toggle (§12.3), cluster bottom sheet, mobile bottom tab
  bar (§12.2), skeletons and empty/error/offline states (§12.9).

## Colour system

### Hazard ramp

The spec's hues were **rejected**: kept alongside the new neutral chrome they
produced a muddy pink-beige cast, and `#6B0F1A` reads as dried blood rather than
fire. The ramp is re-derived in OKLCH at higher chroma with a wider hue spread.

| Level | Key | Solid (light) | Solid (dark) |
|---|---|---|---|
| 1 | `risk.low` | `#30AD51` | `#46C865` |
| 2 | `risk.moderate` | `#E4AF00` | `#F7CE21` |
| 3 | `risk.high` | `#F16A00` | `#FF8A2B` |
| 4 | `risk.very_high` | `#D40924` | `#EE3B3B` |
| 5 | `risk.extreme` | `#8C1220` | `#9C1F35` |

Validator results, per theme:

- Light — normal-vision separation **PASS** (ΔE 15.2); CVD **WARN** (7.3, in the
  6–8 band); contrast WARN on levels 1–2.
- Dark — CVD **PASS** (8.5) and normal-vision **PASS** (15.9); contrast WARN on
  level 5.

The `lightness band` check is reported as FAIL by the validator and does not
apply here: its scope is categorical palettes, where all slots should share a
lightness. An ordered severity ramp is meant to run light to dark. The WARNs are
discharged by the numeral + icon + label that every level carries by mandate.

Rendered as a **continuous gradient track with a marker at the current level**,
not five discrete segments — discrete steps at low opacity read as candy-striping.
The gradient direction flips under RTL via `[dir="rtl"] .danger-track`.

Application rules — these are the fix:

- **Solids** are for marks ≥8px only: map markers, scale fill, bar fills, dots.
- **Chips and badges** use a tint background with same-hue dark ink. Never white
  text on a solid hazard fill; that is what produced 1.63:1.
- Dark mode uses its own steps above, validated against the dark surface. Never
  an inversion of the light steps.
- Every appearance of a level carries **numeral + name + icon**. Required by §15,
  and it is the secondary encoding that legitimises the orange↔red pair sitting
  in the 8–15 ΔE band. A level must never be communicated by colour alone.

### Chrome

Near-achromatic with a faint cool bias so the hazard ramp owns every saturated
colour on screen. A first attempt used warm limestone neutrals; combined with the
hazard tints they produced a beige cast and were rejected.

| Token | Light | Dark |
|---|---|---|
| `--ground` | `#F9FAFB` | `#0B0D10` |
| `--surface` | `#FFFFFF` | `#16191C` |
| `--raised` | `#EEF0F3` | `#212428` |
| `--border` | `#DBDEE2` | `#2F3338` |
| `--ink` | `#161B20` | `#ECEFF1` |
| `--ink-soft` | `#5F6469` | `#A1A5A9` |
| `--ink-faint` | `#8C9094` | `#777B7F` |
| `--accent` | `#2171CC` | `#63B3FF` |

The accent clears AA as text (4.67:1 light, 8.73:1 dark) and sits provably outside
the fire family, unlike the old cedar which was adjacent to `risk-1` green.

Chip tint/ink pairs are computed against these surfaces and land between 8.7:1 and
14.7:1 — the fix for the 1.63:1 legibility defect.

Status colours (`--emergency`) stay distinct from the hazard ramp and are never
reused as a hazard level.

## Typography

- Display: Fraunces (retained, already loaded) — page titles and hero numerals only.
- Body: Inter.
- Arabic: IBM Plex Sans Arabic for both body and display when `lang="ar"`.
- Tabular numerals wherever digits align: tables, timelines, distances, FWI values.
- Western Arabic numerals (0–9) in all locales, per §15.

## Layout language

Replaces the flat panel stack.

- **Basemap** — CARTO vector tiles (Positron light / Dark Matter dark), keyless
  and MapLibre-native, switched by the `.dark` class so the map never desyncs from
  the chrome. Raster OSM tiles were the source of the dated look.
- **Place naming** — a cluster is never labelled with its `short_id`. `placeLabel`
  resolves commune → nearest settlement → nearest commune (marked "near") →
  coordinates. The code appears only as a small reference on the detail page.
- **List paging** — the live-map rail caps at 20 clusters with a "show all" toggle;
  an unbounded list made the page scroll forever.
- **Ground/sheet** — the map is a full-bleed ground layer. Content rides in a
  draggable bottom sheet on mobile and a fixed left rail on desktop.
- **Card grid** — stat cards of differing weight replace undifferentiated panels.
- **Segmented scale** — the `DangerScale` primitive: gradient track, marker at the
  current level, numeral, level name, and the plain-language `risk.guidance.{level}`
  sentence. Guidance appears *above* supporting detail, following civil-warning
  convention.
- Mobile web gets a bottom tab bar mirroring the native app (§12.2).

## Components

New or rebuilt primitives, each independently testable:

| Component | Responsibility |
|---|---|
| `DangerScale` | Level 1–5 as gradient track + marker + numeral + name + guidance. Replaces `DangerDial`. Sizes: sm, md, lg. |
| `RiskChip` | Tint + same-hue ink badge with icon. The only way a level appears inline. |
| `MapGround` | Full-bleed MapLibre layer, layer-toggle control, marker styling by state and confidence. |
| `DetailSheet` | Draggable sheet (mobile) / rail (desktop). Holds cluster detail. |
| `DetectionStrip` | Dot strip of detections over time, keyed by source, with legend. |
| `StatCard` | Label + value + optional delta and sparkline. Tabular numerals. |
| `SourceHealth` | Per-source status row: state, age, note. Honest degradation. |
| `EmptyState` / `Skeleton` / `ErrorState` | The §12.9 quality floor, applied on every route. |

## Route changes

| Route | Change |
|---|---|
| `/` | Map as ground. Layer toggle. Cluster sheet leading with a status sentence, then detection strip, wind vector, nearest settlements. Empty state shows today's level plus a prevention tip. |
| `/forecast` | Commune search, `DangerScale` per day across d0–d5, FWI value, guidance sentence first. |
| `/fire/:id` | Detection timeline, spread bearing, nearest-settlement table, share and report CTAs. |
| `/history` | Recharts (already a dependency, unused) for monthly distribution and cumulative area. Gets its own unbounded, paginated query — fixes the 72-hour window defect. |
| `/status` | Reports FCI and EFFIS as unavailable rather than healthy. |
| `/alerts` | Feed with unread state, severity stripe, link to the fire. |
| `/zones` | Map picker, radius slider, per-zone channel toggles. |
| `/settings` | Channel toggles, quiet hours, language, minimum danger level. Bound to the columns that exist today (`min_danger_level`); the spec's `min_confidence` needs a migration and stays in the audit backlog. |
| `/report` | Three-step flow: location, photo and note, confirm. |
| `/moderation`, `/team` | Dense desktop-first tables, LTR layout with localised strings (§12.8). |
| `/about`, `/developers`, `/terms`, `/privacy` | Same system. `/about` drops the EFFIS attribution until that source is actually contacted. |

## Data fixes in scope

Three constraint literals and the discarded write errors that hid them:

1. `weather.server.ts` — `SOURCE` `"openmeteo-fwi"` → `'local_fwi'`.
2. `eumetsat.server.ts` — `source: "eumetsat"` → `'fci'`.
3. `fusion.server.ts` — `stateFor` returns `"resolved"` → `'extinguished'`.
4. Make the four discarded upsert errors and the cluster-update error throw, so a
   failed write surfaces instead of being reported as healthy.

Out of scope, deferred to the audit backlog: FWI state persistence, alert rules
R2/R3/R5, the geo seed, EXIF handling, rate limiting, admin console.

## Accessibility floor

Applies to every screen, per §12.9 and §15:

- WCAG 2.1 AA contrast on all text.
- No colour-only encoding anywhere; level always carries numeral, name and icon.
- Keyboard navigable with a visible focus ring on every interactive element.
- Screen-reader landmarks; the map has a text-equivalent list.
- RTL mirrored layouts verified in Arabic on every route, including sheet
  direction and scale marker direction.
- `prefers-reduced-motion` disables the fire pulse and sheet animation.

## Verification

- Typecheck and lint clean.
- Every route rendered in the browser at mobile and desktop widths.
- One full pass in `ar` confirming RTL mirroring.
- Both themes checked against the token set, including the un-stamped
  `prefers-color-scheme` state.
- Palette re-validated with the dataviz validator after any colour change.
