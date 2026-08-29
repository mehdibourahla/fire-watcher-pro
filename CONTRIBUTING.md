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

## What needs a credential — and whose

- **Ingestion work** (FIRMS, EUMETSAT): register your **own** free keys
  ([FIRMS](https://firms.modaps.eosdis.nasa.gov/api/), [EUMETSAT](https://eoportal.eumetsat.int/)).
  Project keys are never shared.
- **Migrations, seeds, deploys**: operator work. Deploys happen automatically from CI on
  merge to `main`; migrations and seeds run only against the live project by an operator.
  You write the migration file and the PR; you never need the database password.

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
