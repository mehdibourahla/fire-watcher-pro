-- GitHub Actions delivers scheduled runs hours late: the 06:00 slots were reached
-- at 11:33, 13:09, 11:34 and 12:30 on consecutive days, all after the 240-minute
-- window had already expired the job, so local_fwi and effis never ran once the
-- isolated executor took over. 720 minutes keeps the slot useful until 18:00 and
-- still closes well before the next daily slot.
update public.source_contracts
set retry_window_minutes = 720
where key in ('local_fwi', 'effis');
