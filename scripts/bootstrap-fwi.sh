#!/usr/bin/env bash
# Resume the FWI bootstrap until every commune has stored state.
# Open-Meteo's free quota binds; passes that 429 lose nothing because
# refreshRiskForecasts flushes per batch.
set -euo pipefail
: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"
GAP="${GAP_SECONDS:-900}"

count() {
  curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
       -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
       -H "Prefer: count=exact" -I \
       "$SUPABASE_URL/rest/v1/fwi_state?select=commune_id" \
    | grep -i content-range | tr -d '\r' | sed 's|.*/||'
}

for pass in $(seq 1 40); do
  out=$(bun -e 'const {runRiskPipeline}=await import("./src/lib/ingest/pipeline.server.ts");console.log(JSON.stringify(await runRiskPipeline()))' 2>&1 | tail -1)
  n=$(count)
  echo "[pass $pass] fwi_state=$n/1536 :: $out"
  if [ "$n" -ge 1536 ] 2>/dev/null; then echo "BOOTSTRAP COMPLETE"; exit 0; fi
  sleep "$GAP"
done
echo "gave up after 40 passes; quota may need a daily reset"
exit 1
