# History page: every hazard Nadhir recorded

Date: 2026-09-25. Status: decided under the owner's full-ownership loop ("until fully implemented"), following
the direction he approved in chat: "a record of past hazards with a hazard filter; fire keeps its burned-area
stats; each hazard says when its records start".

Design Read: public archive for residents, journalists and researchers in Algeria (four languages, RTL), in the
2026-08-28 redesign direction, dial ENERGY 1 / RHYTHM 2 / MOTION 1. The antislop filter applies.

## Why

`/history` reads only `fire_clusters`: fire counts, burned area, a fire CSV. Nadhir also records ONM weather
warnings and road incidents. The page's job: what happened, where, and how often, for any hazard.

## Data (prod, 2026-09-25)

| Hazard  | Source                                           | Records since | Unit counted                                                                                                                                                                                                             |
| ------- | ------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fire    | `fire_clusters`, real states only                | 2026-08-28    | one detected fire                                                                                                                                                                                                        |
| Weather | new view `onm_warning_history`                   | 2026-08-30    | one ONM warning episode per wilaya: 10,093 rows are 2,202 episodes, because ONM renews a live warning with a later onset and overlapping windows are one warning (the first count, ~510, read only the first 1,000 rows) |
| Road    | `civil_publications`, hazard road, not withdrawn | 2026-09-21    | one published incident                                                                                                                                                                                                   |

Official Civil Protection reports (`official_incidents`, 87, all fire kinds) are shown as a fire statistic, not a
separate hazard, so a fire is never counted twice. Authority warnings and citizen hazard reports have no rows.

The view uses `security_invoker`, so it can never read more than `onm_vigilance`'s own public policy allows.

## Layout

1. Title and filters: hazard (All, Fire, Weather warnings, Road incidents) and wilaya. The year filter appears only
   when records span more than one year; today they span one.
2. Coverage line: when each hazard's records start. Nothing before that date is claimed as quiet.
3. Focal point: "Hazards recorded each week" (weekly while the archive spans 120 days or less, monthly after),
   one bar series per hazard in view, each named in a legend.
4. Hazard sections for what is in view: fire keeps total, burned area, Civil Protection reports and the cumulative
   burned area chart; weather counts warnings by phenomenon and severity; road lists the latest incidents.
5. Wilayas: ranked by records in view (by burned area when only fire is in view).
6. Records table: date, hazard, place, detail, latest 300; fires link to their page. CSV export of the filtered
   records, all hazards in one file.

## States

Sources load together and fail on their own: a failed source says which hazard is missing and offers a retry
while the others render. Filtering to nothing says so and names the filter.

## Out of scope

Server-side aggregation beyond the ONM view, a map of history, pagination past 300 table rows (the CSV holds all).
