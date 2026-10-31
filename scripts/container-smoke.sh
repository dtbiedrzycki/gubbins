#!/usr/bin/env bash
# Builds the production image and checks it boots, refuses a wrong create secret and serves the SPA.
set -euo pipefail
cd "$(dirname "$0")/.."

name=gubbins-smoke
volume=gubbins-smoke-data
base=http://127.0.0.1:3000
cleanup() {
  docker rm -f "$name" "$name-nosecret" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -t gubbins:smoke .

# The server must refuse to start without CREATE_SECRET, and say why. The timeout
# turns a server that starts anyway into a failure instead of a hung CI job; 60 s
# covers a cold start on a slow host. timeout stops only the docker client, so the
# container gets its own name for the rm below to stop a server that started anyway.
out=$(timeout 60 docker run --rm --name "$name-nosecret" -e SESSION_COOKIE_SECRET=x gubbins:smoke 2>&1 || true)
docker rm -f "$name-nosecret" >/dev/null 2>&1 || true
grep -q 'CREATE_SECRET must be set' <<<"$out" || { echo "$out" >&2; echo "FAIL: did not refuse to start without CREATE_SECRET" >&2; exit 1; }

docker run -d --name "$name" -p 127.0.0.1:3000:3000 -v "$volume":/data \
  -e CREATE_SECRET=smoke-create -e SESSION_COOKIE_SECRET=smoke-cookie gubbins:smoke >/dev/null

# --max-time 5: a server that accepts the connection but never answers would otherwise hang curl and the job.
for _ in $(seq 30); do
  curl --max-time 5 -fsS "$base/health" >/dev/null 2>&1 && break
  sleep 1
done
curl --max-time 5 -fsS "$base/health" >/dev/null || { docker logs "$name" >&2; echo "FAIL: /health never came up" >&2; exit 1; }

code=$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"listTitle":"L","createSecret":"wrong","key":"abacus-abdomen-able"}' "$base/api/lists")
[ "$code" = 403 ] || { echo "FAIL: wrong create secret gave $code, expected 403" >&2; exit 1; }

curl --max-time 5 -fsS "$base/" | grep -q '<div id="root">' || { echo "FAIL: SPA not served at /" >&2; exit 1; }
echo "container smoke: ok"
