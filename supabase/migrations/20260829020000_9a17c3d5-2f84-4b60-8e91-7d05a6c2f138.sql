-- The anon policy exposed every column of an approved report, including
-- moderation_note, reviewed_by and the photo_url whose path embeds the reporter's
-- user id. Nothing in the app reads a public feed, so the policy only created
-- exposure. A future public feed should select safe columns through a view.
drop policy if exists "public read approved reports" on public.citizen_reports;
