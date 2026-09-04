-- Separate file from every use: Postgres refuses a new enum value in the transaction that added it.
alter type public.app_role add value if not exists 'operator';
alter type public.app_role add value if not exists 'report_moderator';
alter type public.app_role add value if not exists 'translator';
alter type public.app_role add value if not exists 'incident_editor';
