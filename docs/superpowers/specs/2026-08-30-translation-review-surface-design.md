# Translation review surface — design

Route `/contribute/language/$locale`. Lets a native speaker read and correct Nadhir's
copy without a GitHub account, a text editor, or any knowledge of TypeScript.

**Built 2026-08-30.** `src/routes/contribute_.language.$locale.tsx` — the trailing
underscore matters: without it TanStack nests the route under `contribute.tsx`, which has
no `<Outlet />`, and the page silently renders the parent instead.

## Why the obvious answer fails

`CONTRIBUTING.md` calls native review of Arabic and especially Kabyle one of the most
valuable contributions available. The path to actually doing it is
`src/i18n/locales/kab.ts` — 764 lines of TypeScript object literal. Correcting one word
means forking, editing TypeScript, opening a pull request, and passing tsc, prettier,
eslint and the key-parity test.

The person that lane is written for cannot do any of that. Until this exists the lane
routes to the free-text box, which is fine for "this word is wrong on the forecast page"
and useless for reviewing 764 strings.

Two properties make review harder than it looks:

- **English alone is not enough context.** Register is what needs judging in a warning
  system, and register depends on where the string appears. A reviewer needs to know that
  a string is a button on the SOS screen, not a paragraph in the About page.
- **Nothing in CI can check this.** The i18n test enforces key *parity*, not key
  *quality*. Human review is the only control that will ever exist here.

## Correction: JSON was not a prerequisite

An earlier draft of this spec called converting `src/i18n/locales/*.ts` to JSON a
prerequisite. That was wrong. The locale modules are plain objects the app already
imports, so the page walks them at runtime (`rowsFor` in `src/lib/translate.ts`) and pairs
each English string with its translation. No migration was needed to build this.

JSON would still help two things that are **not** built: an external TMS such as Weblate,
and a less brittle write-back than the string replacement `apply-translations.ts` does
today. Neither is urgent.

## Surface

One row per string, grouped by the top-level key (`nav`, `survival`, `contribute`, …)
because that grouping is already how the app is organised and it gives the reviewer a
sense of place.

Each row shows:

- the **English** source,
- the **current translation** in the target locale,
- **where it appears** — a short human label per section, authored once, not derived,
- a **suggestion field**, empty by default,
- an **"as good as it gets" toggle** so a reviewer can positively confirm a string rather
  than only flag bad ones. Silence is otherwise ambiguous: unreviewed and approved look
  identical, which is the exact problem this page exists to fix.

Filters: all / unreviewed / has suggestion / confirmed. Progress reads
"412 of 764 reviewed" so the work has a visible end, which the deficit numbers on
`/contribute` can then cite instead of the hardcoded `localesReviewed: 3`.

RTL is mandatory for Arabic; the English column stays LTR inside an RTL page.

## Data

```
translation_suggestions
  id, created_at
  locale        ar | fr | en | kab
  key_path      dotted path, e.g. "survival.sosTitle"
  source_text   English at time of review — pins what was reviewed
  current_text  translation at time of review
  suggestion    text, nullable when verdict = 'confirmed'
  verdict       'suggested' | 'confirmed'
  note          nullable, reviewer's reasoning
  reviewer_key  localStorage key, same mechanism as idea votes
  status        'pending' | 'accepted' | 'rejected'
  moderated_by, moderation_note
```

`source_text` and `current_text` are stored rather than looked up later because the copy
moves. A suggestion against a string that has since changed must be visibly stale, not
silently applied to different text.

Unique on `(locale, key_path, reviewer_key)` so one reviewer holds one opinion per string;
re-submitting replaces it.

## Writes and permissions

Identical to the idea board, for the same reason: registration is unreachable while the
SMTP wall in GAPS §1.2 stands, so an account-gated review collects nothing.

- `POST /api/public/contribute/translation` under the service role, rate limited via
  `consume_rate_limit`. A review session submits in batches, so the bucket is per session
  rather than per string — 20 batches/hour.
- No anon insert policy on the table.
- Anon reads nothing; suggestions are not public. Unlike ideas, there is no argument for
  displaying them, and a public list of "the Kabyle is wrong here" invites bikeshedding
  over a language most readers cannot check.
- Revoke any new function from `anon, authenticated` **by name** — Supabase's default
  privileges make a `REVOKE ... FROM PUBLIC` ineffective, which bit this project twice
  already.

## Applying accepted suggestions

A new tab in the moderation console, beside Suggestions:

1. Moderator reviews a batch per locale, accepts or rejects each.
2. Accepting sets `status = 'accepted'`. **It does not edit the app.** The strings are in
   git and must stay there — a database that can silently rewrite user-facing warning copy
   at runtime is exactly the kind of unreviewable path this project refuses everywhere else.
3. `bun run apply:translations --locale kab` reads accepted rows, rewrites the JSON, and
   leaves a normal diff for a normal pull request. Rows whose `current_text` no longer
   matches the file are skipped and reported as stale.

That keeps one property that matters: every word a person is shown arrived through a
reviewed commit.

## Attribution

A reviewer may leave a name to be credited. Optional, never required, never a login. The
`kab` locale's contributors belong in the repo, not in a database nobody reads.

## Scope

**In:** the review page for one locale, the suggestions table, the submit route, the
moderation tab, the apply script, the JSON migration.

**Out:** machine translation suggestions; a glossary or term base; per-string discussion
threads; translator accounts; anything resembling a full TMS. If volume ever justifies
those, the answer is Weblate rather than building them — and the JSON migration above is
what makes that switch possible.

## Open questions

- **Section labels** ("where it appears") must be authored by hand for roughly 40 top-level
  groups. Worth it, but it is real writing work and it needs doing in English first.
- **Should `localesReviewed` become a real query** off this table once it exists? It is
  currently the constant `3` in `readDeficits` — the one deficit on `/contribute` that is
  not measured. This surface is what would make it measurable.
