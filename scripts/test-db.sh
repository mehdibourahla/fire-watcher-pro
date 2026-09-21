#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Supabase mounts only the tests directory into its pg_prove container.
fixtures=supabase/tests/.migration-fixtures
mkdir -p "$fixtures"
trap 'rm -f "$fixtures/onm_delivery_validity.sql"; rmdir "$fixtures"' EXIT
cp supabase/migrations/20260921150452_onm_delivery_validity.sql "$fixtures/onm_delivery_validity.sql"
supabase test db "$@"
