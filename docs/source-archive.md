# Source data archive

The archive preserves what Nadhir fetched before filtering, parsing or LLM interpretation. It starts when this change is deployed. Earlier detections, reports and forecasts remain useful derived data, but are not a substitute for missing original responses.

## Contents and access

Private bucket `source-archive` stores original response-body bytes, addressed by SHA-256. `source_captures` records every collection observation separately, including failures and unchanged HTTP 304 responses. Identical bodies reuse an object; they do not erase the history of collection attempts. No automatic deletion is configured.

Admins can inspect the newest captures in **Admin → Sources → Raw source archive**, filter by source key, and download checksum-verified payloads. Ordinary users and operators cannot read this archive. Existing public reporting and alert permissions are unaffected.

Coverage includes FIRMS, FCI, Sentinel-3, ONM feed and detail documents, Open-Meteo risk and wind inputs, EFFIS images, DGPC public Telegram previews, ITA, and ensemble previews. New network fetches made by the FIRMS science CSV and OSM import scripts are also captured. Existing disk-cache files are not relabelled as newly fetched responses.

This does not crawl linked photographs/videos, recover upstream history, archive credentials, or capture notification/authentication traffic. Browser air-quality lookups around a user's position are outside the shared ingestion archive; persisting those would require a separate decision about location-data collection.

## Export for analysis

Use a server environment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never place the service key in client configuration or export manifests.

```sh
bun --env-file=.env.local scripts/export-source-archive.ts \
  --source ita_website \
  --from 2026-09-09T00:00:00Z \
  --to 2026-09-10T00:00:00Z \
  --out ./ita-2026-09-09
```

Omit `--source` for all sources. The output directory must not exist. `--from` is inclusive, `--to` exclusive; both require explicit UTC timestamps. The export fixes a catalog recording-time cutoff at its start and paginates by immutable capture ID.

- `manifest.ndjson`: one capture per line, including unsuccessful attempts and relative payload paths.
- `payloads/<sha256>.bin`: each distinct original body, checked against its stored hash and byte count.
- `export.json`: format version, time boundaries, recording cutoff and capture count.

An interrupted or failed export leaves `manifest.ndjson.incomplete`; it is not a completed dataset. Use a new directory to retry. Keep the completed manifest with any analysis results so the exact input set remains known.

## Interpreting the data

`requested_at` and `fetched_at` describe collection, not when an incident happened. `recorded_at` is the catalog insertion time. Upstream event timestamps remain in the original bodies; response ETag and Last-Modified are recorded separately when available.

`status=captured` means the body was preserved, not that it is valid or trustworthy. Check `http_status`: error pages and malformed upstream payloads are intentional archival evidence. HTTP 304 means unchanged according to the source, not an empty incident list. Failed or missing collections must not be counted as zero real-world events.

Source job ID, attempt, contract version, parser version when available, and deployed code revision support run-level provenance after operational logs are summarized. This does not claim exact per-output-row lineage. Store the capture IDs and your own model/prompt/code versions with future analysis outputs; never overwrite original evidence with a new interpretation.

Bodies are the bytes exposed by `fetch` after HTTP decompression, not packet captures. A 32 MiB limit bounds memory usage. Oversized, interrupted or unarchivable responses fail collection visibly; source processing does not proceed with silently missing archive data. Review archive growth and adopt an explicit retention policy before introducing deletion.
