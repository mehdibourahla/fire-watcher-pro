-- a polar orbiter passes twice a day over a country that is often not burning, and an empty
-- response carries no upstream slot, so the watermark never advanced and a working feed read
-- `unavailable` for ever. FIRMS is polar too and keys freshness on the poll for this reason.
update public.source_contracts
set freshness_basis = 'last_success_at',
    warning_after_minutes = 180,
    stale_after_minutes = 360,
    version = version + 1
where key = 's3_slstr';
