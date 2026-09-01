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
  local database_url="$1" rest_url="$2" expected="$3" output status
  set +e
  output="$(
    QA_DATABASE_URL="$database_url" \
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
    *"$expected"*) ;;
    *) echo "missing URL refusal for $database_url / $rest_url" >&2; exit 1 ;;
  esac
  case "$output" in
    *"unexpected psql call"* | *"unexpected curl call"*)
      echo "URL guard ran after an external request for $database_url / $rest_url" >&2
      exit 1
      ;;
  esac
}

local_db="postgresql://postgres:postgres@127.0.0.1:54822/postgres"
assert_rejected "$local_db" "https://api.example.test" "refusing non-local Data API URL"
assert_rejected "$local_db" "http://localhost.example.test:54821" "refusing non-local Data API URL"
assert_rejected "$local_db" "http://127.0.0.1:54821@api.example.test" "refusing non-local Data API URL"
assert_rejected "$local_db" "http://127.0.0.1:70000" "refusing non-local Data API URL"
assert_rejected "postgresql://postgres@db.example.test:5432/postgres?note=localhost" "http://127.0.0.1:54821" "refusing non-local database"
assert_rejected "postgresql://postgres@db.example.test:5432/localhost" "http://127.0.0.1:54821" "refusing non-local database"
assert_rejected "postgresql://postgres@127.0.0.1:54822@db.example.test:5432/postgres" "http://127.0.0.1:54821" "refusing non-local database"
assert_rejected "postgresql://postgres@localhost:70000/postgres" "http://127.0.0.1:54821" "refusing non-local database"
assert_rejected "postgresql://postgres@127.0.0.1:54822/postgres?host=db.example.test" "http://127.0.0.1:54821" "refusing database query overrides"
assert_rejected "postgresql://postgres@127.0.0.1:54822/postgres?HOSTADDR=203.0.113.9" "http://127.0.0.1:54821" "refusing database query overrides"
assert_rejected "postgresql://postgres@127.0.0.1:54822/postgres?sslmode=disable&Port=5432" "http://127.0.0.1:54821" "refusing database query overrides"
assert_rejected "postgresql://postgres@127.0.0.1:54822/postgres?%68ost=db.example.test" "http://127.0.0.1:54821" "refusing database query overrides"

echo "spoofed database and Data API URLs fail before external requests"
