-- ONM re-issues an unchanged warning under a new id every 20-80 minutes; history counts it once per wilaya
create view public.onm_warning_history
with (security_invoker = true)
as
select distinct on (wilaya_id, event, severity, coalesce(onset, expires))
  id,
  wilaya_id,
  event,
  severity,
  coalesce(onset, sent) as starts_at,
  expires
from public.onm_vigilance
order by wilaya_id, event, severity, coalesce(onset, expires), sent;

grant select on public.onm_warning_history to anon, authenticated;
