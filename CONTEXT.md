# Nadhir

Wildfire early-warning service for Algeria. Arabic-first, open source (AGPL-3.0).
This glossary is the project's canonical language; code and UI copy follow it.

## Language

### Voice

**Information**:
A fact Nadhir states in its own voice: an observation with its timestamp and source, or
model output labelled as such. Nadhir may always publish Information, at honest freshness.
_Avoid_: alert (overloaded), advice

**Instruction**:
A directive telling a person what to do — evacuate, shelter, take a route. Only an
authority (e.g. Protection Civile) originates an Instruction; Nadhir relays it, verified
and timestamped, never generates one. Hard invariant, no exceptions in any mode.
_Avoid_: recommendation, guidance (see Standing Guidance)

### Modes

**Survival Mode**:
The app state for a person in immediate danger: one primary card, minimal chrome. Entered
by user self-activation (always available), a Detected or Confirmed Fire near the user's
zone, or a relayed official declaration — never by the FWI danger level. Must be fully useful
with zero fresh data: no screen in it may assume a recent observation exists.
_Avoid_: emergency mode, Guardian (internal/docs name for the survival layer — never
user-facing; the app transforms without introducing a second brand)

### Fires

**Detection**:
One satellite pixel flagged as burning by one sensor at one instant, with the sensor's own
confidence and fire radiative power. A Detection is raw evidence, never shown as a fire.
_Avoid_: hotspot (user-facing), fire (for a single pixel)

**Fire**:
A group of Detections that fusion judges to be one event in space and time. A Fire has a
lifecycle: Candidate (one look only), Detected, then quiet and extinguished; and it may be
Confirmed at any point in that lifecycle. A Fire is Nadhir's own object and is always
Information.
_Avoid_: cluster (user-facing), incident (reserved for the authority's object)

**Candidate**:
A Fire seen by a single look — one slot of a staring sensor or one pass of a polar one. Shown on
the map with its age; never pushed.
_Avoid_: unconfirmed (now means "not Confirmed", which is most fires)

**Detected**:
A Fire whose satellite evidence crosses the publication bar with at least two independent
looks: two slots, two sensors, or a sensor plus a citizen Hazard Report. A Detected Fire may
be pushed as a Broadcast Alert in Nadhir's voice, worded as satellite Information ("fire
detected by satellite"), never as "confirmed".
_Avoid_: confirmed (reserved for authorities), active (internal state word)

**Confirmed**:
A Fire, or an Official Incident with no Fire, that an official source has announced — today the
Protection Civile bulletin naming the commune. Confirmation carries the authority's wording,
timestamp and status, and is the only path to the word "confirmed" in any language. Nadhir never
confirms a fire on its own evidence, however strong.
_Avoid_: fusion-confirmed, satellite-confirmed

**Official Incident**:
The authority's own object: a fire named in an official source, resolved to a commune, with the
authority's status vocabulary and timestamp. It exists whether or not a Fire matches it, and
matching one to a Fire confirms the Fire without merging the two.
_Avoid_: report (reserved for citizens), cluster

### Alerting

**Broadcast Alert**:
Nadhir-originated Information about a fire or danger condition, pushed to every
subscriber of an area across all wired channels. Carries Nadhir's own voice and
timestamps; never an Instruction. Authority warnings (e.g. ONM vigilance) are
relayed verbatim alongside, clearly attributed, never merged into Nadhir's text.
"AMBER" is the epic's internal codename only — never user-facing, same rule as
Guardian.
_Avoid_: AMBER (user-facing), emergency broadcast (implies state authority)

**Subscription**:
An accountless registration to receive Broadcast Alerts for chosen communes —
a push registration plus an area, no email and no identity. Commune-scoped and
push-only; joining a wilaya Telegram channel is coarser channel membership,
not a Subscription.
Distinct from a Zone, which belongs to an authenticated user and carries
personal rules (radius, quiet hours, thresholds). A Subscription has no owner
to notify about anything else and must never accrete personal data.
_Avoid_: anonymous zone, device registration

### Reporting

**Hazard Report**:
A one-tap citizen report of danger — fire here, heavy smoke, road blocked, person
trapped. Displays publicly unmoderated, labelled with source and age; moderation can
promote or remove. "Person trapped" inherits the SOS honesty rule: recorded, not
monitored, call 14.

**All-Clear Report**:
A one-tap citizen report of clearance — road passable, refuge reached. Collected but
never publicly displayed without moderator or authority confirmation: a false all-clear
kills, a false hazard only detours. The display asymmetry is deliberate and permanent.
_Avoid_: showing any unmoderated clearance state

### Places

**Open Area**:
A map fact from OSM — stadium, schoolyard, paved clearing — shown with distance and
direction as Information. Never labelled safe, never routed to, never given a freshness
or suitability claim; Standing Guidance teaches the suitability criteria instead.
_Avoid_: safe zone, safe area

**Refuge**:
A location an authority has designated for shelter, relayed as an Instruction with its
timestamp. The set is empty until a Protection Civile relationship exists; Nadhir never
promotes an Open Area to a Refuge on its own.
_Avoid_: evacuation center (unless the authority's own wording), shelter (generic)

**Survival Pack**:
The offline bundle cached on-device before any fire: the user's commune map tiles, Open
Areas, Standing Guidance in all four languages, emergency numbers, and last-known
observations with their age. Fetched when a zone is set, refreshed opportunistically —
never fetched at Survival Mode entry, because by then the network may be gone.
_Avoid_: offline cache (generic), emergency data

### Distress

**Check-In**:
A timestamped self-report ("reported safe at 20:48 near X") sent to the user's own
contacts via device-native SMS/WhatsApp compose; the opposite state is "needs
assistance". A Check-In records that a person tapped a button, nothing more — the bare
word "safe" is banned as a status label everywhere in the UI.
_Avoid_: safe (as a label), mark safe, safety status

**SOS**:
The one-button distress action in Survival Mode: dials Protection Civile 14 and shows the
Position Card. A failed attempt is saved on the device only, labelled "not sent"; nothing
transmits it and no rescue service receives or monitors it — the UI says so and tells the
user to keep calling 14. No "request received" acknowledgment may ever appear without a
staffed receiving end.
_Avoid_: emergency request, help request

**Position Card**:
The user's location rendered for a human operator: commune, nearest settlement with
distance and direction, then raw coordinates — readable aloud over a call to 14.
_Avoid_: GPS display, coordinates view

**Standing Guidance**:
Pre-approved, pre-authored safety text (e.g. "call 14, prepare documents, do not drive
toward smoke") shown when no Instruction exists. Written and reviewed ahead of time —
never composed at runtime, never by an LLM.
_Avoid_: tips, suggestions
