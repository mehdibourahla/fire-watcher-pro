-- source_text and current_text are stored rather than looked up later: the copy
-- moves, and a suggestion against a string that has since changed must read as
-- stale instead of being silently applied to different words.
create table public.translation_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  locale text not null check (locale in ('ar','fr','en','kab')),
  key_path text not null check (char_length(key_path) between 2 and 200),
  source_text text not null,
  current_text text not null,
  suggestion text check (suggestion is null or char_length(suggestion) between 1 and 2000),
  verdict text not null check (verdict in ('suggested','confirmed')),
  note text check (note is null or char_length(note) <= 1000),
  reviewer_key text not null check (char_length(reviewer_key) between 8 and 64),
  reviewer_name text check (reviewer_name is null or char_length(reviewer_name) <= 80),
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected')),
  moderated_by uuid references auth.users(id) on delete set null,
  moderation_note text,
  constraint suggestion_required_when_suggested
    check (verdict = 'confirmed' or suggestion is not null),
  unique (locale, key_path, reviewer_key)
);

create index translation_suggestions_triage_idx
  on public.translation_suggestions (locale, status, created_at desc);

alter table public.translation_suggestions enable row level security;

-- Nothing anonymous writes directly: the submit path runs server-side under the
-- service role so it can be rate limited, which an anon insert policy cannot be.
-- Nothing anonymous reads either — unlike the idea board there is no reason to
-- publish "the Kabyle is wrong here" to readers who cannot check it.
create policy "moderators read suggestions" on public.translation_suggestions
for select to authenticated
using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));

create policy "moderators update suggestions" on public.translation_suggestions
for update to authenticated
using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));

grant all on public.translation_suggestions to service_role;
