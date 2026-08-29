-- The ecmwf007.fwi legend has six classes starting at Low — no very_low exists, so
-- every stored row was one class too low; they also came from a cold-started EFFIS
-- run (DC at initialization values across the Mediterranean), so they are deleted,
-- not relabeled. masked records EFFIS declining to rate unvegetated land.
delete from effis_danger where date <= '2026-08-29';

alter table effis_danger drop constraint effis_danger_danger_class_check;
alter table effis_danger add constraint effis_danger_danger_class_check
  check (danger_class in ('low', 'moderate', 'high', 'very_high', 'extreme', 'very_extreme', 'masked'));
