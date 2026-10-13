#!/usr/bin/env bash
# Builds the production image and checks it boots, refuses a wrong create secret and serves the SPA.
set -euo pipefail
cd "$(dirname "$0")/.."

name=gubbins-smoke
volume=gubbins-smoke-data
base=http://127.0.0.1:3000
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -t gubbins:smoke .

# The server must refuse to start without CREATE_SECRET: a non-zero exit passes,
# while a clean exit or a server still running at the timeout (exit 124) fails.
rc=0
timeout 60 docker run --rm --name "$name-nosecret" -e SESSION_COOKIE_SECRET=x gubbins:smoke >/dev/null 2>&1 || rc=$?
if [ "$rc" = 0 ] || [ "$rc" = 124 ]; then
  docker rm -f "$name-nosecret" >/dev/null 2>&1 || true
  echo "FAIL: started without CREATE_SECRET (exit $rc)" >&2
  exit 1
fi

docker run -d --name "$name" -p 127.0.0.1:3000:3000 -v "$volume":/data \
  -e CREATE_SECRET=smoke-create -e SESSION_COOKIE_SECRET=smoke-cookie gubbins:smoke >/dev/null

for _ in $(seq 30); do
  curl --max-time 5 -fsS "$base/health" >/dev/null 2>&1 && break
  sleep 1
done
curl --max-time 5 -fsS "$base/health" >/dev/null || { docker logs "$name" >&2; echo "FAIL: /health never came up" >&2; exit 1; }

code=$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"listTitle":"L","itemTitle":"I","createSecret":"wrong"}' "$base/api/lists")
[ "$code" = 403 ] || { echo "FAIL: wrong create secret gave $code, expected 403" >&2; exit 1; }

curl --max-time 5 -fsS "$base/" | grep -q '<div id="root">' || { echo "FAIL: SPA not served at /" >&2; exit 1; }
echo "container smoke: ok"
