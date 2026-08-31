# Contribute page — design

Route `/contribute`. A call for contributors of every kind, not only developers.

## The problem with the obvious version

A "Contribute" page that opens with a hero and a wall of GitHub teaches the reader that
this project wants developers. Whatever sits in the hero is what the page is about, and a
generic hero lets the code section win by default because it is the most concrete thing
present.

Nadhir's largest gaps are not code. They are an unreviewed language, two thousand places
nobody has visited, guidance nobody has recorded, and an institution nobody has called.
The page has to make that visible before it asks for anything.

## Thesis: state what is missing, not what is wanted

The page opens with four deficits read from the live database:

| Stat | Query |
| --- | --- |
| Places verified | `open_areas` where `verified_at is not null` / total |
| Communes with fuel data | `admin_units` level commune with `forest_fraction > 0` / total |
| Alerts delivered | `alerts` total |
| Languages shipped | constant 4, of which 3 reviewed |

Each carries a progress track that is nearly empty. A visitor learns in one glance that
the biggest holes here are not software, and nobody had to assert it.

The numbers are queried, never hardcoded. `forest_fraction` moved from 13 to 1,187 in a
single evening during this work; a constant written that morning would have been a lie by
nightfall. A count that cannot be read renders an em dash rather than a wrong number —
`readDeficits` returns `-1` for a failed query and the card degrades.

**Kabyle deliberately has no number.** "Never reviewed by a native speaker" is not a row
count, and inventing one on a page whose whole argument is that the numbers are real would
undo the page.

### The deficit needed a column

`open_areas` had nowhere to record a visit, which is why "0 verified" was not queryable.
The migration adds `verified_at`, `verified_by`, `verified_note`. This does three things at
once: the flagship number becomes a real query, the field-verification lane gains somewhere
to land its work, and the number falls visibly as people contribute. A deficit that never
moves is a complaint; one that moves is a scoreboard.

## Lanes

Eight cards, ordered by how badly the project needs each one, then a separate short code
section. Code sits eighth because that is true.

`local`, `language`, `audio`, `institutional`, `science`, `research`, `coordination`,
`testing`, plus `code` and `other` in the submission lane list.

Each card carries the deficit, one sentence of what you would actually do, an honest line
about what it asks of you, and one action.

## The idea board

The lane list can never be complete — project management, research, and things nobody has
thought of. The open box is the admission of that, designed as a real section rather than a
footer afterthought.

Flow: anonymous submission → `pending` → a moderator publishes → visible on the board →
anyone can vote.

**Nothing user-submitted displays before a human reads it.** This mirrors the All-Clear
Report rule in `CONTEXT.md`: the display asymmetry is deliberate.

**The board ships seeded** with four open questions already recorded in GAPS.md. An empty
board reads as an abandoned project and suppresses the very submissions it exists to invite.

### Voting is anonymous by necessity

Registration is unreachable until the SMTP wall in GAPS §1.2 falls, so an account-gated
vote would collect nothing. A random key in `localStorage` identifies a browser; the unique
constraint on `(idea_id, voter_key)` stops a double-tap. Clearing storage earns another
vote — deliberately cheap, and the UI says the count shows interest rather than a number of
people rather than implying rigour it does not have.

Score is denormalised onto `contribution_ideas.score` by trigger so the board reads one
table.

## Writes go through server routes, not the client

`POST /api/public/contribute/idea` and `/vote` run under the service role so they can use
the existing `consume_rate_limit`. Submissions are capped at 5/hour per address, votes at
60/hour. A honeypot field rejects bots that fill every input; captcha is disabled
project-wide (GAPS §4.2), so moderation is the real backstop and Turnstile is the upgrade
if abuse appears.

Consequently the tables need **no anon insert policy at all**. Anon may read published
ideas and nothing else.

### Two privilege holes found while testing

Supabase grants EXECUTE on new public-schema functions to `anon` and `authenticated` via
default privileges, so `REVOKE ... FROM PUBLIC` does not remove them. Verified against a
real stack: `anon` could call `vote_on_idea` — and, pre-existing, `consume_rate_limit` —
straight through PostgREST, skipping the rate limiter or exhausting anyone's bucket. Both
are now revoked from `anon, authenticated` explicitly.

## Placement

- **Footer** — primary, on every page, in the accent so it reads as the one invitation
  among six reference links.
- **Header nav** — a sixth item, desktop only; the nav is already hidden below 1024px.
- **Tail of `/about`** — a cross-link card for the highest-intent readers on the site.

**Not in the mobile bottom tabs.** Those four are Map, Forecast, Alerts, Settings — every
one something a person might need while a fire burns. Recruitment does not belong there.

## Honesty invariants

- The box must not promise a reply while nothing answers it. Copy says a person reviews
  submissions and to expect days, not minutes.
- When an agent is wired up to reply, **the reply must say it is an agent.** A project whose
  pitch is that every fact carries its source cannot have a bot signing as a person. This is
  a one-line copy change, not a redesign.
- Contact is optional, never published, used only to reply.

## Testing

- `contribute.test.ts` covers validation, the honeypot, percent clamping, and asserts the
  UI's lane list equals the CHECK constraint's — a lane the UI offers but the database
  rejects would fail only on a real person's submission.
- Verified end to end against a local Supabase stack: submit → pending → publish → board →
  vote → toggle, plus rate limiting, RLS boundaries, Arabic RTL, and mobile.

## Deliberately not built

- Reply-to-contributor (waiting on the agent).
- Verification submission UI for open areas — the column exists, the form does not; the
  lane currently links to a GitHub issue.
- Turnstile.
