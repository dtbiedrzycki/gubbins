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

# The server must refuse to start without CREATE_SECRET.
if docker run --rm -e SESSION_COOKIE_SECRET=x gubbins:smoke >/dev/null 2>&1; then
  echo "FAIL: started without CREATE_SECRET" >&2
  exit 1
fi

docker run -d --name "$name" -p 127.0.0.1:3000:3000 -v "$volume":/data \
  -e CREATE_SECRET=smoke-create -e SESSION_COOKIE_SECRET=smoke-cookie gubbins:smoke >/dev/null

for _ in $(seq 30); do
  curl -fsS "$base/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "$base/health" >/dev/null || { docker logs "$name" >&2; echo "FAIL: /health never came up" >&2; exit 1; }

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"listTitle":"L","itemTitle":"I","createSecret":"wrong"}' "$base/api/lists")
[ "$code" = 403 ] || { echo "FAIL: wrong create secret gave $code, expected 403" >&2; exit 1; }

curl -fsS "$base/" | grep -q '<div id="root">' || { echo "FAIL: SPA not served at /" >&2; exit 1; }
echo "container smoke: ok"
