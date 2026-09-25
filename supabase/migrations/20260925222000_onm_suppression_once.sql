-- the relay logs a suppressed ONM duplicate once per warning and looks it up here each run
create index broadcast_audit_onm_duplicate_idx on public.broadcast_audit (onm_vigilance_id)
  where action = 'suppressed' and reason = 'onm_duplicate';
