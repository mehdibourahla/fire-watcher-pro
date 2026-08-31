# Contributing to Nadhir

Nadhir is a wildfire early-warning service for Algeria — AGPL-3.0, Arabic-first, and
safety-critical. Contributions are welcome at every level, and the access model below is
deliberately tiered: writing code requires no credentials at all, and production access
stays with a very small operator circle because a warning service that lies is worse than
none.

## Run it in two minutes, no secrets

```sh
bun install
cp .env.example .env.local
bun run dev
```

`.env.example` ships working values: the Supabase URL and publishable key are public by
design (they are in the deployed browser bundle; row-level security is the real boundary).
The dev server runs against live public data — the map, forecasts and survival mode all
work. Before opening a PR:

```sh
bunx tsc --noEmit && bun run test && bun run lint
```

CI runs exactly those three on every PR, with no secrets, so fork PRs are first-class.

## The full stack locally (auth, ingest, migrations)

The live project's secrets never travel — for server-side work you run your own complete
stack instead. With [Docker and the Supabase CLI](https://supabase.com/docs/guides/local-development):

```sh
supabase start          # local Postgres + auth + storage; prints local URL and keys
supabase db push --local
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<printed key> bun run seed:geo
```

Point `.env.local` at the printed local URL and keys. Everything the local stack prints —
including its `service_role` key — is a documented constant, worthless outside your
machine. Outbound email lands in the local test inbox (`supabase status` shows the URL),
so account signup and login are fully testable locally, which the live project cannot do
yet. Add your own FIRMS/EUMETSAT keys and any string as `NADHIR_CRON_SECRET` to exercise
isolated source jobs end to end. Supabase and Cloudflare enqueue normalized slots; Workers
claim one short job at a time, while `local_fwi` and `effis` are claimed by separate GitHub
Actions consumers.

Queue, lease, gap, watchdog, and raw-run data are service-role-only. To replay, first identify
an existing `source_gaps.id`, then run:

```sh
SUPABASE_URL=<local-url> SUPABASE_SERVICE_ROLE_KEY=<local-key> \
  bun run replay:source -- <gap-uuid>
```

The command deliberately accepts neither a contract key nor an arbitrary interval.

## Migrations

Write the migration file (see the ledger traps in `GAPS.md` §5), test it against your
local stack, and open the PR. On merge, CI applies it to the live database **before**
deploying the code — so migrations must be additive during the deploy window: new tables
and new columns with defaults are fine; a rename or drop needs a two-step release
(add-and-migrate first, remove later). You never need the production database password.

## What needs a credential — and whose

- **Ingestion work** (FIRMS, EUMETSAT): register your **own** free keys
  ([FIRMS](https://firms.modaps.eosdis.nasa.gov/api/), [EUMETSAT](https://eoportal.eumetsat.int/)).
  Project keys are never shared.
- **Deploys and live migrations**: fully automatic — CI applies pending migrations and
  deploys on every merge to `main` (secrets live in the `production` environment). Only
  live _seeds_ and ad-hoc database surgery remain operator work.

## Access tiers

| Tier        | How                                     | Grants                                                                            |
| ----------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| Contributor | Fork + PR                               | Everything above — no access needed                                               |
| Maintainer  | Repo invite                             | Review and merge; `main` is protected and requires a reviewed PR                  |
| Deployer    | Merge rights + `production` environment | Merging to `main` deploys via CI; the environment holds the only Cloudflare token |
| Operator    | Supabase/Cloudflare account roles       | Live database and DNS — deliberately near-singular                                |

## Ground rules for changes

- **The honesty invariants are not negotiable.** Read `CONTEXT.md` (the project glossary)
  and `docs/adr/0002` / `docs/adr/0003` before touching anything user-facing: Nadhir
  informs, only authorities direct; no evacuation routing; every displayed fact carries
  its age; "safe" is banned as a status label.
- **Four languages or none.** Every new UI string exists in `ar`, `fr`, `en` and `kab` —
  the test suite enforces key parity. Native review of Arabic and especially Kabyle
  (Taqbaylit) copy is one of the most valuable contributions available right now.
- **Read the traps.** `GAPS.md` §5 lists the mistakes that cost real debugging time
  (migration ledger, maplibre worker, PostgREST row cap). Its "Where to start" table maps
  interests to tasks.
- Spec authority: `ORIGINAL-SPEC.md`, except the wilaya count (69, not 58).

## Security

Vulnerabilities go through [SECURITY.md](SECURITY.md), not public issues.
