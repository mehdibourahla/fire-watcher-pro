-- An Open Area imported from OSM carries no evidence anyone has seen it. Without a
-- place to record a visit the contribute page's headline deficit is unmeasurable.
alter table public.open_areas
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users(id) on delete set null,
  add column verified_note text;

create index open_areas_verified_at_idx on public.open_areas (verified_at);

create table public.contribution_ideas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lane text not null default 'other'
    check (lane in ('local','language','audio','institutional','science',
                    'research','coordination','testing','code','other')),
  message text not null check (char_length(message) between 25 and 2000),
  contact text check (contact is null or char_length(contact) <= 200),
  locale text not null default 'en' check (locale in ('ar','fr','en','kab')),
  status text not null default 'pending'
    check (status in ('pending','published','rejected','spam')),
  score integer not null default 0,
  published_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  moderation_note text
);

create index contribution_ideas_status_idx on public.contribution_ideas (status, score desc);

create table public.contribution_idea_votes (
  idea_id uuid not null references public.contribution_ideas(id) on delete cascade,
  voter_key text not null check (char_length(voter_key) between 8 and 64),
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (idea_id, voter_key)
);

create or replace function public.recount_idea_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contribution_ideas i
  set score = coalesce((
    select sum(v.value) from public.contribution_idea_votes v where v.idea_id = i.id
  ), 0)
  where i.id = coalesce(new.idea_id, old.idea_id);
  return null;
end;
$$;

create trigger contribution_idea_votes_recount
after insert or update or delete on public.contribution_idea_votes
for each row execute function public.recount_idea_score();

-- Voting is anonymous because registration is unreachable until SMTP exists; the
-- browser key only stops a double-tap, so the write goes through a definer
-- function rather than an anon insert policy on the votes table.
create or replace function public.vote_on_idea(
  _idea uuid,
  _voter text,
  _value smallint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _existing smallint;
  _score integer;
begin
  if _value not in (-1, 1) then
    raise exception 'value must be -1 or 1';
  end if;
  if not exists (
    select 1 from public.contribution_ideas
    where id = _idea and status = 'published'
  ) then
    raise exception 'idea not open for voting';
  end if;

  select value into _existing
  from public.contribution_idea_votes
  where idea_id = _idea and voter_key = _voter;

  if _existing is null then
    insert into public.contribution_idea_votes (idea_id, voter_key, value)
    values (_idea, _voter, _value);
  elsif _existing = _value then
    delete from public.contribution_idea_votes
    where idea_id = _idea and voter_key = _voter;
  else
    update public.contribution_idea_votes set value = _value, created_at = now()
    where idea_id = _idea and voter_key = _voter;
  end if;

  select score into _score from public.contribution_ideas where id = _idea;
  return coalesce(_score, 0);
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default privilege, so revoking from PUBLIC alone leaves both able to call this
-- straight through PostgREST and skip the rate limiter entirely.
revoke all on function public.vote_on_idea(uuid, text, smallint)
  from public, anon, authenticated;
grant execute on function public.vote_on_idea(uuid, text, smallint) to service_role;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

alter table public.contribution_ideas enable row level security;
alter table public.contribution_idea_votes enable row level security;

-- Readers see published notes only. Nothing anonymous writes directly: both the
-- submit and the vote path run server-side under the service role so they can be
-- rate limited, which an anon insert policy cannot be.
create policy "read published ideas" on public.contribution_ideas
for select to anon, authenticated using (status = 'published');

create policy "moderators read every idea" on public.contribution_ideas
for select to authenticated
using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));

create policy "moderators update ideas" on public.contribution_ideas
for update to authenticated
using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));

create policy "moderators read votes" on public.contribution_idea_votes
for select to authenticated
using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));

grant select on public.contribution_ideas to anon, authenticated;
grant all on public.contribution_ideas, public.contribution_idea_votes to service_role;

-- The board ships non-empty: an empty one reads as abandoned and suppresses the
-- submissions it exists to invite. Every seed is an open question from GAPS.md.
insert into public.contribution_ideas (lane, message, locale, status, published_at) values
  ('science',
   'Cross-check the danger scale against EFFIS before trusting either one — they disagree, and right now nobody knows which is wrong.',
   'en', 'published', now()),
  ('audio',
   'Record the guidance in Kabyle first rather than last. The people least served by written Arabic are the ones in the mountains.',
   'en', 'published', now()),
  ('institutional',
   'Ask Protection Civile which alert format they would actually accept, before building a channel nobody asked for.',
   'en', 'published', now()),
  ('local',
   'A printable one-page fire-season sheet for communes where most people do not carry a smartphone.',
   'en', 'published', now());
