begin;

alter table public.citizen_reports
  add constraint citizen_reports_photo_key_valid
  check (
    photo_url is null
    or photo_url ~ (
      '^' || user_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png)$'
    )
  ) not valid;

alter table public.citizen_reports
  validate constraint citizen_reports_photo_key_valid;

commit;

-- Rollback drops citizen_reports_photo_key_valid.
