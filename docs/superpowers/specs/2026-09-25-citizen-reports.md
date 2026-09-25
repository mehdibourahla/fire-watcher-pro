# Citizen reports: any hazard, LLM-gated, witnessed, rewarded

Date: 2026-09-25. Status: decided with the owner in chat ("yes, hybrid, LLM centered"; witnesses; "gamify it,
if it's not well made no one will ever use it"; mobile first).

Design Read: emergency reporting flow for residents of Algeria on a phone, often outdoors and stressed, in four
languages (RTL), in the 2026-08-28 direction, dial ENERGY 2 / RHYTHM 2 / MOTION 1. The antislop filter applies.
Structure borrowed from Waze reporting (one button on the map, tile grid, one-tap confirm) and Local Guides
progression (points, levels, next badge); the look stays Nadhir's.

## Why

`/report` is a long form titled "Report a fire" with raw latitude and longitude boxes. Its copy says moderators
review every report first, while `hazard_reports` publishes pending reports at once. "Person trapped" shows on the
public map with no SOS treatment. Nothing lets a second person confirm what they see, and nothing makes reporting
worth the effort. Prod holds 0 reports, so the model can change without migrating user data.

## Hazards

One-tap tiles: Fire or smoke, Flooding, Storm damage, Road blocked, Earthquake damage, Person trapped, Something
else. The LLM classifies into the full list: fire, flooding, storm_damage, road_blocked, earthquake, person_trapped,
sandstorm, landslide, snow_ice, structural, hazmat, other.

## Publication (LLM centered)

- A tile report with no text publishes at once as its category (nothing to screen: a category and a point).
- A report with text goes to the classifier (OpenRouter, the existing gemini-2.5-flash client, JSON schema). It
  returns `publishable`, `hazard`, a neutral `summary` of at most 160 characters in the report's language, and
  `severity`. Publishable reports publish the summary, never the raw text. Held reports wait for a moderator.
- Deterministic guards outside the model: the summary is dropped if it holds a phone number, an email or a URL;
  the 3-per-24-hours report limit stays and counts deleted reports too; person trapped is never public, never gamified, and shows call 14.
- If the classifier is down, a tile report with text publishes as its bare category; "Something else" waits and
  is retried by the alerts engine run.
- Public view `hazard_reports` shows only published, unrejected, unexpired reports, without reporter, raw note or
  photo, and never person trapped.

## Witnesses

- "I see it too" and "It's gone" on a report's map card, signed in, once per person, from within 5 km (the
  glossary's sighting radius), not on your own report, 30 votes per hour.
- Each "I see it too" keeps the report alive at least 3 more hours (a report lives 6 hours, 24 at most).
- "It's gone" never hides a report and is never shown publicly (a false all-clear kills). Three more "gone" than
  "seen" votes flag it for moderation and stop further extensions.
- A report with at least one other witness is corroborated. Only corroborated reports push.

## Alerts

New zone switch "Citizen reports" (on by default) and alert kind `citizen`. A zone is alerted once per person
about a corroborated, published report inside its radius. Push copy names it a citizen report confirmed by N
people, not verified by authorities.

## Rewards

Points only for what others confirm, never for sending: 10 when your report is corroborated, 3 for each witness
vote you give once a second independent witness agrees. Levels: Observer (0), Witness (30), Guardian (100), Sentinel
(300). Badges: first corroborated report, five confirmations given, three different hazards reported, a report
that alerted people. Impact shown as real counts: witnesses on your reports and people alerted by them. No
leaderboard. Nothing celebratory on person trapped.

## Flow (mobile first)

1. A report button on the live map (bottom corner, thumb reach) and the existing links open `/report`.
2. "What do you see?": seven large tiles. Person trapped opens the SOS screen (call 14 first, then record).
3. "Where?": the zones map picker with the centre pin, starting from the phone's position.
4. "Anything to add?": optional note (required for Something else) and photo, one Send button.
5. Sent: honest state (published, checking, saved), how witnesses work, points you can earn, progress bar.
6. `/report` home: level card, badges, my reports with their state and witness count.

## Also fixed

The reporter update policy that allowed editing moderation columns is dropped (no client uses it). The false
"moderators review first" copy goes. Operators can read reports but not moderate them; unchanged here.

## Glossary

Hazard Report gains the hazard list and LLM publication; new terms Witness and Corroborated.
