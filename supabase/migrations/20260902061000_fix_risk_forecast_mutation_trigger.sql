-- A BEFORE UPDATE trigger returning OLD silently discards the write; legacy rows
-- (no generation) were meant to stay mutable and updates to them never landed.
create or replace function public.reject_published_risk_forecast_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.snapshot_id is not null then
    raise exception using
      errcode = '55000',
      message = 'published_risk_forecast_is_immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
