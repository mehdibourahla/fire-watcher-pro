# Admin panel — design

Date: 2026-09-04
Status: approved
Epic: Operations move out of the shell

## Mandate

Every operation that matters is performed today by one person holding the service-role key
and running a script. That key is an authority: it bypasses the role checks the database
already carries, and it leaves no actor behind. On 2026-09-04 fifteen moderation decisions
were written to production with `moderated_by` null, because a script has no user. The
translation apply loop had already failed the same way — a contributor's accepted fix sat
unshipped for four days because the step that ships it is a script nobody was reminded to run.

Build one authenticated, audited console that owns every operation, so that work can be
delegated to volunteers without delegating a key, and so no mutation reaches production
without an actor and a record.

## Audiences

- **Operators** run the pipeline: source health, replays, gaps, risk publication, fire
  resolution, broadcast dispatch. They need density and speed.
- **Volunteer moderators** review citizen reports, ideas and translations. They need narrow
  surfaces, reversible actions, and copy that states consequences.
- **Incident editors** transcribe and correct official bulletins.
- **Admins** hold roles, destructive operations, and the audit trail.

Nobody sees a domain their role does not name. Absence of a button is not the boundary; the
database function is.

## Decided constraints

These were settled in brainstorming and are not open during implementation.

| Decision | Value |
| --- | --- |
| Operators | The owner plus trusted volunteers |
| Permissions | Per-domain named roles, no locale or wilaya scoping |
| Pipeline | Full mission control, including destructive operations |
| Audit | One central log; automation writes `system` plus a job name |
| Home screen | Triage — what needs attention, ranked by consequence |
| Scope | Closes the operator gaps GAPS names, not open-ended growth |
| Language | French and English only |
| Devices | Desktop-first; the urgent subset genuinely works on a phone |
| Authority | Database-first hybrid |

## Authority model

### Roles

`app_role` becomes `admin, operator, report_moderator, translator, incident_editor, user`.
Today's `moderator` is retired, not aliased.

Postgres has no `ALTER TYPE ... DROP VALUE`, so the enum is recreated and `user_roles.role`
re-typed in one migration. Existing `moderator` grants expand to `report_moderator`,
`translator` and `incident_editor` so no volunteer loses access mid-season. Leaving a dead
`moderator` value would keep passing every `has_role(..., 'moderator')` check written before
the split, which is precisely the legacy this project does not keep.

`has_role` keeps its signature. A new `has_any_role(uuid, app_role[])` covers surfaces that
several roles reach.

### Where a mutation lives

A mutation is a `security definer` database function. This is the default and needs no
justification.

A server route under `/api/admin/*` is permitted **only** when the operation must leave
Postgres. On current evidence that is two operations:

- broadcast dispatch, which calls Telegram and FCM
- the screening-registry rebuild, which reads `data/flares/`

Replays do not qualify: `enqueue_source_replay` already enqueues work for a worker inside
the database. Any new exception must be argued in review and added to this list. Without
that rule written down, "hybrid" becomes route-first within a month.

Every function follows the same shape: check the role, take the lock, write the change,
write the audit row, return. One transaction. A function that writes a change without an
audit row is a defect.

### Service-role key

The key stops being an authority. The thirteen scripts that hold it call the same functions
the panel calls, passing a job name. `actor_kind` is `system` and `actor_label` is that name.

This is a debugging aid, not a boundary: the label is self-declared, and anything holding the
key can claim any name. The boundary remains the role check inside the function. Stated here
so nobody later mistakes the log for an authorization record.

### `admin_audit`

One append-only table.

| Column | Type | Note |
| --- | --- | --- |
| `id` | uuid | |
| `at` | timestamptz | default `now()` |
| `actor_user_id` | uuid | null when `actor_kind = 'system'` |
| `actor_kind` | text | `user` or `system` |
| `actor_label` | text | job name for automation, null for humans |
| `domain` | text | `sources`, `fires`, `risk`, `incidents`, `broadcasts`, `queues`, `places`, `people` |
| `action` | text | verb, e.g. `fire.resolve`, `risk.publish` |
| `target_table` | text | |
| `target_id` | text | |
| `before` | jsonb | null on create |
| `after` | jsonb | null on delete |
| `reason` | text | required for destructive actions |

