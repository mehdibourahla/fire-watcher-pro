-- ingestEffis now fetches the day its job asks for, so a replayed slot recovers
-- that day rather than resolving a past gap with the current product
update public.source_contracts
set replay_capability = 'interval', replay_window_minutes = 10080
where key = 'effis';
