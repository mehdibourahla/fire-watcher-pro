revoke select on public.risk_forecasts from anon, authenticated;
drop policy if exists "public read risk_forecasts" on public.risk_forecasts;

create function public.current_risk_forecasts()
returns table (
  id uuid,
  commune_id uuid,
  forecast_date date,
  horizon_days integer,
  source text,
  fwi double precision,
  danger_level integer,
  fuel_limited boolean,
  components jsonb,
  created_at timestamptz,
  snapshot_id uuid,
  commune_code text,
  name_en text,
  name_ar text,
  name_fr text,
  admin_level text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    forecast.id,
    forecast.commune_id,
    forecast.forecast_date,
    forecast.horizon_days,
    forecast.source,
    forecast.fwi,
    forecast.danger_level,
    forecast.fuel_limited,
    forecast.components,
    forecast.created_at,
    forecast.snapshot_id,
    unit.code,
    unit.name_en,
    unit.name_ar,
    unit.name_fr,
    unit.level
  from public.risk_publication_checkpoint as checkpoint
  join public.risk_forecasts as forecast
    on forecast.snapshot_id = checkpoint.snapshot_id
    and forecast.source = 'local_fwi'
  join public.admin_units as unit
    on unit.id = forecast.commune_id
    and unit.level = 'commune'
  where checkpoint.key = 'local_fwi'
    and checkpoint.coverage_status = 'complete'
    and checkpoint.published_at is not null
$$;

revoke all on function public.current_risk_forecasts()
  from public, anon, authenticated, service_role;
grant execute on function public.current_risk_forecasts()
  to anon, authenticated, service_role;

-- Rollback: drop current_risk_forecasts(), recreate the public-read policy, and
-- restore SELECT grants only if direct historical Data API access is acceptable.