Indexed on `at desc`, `(domain, at desc)` and `(actor_user_id, at desc)`.

`broadcast_audit` folds into it. Its `commune_codes`, `phase`, `severity`, `kind` and
`cluster_id` move into `before`/`after`, and the table is dropped in the same migration. Two
audit systems that can disagree is worse than one rewrite of the `/broadcasts` audit view.

Rows are never updated or deleted. `revoke update, delete` from every role including
`service_role`.

## Information architecture

`/admin` is a shell with a left nav, gated by any admin-panel role. `/moderation`,
`/broadcasts` and `/team` move under it and the old routes are deleted. `/alerts`,
`/settings`, `/zones`, `/report` and `/webhooks` are citizen surfaces and do not move.

| Route | Owns | Roles |
| --- | --- | --- |
| `/admin` | Triage — what needs attention | any |
| `/admin/sources` | Health, contracts, jobs, leases, gaps, replays, checkpoints | operator, admin |
| `/admin/fires` | Fires, resolution, detections, screening registry | operator, admin |
| `/admin/risk` | Forecast stage, publish, discard, checkpoints, FWI state | operator, admin |
| `/admin/incidents` | Official incidents, documents, extractions, mentions, recall | incident_editor, operator, admin |
| `/admin/broadcasts` | Kill-switch, dispatch, channels, history | operator, admin |
| `/admin/queues` | Citizen reports, hazard reports, ideas, translations | report_moderator, translator, admin |
| `/admin/places` | Admin units, aliases, settlements, open areas | operator, admin |
| `/admin/people` | Profiles, role grants | admin |
| `/admin/audit` | The timeline | admin sees all; every other role sees only its own actions |

`/admin/queues` shows only the tabs a role reaches. A translator sees translations and
nothing else — the surface that today hands a Kabyle reviewer citizen fire reports.

### Triage

The home ranks by consequence, not recency. Each row states the problem in a sentence and
links to the surface that fixes it. Rows, in order:

1. Broadcast kill-switch engaged
2. A source is failing or its checkpoint is stale beyond contract
3. Risk publication did not run for the current checkpoint
4. Fires awaiting resolution above the alerting confidence bar
5. An accepted translation has not reached its locale file (the `--check` gate, read live)
6. Queue depth by domain, oldest item age
7. Watchdog and `operator_alert_state`

An empty triage screen states that everything is current and when it last checked. It never
renders blank.

### Phone

The urgent subset is genuinely usable one-handed: triage, broadcast approve and kill-switch,
official incident entry, fire resolution. Dense tables — sources, places, audit — are
desktop-only and say so at narrow widths rather than reflowing into something unusable.

## Capability this build adds

GAPS names operator holes that are missing behaviour, not missing screens. All four close here.

**Fire resolution (US-6).** The storage already exists — `fire_clusters` carries
`state`, `resolution_reason`, `resolution_note`, `resolved_at` and `resolved_by`. What is
missing is the operator surface and the function behind it, so this build adds no columns.

Two distinct axes, and the existing schema already separates them. `state` is the lifecycle
(`unconfirmed`, `active`, `contained_guess`, `extinguished`, `false_positive`).
`resolution_reason` explains a false positive and is a closed set of causes
(`flare`, `glint`, `industry`, `agri_burn`, `other`). Resolving is therefore: set `state`, and
when it becomes `false_positive`, supply a `resolution_reason` and optional note. No new
vocabulary is invented; an earlier draft of this spec proposed `duplicate`/`out_of_area`/
`ended`, which would have created a rival concept beside `state`.

The screening registry already writes `flare` automatically. Manual resolution uses the same
columns so both paths read alike, and is reversible by an admin.

Per CONTEXT the operator UI says **Fire**, never "cluster", and never renders the raw `state`
words — `active` and `unconfirmed` are internal, and "confirmed" is reserved for an
authority's own announcement.

