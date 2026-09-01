#!/usr/bin/env bash
set -euo pipefail

psql() {
  echo "unexpected psql call" >&2
  return 91
}

curl() {
  echo "unexpected curl call" >&2
  return 92
}

export -f psql curl

assert_rejected() {
  local rest_url="$1" output status
  set +e
  output="$(
    QA_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54822/postgres" \
      QA_REST_URL="$rest_url" \
      QA_ANON_KEY="local-anon" \
      QA_SERVICE_ROLE_KEY="local-service" \
      QA_JWT_SECRET="local-jwt-secret" \
      bash scripts/test-risk-snapshot-race.sh 2>&1
  )"
  status=$?
  set -e

  test "$status" -eq 2
  case "$output" in
    *"refusing non-local Data API URL"*) ;;
    *) echo "missing REST URL refusal for $rest_url" >&2; exit 1 ;;
  esac
  case "$output" in
    *"unexpected psql call"* | *"unexpected curl call"*)
      echo "REST URL guard ran after an external request for $rest_url" >&2
      exit 1
      ;;
  esac
}

assert_rejected "https://api.example.test"
assert_rejected "http://localhost.example.test:54821"
assert_rejected "http://127.0.0.1:54821@api.example.test"
assert_rejected "http://127.0.0.1:70000"

echo "non-local and malformed Data API URLs fail before external requests"
