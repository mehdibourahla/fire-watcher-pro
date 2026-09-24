-- every 10 min the wind refresh alone exhausted Open-Meteo's free daily quota (13k locations on 2026-09-23)
update public.source_contracts
set cadence_minutes=30,warning_after_minutes=60,stale_after_minutes=120
where key='openmeteo_wind';
