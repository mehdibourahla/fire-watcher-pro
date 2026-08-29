-- The webhook URL was only checked in the React form, so any client could store an
-- http:// or internal target and read 300 bytes of the response back from the
-- delivery log. Delivery re-checks this too; the constraint stops the row existing.
alter table public.webhook_endpoints
  drop constraint if exists webhook_endpoints_url_https;

alter table public.webhook_endpoints
  add constraint webhook_endpoints_url_https
  check (
    url ~ '^https://[^/[:space:]]+'
    and url !~* '^https://(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)'
    and url !~* '^https://[^/]*\.(local|internal)(:|/|$)'
  );