**Contribution replies.** `contribution_ideas` gains `reply`, `replied_at`, `replied_by`. The
reply is visible to the submitter on their submissions view. Per CONTEXT, a reply written by
an agent must say so — the field carries `reply_author_kind` (`person` or `agent`) and the UI
renders it. A project whose pitch is that every fact carries its source cannot have a bot
signing as a person.

**Open-area verification.** `open_areas` already carries `verified_at`, `verified_by` and
`verified_note`, so this is surface and a function, not a migration. Today verifications arrive
as free text in the idea box and a maintainer transcribes them by hand.

**Translation form defect.** `suggestion_required_when_suggested` only checks non-null, so the
review form accepts a suggestion identical to the current text. Five such rows exist; two sat
on `notFound.home` and `notFound.body` and read as a reviewer defending old wording. The
constraint gains `suggestion is distinct from current_text`, and the client blocks submission
with a message rather than relying on the constraint to reject silently.

## Data flow and failure

Reads go through TanStack Query against RLS-protected views, as the app already does. Writes
call an RPC and invalidate.

**Concurrency.** Operations on a row that another operator may hold pass the `updated_at` they
read. The function raises `stale_write` when it no longer matches. The panel shows what
changed and re-reads rather than silently overwriting. This matters most on fire resolution
and incident editing, where two people work the same fire.

**Errors are named, not prose.** Functions raise codes — `insufficient_privilege`,
`stale_write`, `last_admin_required`, `invalid_resolution_reason` — mapped to i18n keys in the
client. This is the pattern `roleMutationErrorKey` already uses; it generalises to one map.

**Destructive actions require a reason.** The reason is a required argument on the function,
not a UI convention, so a script cannot skip it. It lands in `admin_audit.reason`.

**Nothing is silently swallowed.** A failed mutation surfaces its code. Fail fast and loud.

## Localisation

Admin strings live in their own modules, `src/i18n/admin/{en,fr}.ts`, exporting an
`AdminTranslation` type structural over `en`. They are not part of `Translation`, so `ar.ts` and
`kab.ts` are unaffected and need no admin keys to typecheck. `/admin` routes read the admin
bundle; a French or English admin locale falls back to English for any missing key.

`/contribute/language/:locale` enumerates translation keys for review. It must exclude the
admin namespace, or `ar` and `kab` reviewers receive several hundred strings they should never
see. This is a filter in the key enumeration, and it needs a test.

## Verification

- **pgTAP** (`supabase test db`) per function: denies the wrong role, writes exactly one audit
  row, is idempotent where it claims to be, raises `stale_write` on a stale `updated_at`.
- **Role matrix test** asserting every `/admin` route rejects every role not in its row above.
  Table-driven, so a new surface without a role entry fails.
- **Audit completeness test** asserting every admin RPC in the migration set writes
  `admin_audit`. A function that mutates without auditing fails the suite.
- **Vitest** for pure logic: triage ranking, permission mapping, error-code mapping.
- **Translation namespace test** asserting the review enumeration excludes `admin.*`.

## Delivery milestones

Sequential; each lands green before the next starts.

1. **Foundation** — enum recreation, `has_any_role`, `admin_audit`, `broadcast_audit` fold,
   `/admin` shell, nav, role gating, FR/EN scaffolding.
2. **Queues** — reports, hazard reports, ideas, translations; contribution replies; the
   translation form defect. Migrates `/moderation` and deletes it.
3. **People and audit** — roles, grants, the timeline. Migrates `/team` and deletes it.
4. **Fires and sources** — fire resolution, screening registry, health, jobs, gaps, replays.
5. **Risk and incidents** — publication lifecycle, FWI state, incident editing, extractions.
6. **Broadcasts and places** — dispatch, kill-switch, channels; admin units, open-area
   verification. Migrates `/broadcasts` and deletes it.
7. **Script migration** — the thirteen service-role scripts call the same functions with a job
   name. The key stops being an authority.

## Explicitly deferred

- Locale and wilaya scoping on roles. Named roles only, by decision.
- Per-capability grants. Roles are the unit.
- Realtime subscriptions. Triage polls; fire-season cadence does not need sockets.
- A public accountability view of operations.
- Replacing `/status`. It stays the public surface; `/admin` is the private one.
- Arabic and Kabyle admin translations.
