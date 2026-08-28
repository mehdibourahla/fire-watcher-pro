# Handoff — Nadhir wildfire platform

## 1. Ground truth

**This is not a git repository.** There is no HEAD, no branch, no diff. Roughly 40 files
were created or rewritten and none of it is committed. Treat the working tree as the only
copy. Recommend `git init` before any further edits.

Run this first, before trusting anything below:

```
bun run test && bunx tsc --noEmit && bun run lint
```

Expect: `Test Files 6 passed`, `Tests 38 passed`, no tsc output, and lint clean **only** for
the paths listed in §5 — `src/server.ts`, `src/start.ts` and several untouched route files
were already prettier-dirty before this work and are still failing. That is pre-existing.

Live database (Supabase `nadhir`, ref `kuukthyenirwgdfkltlm`, eu-west-3), verified at handoff:

| table | rows |
|---|---|
| `admin_units` | 1605 (69 wilayas + 1536 communes) |
| `settlements` | 10257 |
| `detections` | 3878 (real FIRMS) |
| `fire_clusters` | 147, all with a commune |
| `risk_forecasts` | 5250 |
| `fwi_state` | **875 / 1536 — incomplete** |
| migrations applied | 21 |

## 2. In flight

**FWI bootstrap is paused at 875 / 1536 communes**, blocked on Open-Meteo quota, not on
code. Resume with `bun run bootstrap:fwi` (see §3). No background process is still running.

Nothing is red. No test is expected to fail.

## 3. Next action

Finish the bootstrap: 875 of 1536 communes have state.

```
SUPABASE_URL=https://kuukthyenirwgdfkltlm.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT from the dashboard> \
bun run bootstrap:fwi
```

**Open-Meteo's free quota was fully exhausted at handoff** — a 1-location, 1-day request
returned 429, so this is a spent daily/hourly allowance, not pacing. Do not retune batch
size or delays; that was tried and does not help. Wait for the reset (hourly, or UTC
midnight for the daily cap) and run the script, which defaults to 15 minutes between passes.

Progress is durable: `refreshRiskForecasts` flushes per batch
(`src/lib/ingest/weather.server.ts`), so a 429 mid-run keeps everything already written.
Each pass also gets cheaper — communes with stored state fetch ~1 past day instead of 92.

If the quota proves too tight to ever finish, the honest lever is lowering `SPINUP_DAYS`
(currently 92) toward 60. DC's time constant is ~52 days, so a shorter bootstrap starts
low and converges over subsequent daily runs. That is a scientific trade, not a free win.

## 4. Constraints already decided

- Algeria has **69 wilayas**, not the 58 in ORIGINAL-SPEC. The spec is one reorganisation
  stale. Recorded in `roadmap.md` and asserted in `src/lib/__tests__/geo-seed.test.ts`.
- Geography comes from **OpenStreetMap via Overpass**, not geoBoundaries or GADM.
  geoBoundaries DZA ADM1 has only 48 features and its ADM2 is a 76 KB duplicate of ADM1.
  Data committed at `data/geo/`, licence ODbL.
- The **Danger Dial was replaced** by a gradient scale (`DangerScale`), and the palette was
  re-derived rather than inherited from §12.1. Both were owner decisions; recorded in
  `docs/superpowers/specs/2026-08-28-nadhir-ui-redesign-design.md`.
- **FWI state is persisted** (`fwi_state`), per spec §9.2. A 92-day rolling recompute was
  tried first and abandoned — see §5.
- The **EUMETSAT worker writes no detections**. Its granules are netCDF that the edge runtime
  cannot decode. Guarded by a test in `src/lib/__tests__/ingest.test.ts`.
- Scheduler URL is the vault secret `nadhir_app_url`, not a hardcoded host. The cron function
  raises if it is unset.

## 5. Traps

- **`supabase/config.toml` still contains the OLD project id** (`qiyrlktcngedwbandtwn`).
  The real link target is `supabase/.temp/linked-project.json`. CLI errors quote the stale
  id and will send you to the wrong database. Verify before any `db push`.
- **Direct DB connection fails on this network** (`no route to host`, IPv6-only). Use the
  IPv4 pooler from `supabase/.temp/pooler-url` with port 5432 and `--db-url`.
- **The new-style `sb_secret_` key returns 401** on this project. Use the legacy
  `service_role` JWT from the dashboard.
- **Do not "fix" the FWI numbers.** Most communes read Extreme because CFFDRS is being applied
  to an arid regime it was not calibrated for. The implementation is verified against Van
  Wagner's published case to ±0.01 (`src/lib/__tests__/risk.test.ts`). This is a calibration
  decision for the owner, not a bug.
- **Do not replace `fwi_state` with a longer spin-up.** That was the original design; it costs
  ~100× the Open-Meteo weight at 1536 communes and exhausts the free tier.
- **PostgREST truncates at 1000 rows.** This silently caused 43% of clusters to have no
  commune. Use `fetchAllPages` from `src/lib/paginate.ts` for any select that can exceed
  1000 rows. Reads only — `.in()` on update/delete is fine.
- `data_sources.firms` may read "0 new detections" — correct when a run finds nothing new.

## 6. Pointers

- Audit findings: this session's conversation only; not written to a file.
- Design spec: `docs/superpowers/specs/2026-08-28-nadhir-ui-redesign-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-28-nadhir-ui-redesign.md`
- Status and remaining gaps: `roadmap.md`
- Product spec: `ORIGINAL-SPEC.md` (stale on wilaya count; otherwise authoritative)
- Dashboard: https://supabase.com/dashboard/project/kuukthyenirwgdfkltlm
- Credentials: `~/.config/nadhir/` — db password, API secrets, old-project env backup.
  Never in the repo. FIRMS/EUMETSAT/Firebase keys were pasted in chat
  and should be rotated.
