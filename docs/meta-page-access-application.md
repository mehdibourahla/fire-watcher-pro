# Meta Page Public Content Access — application draft

Every remaining official wildfire source in Algeria publishes on Facebook and nowhere else.
One approval covers all of them, so this is a single application, not one per page.

Submit at developers.facebook.com → your app → App Review → Permissions and Features →
Page Public Content Access. Requires a Business verification and a screencast.

## Pages this unblocks

| Page                                       | Authority                 | What it publishes                                   |
| ------------------------------------------ | ------------------------- | --------------------------------------------------- |
| Info Trafic Algérie (`Infotraficalgerie1`) | private, road information | closures, updated through the day                   |
| Tariki (Gendarmerie nationale)             | national police           | road status, updated every 15 minutes               |
| Protection Civile (`DGPCDZ`)               | national civil protection | the same bulletins as its Telegram channel          |
| `DGPC00xx` per wilaya                      | wilaya civil protection   | the finest-grained official fire status that exists |

The wilaya pages are out of scope for ingestion under the project's national-only rule, but
the approval is not per page, so they are listed for completeness.

## Use-case statement (paste into the review form)

Nadhir is a free, open-source wildfire early-warning service for Algeria, published at
https://nadhir.app under AGPL-3.0. It ingests satellite hotspot detections and official fire
bulletins, groups them into probable fires, and notifies people who subscribe to a commune.
It is not a government service and states so on every surface.

We request Page Public Content Access to read the public posts of Algerian civil-protection
and road-safety Pages. Two specific needs:

1. **Fire status the satellites cannot see.** A study of the Protection Civile bulletins for
   August 2026 found that on 28 August, 7 of the 42 communes the authority named as burning
   had no satellite detection at all, and one was named three days before the first detection.
   Reading the official Pages is the only way to show those fires.
2. **Road closures during an evacuation.** During the fires of 26–28 August 2026, which killed
   at least twelve people, the Gendarmerie's Tariki Page was the authoritative source for the
   national roads closed by fire — RN43 at El Ancer, RN9 at Kherrata. Several of the deaths
   happened on roads. Our published architecture decision refuses to show any evacuation
   routing until live road status from an authority exists; this Page is that source.

We read only public posts from a fixed list of Pages belonging to public authorities and
public-interest road-information services. We do not read comments, user profiles, private
groups, or any personal data. Post text is stored verbatim with its source and timestamp,
attributed to the Page on every screen where it appears, and shown alongside a link to the
original post. We publish no derived claim in the authority's voice.

Data volume is small: a poll every fifteen minutes per Page, a few dozen posts a day at the
peak of a fire season.

## Screencast script (two minutes)

1. Open https://nadhir.app and show the live map with satellite detections and the commune
   polygons of official incidents.
2. Open a fire and show the evidence panel: one line per sensor, and the authority's quoted
   sentence with its own timestamp and a link to the original post.
3. Show the same relay arriving as a notification, with the source named in the text.
4. Show https://nadhir.app/status: every source with its freshness, and the recall metric
   comparing official reports against satellite detections.
5. State on camera that Nadhir reads only public posts of public authorities and stores no
   personal data.

## Supporting URLs for the form

- Service: https://nadhir.app
- Privacy policy: https://nadhir.app/privacy
- Terms: https://nadhir.app/terms
- Source code: https://github.com/mehdibourahla/fire-watcher-pro
- Data and method: https://nadhir.app/about

## If the application is refused

The alternatives, both already assessed and both worse: a scraper against the public Page
HTML, which breaks on every layout change and sits outside Meta's terms; or asking each
authority directly for a Telegram channel or an RSS surface. Info Trafic Algérie already ran
two Telegram channels and abandoned both, so a direct request to revive one is cheap to make
and may be faster than this review.
