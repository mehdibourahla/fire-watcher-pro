# Forecast page: every hazard for one place

Date: 2026-09-25. Status: approved by the project owner (place-first, with the dust row).

Design Read: public-safety planning page for residents of Algeria (mobile-first, four languages, RTL), in the
2026-08-28 redesign direction, dial ENERGY 1 / RHYTHM 2 / MOTION 1. The antislop filter applies
(`antislop-ui-filter` rule); the delivery report ends with its Delivery Gate.

## Why

`/forecast` is titled weather but is built around a six-day fire danger table; ONM warnings are one line inside
it. Nadhir covers fire, weather, road and other hazards. The page's job is one question: what is coming to my
commune in the next days.

## What each hazard can honestly forecast

Measured in prod on 2026-09-25:

| Row                  | Source (already in the app)                 | Horizon                                                        | Value per day                                              |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| ONM warnings         | `onm_vigilance`, per wilaya                 | today and tomorrow: ONM issues ~17 h before onset (max 22.8 h) | highest severity active that Algiers day, with event names |
| Fire danger          | `risk_forecasts`                            | 6 days                                                         | `danger_level` (1 to 5), fuel-limited flagged as today     |
| Weather              | `risk_forecasts.components`                 | 6 days                                                         | noon temperature and wind, 24 h rain (labelled "at noon")  |
| Air (dust and smoke) | Open-Meteo air quality (CAMS), browser-side | 5 full days; the sixth is partial                              | 24 h mean PM2.5 and PM10 against WHO 2021 24 h guidelines  |

Roads are not forecastable; road incidents stay on the live map. No row is shown for them.

An ONM cell beyond tomorrow reads "Not issued yet", never "None": ONM has not spoken about that day. An air cell
whose day has fewer than 24 model hours reads "Beyond the model's range". Neither is a zero.

Air bands (24 h means, so the WHO 24 h guideline is the right yardstick, unlike the hourly reading in #92):
PM2.5 uses the existing `smokeLevel` bands (15 / 37.5 / 75); PM10 uses 45 / 75 / 150 (WHO AQG, IT-3, IT-1).
The cell shows the worse of the two, and names which pollutant set it.

## Layout

1. **Place.** A commune picker with search (existing name matching across ar/fr/en/kab). Default: the signed-in
   user's first zone commune, else the last commune picked on this device, else no commune. With none, the
   grid area is an empty state that says "Choose a commune to see its next six days" and focuses the picker. The
   current default (the alphabetically first commune) is dropped: it shows a place nobody chose.
2. **Focal point: the grid.** Columns are days (today, tomorrow, weekday names), rows are the four hazards
   above. Each cell carries a level word plus its colour, never colour alone. Mobile: the grid scrolls sideways
   inside its own container with the hazard names pinned; the page itself never scrolls sideways.
   Below the grid, a disclosure "Hour by hour, next 48 hours" holds the existing `WeatherForecast` hourly view
   for the chosen commune.
3. **Where it is worst across the country.** Wilayas ranked by their highest level across ONM (today and
   tomorrow, Moderate 2, Severe 3, Extreme 4) and fire danger (today, highest commune, fuel-limited excluded),
   each row naming the hazards behind the level. Selecting a row sets the place to that wilaya's commune with
   the highest level. Dust is not ranked nationally: it is fetched per commune, not stored.

The six-day per-commune fire danger table and its wilaya accordion are removed; the grid and the national
ranking replace them. `RiskLegend` and `DangerScale` stay as the fire danger key.

## States

Each row fails on its own: a failed ONM or air fetch shows that row's error with a retry, the other rows stay.
Loading shows the grid's own skeleton rows, labelled with the hazard names. The national list has an empty
state ("No active warnings and no high fire danger today") that is a real, good outcome, worded as one.

## Copy

Every string the page uses loses its em dashes in en, fr, ar (and kab where it has its own text), per the
antislop per-page rule. Kabyle strings that are French placeholders stay placeholders.

## Out of scope

History (next spec), push or alert changes, storing air quality server-side, a road forecast.

## Testing

Unit: the day reducers (ONM per Algiers day with the event+severity+onset dedupe, air 24 h means and the
full-day rule, national ranking). Component: default-place order, empty state, one failing row. Browser:
click-through of picker, disclosure and ranking rows at 390 px and desktop, light and dark, keyboard only.
