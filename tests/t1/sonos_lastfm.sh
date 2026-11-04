#!/bin/sh
# Real Zinc HTTP/crypto/XML/storage against isolated Sonos and Last.fm fixtures.
cd "$(dirname "$0")/../.." || exit 2
set -eu
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
fixture= app=
trap '[ -z "$app" ] || { kill "$app" 2>/dev/null || true; wait "$app" 2>/dev/null || true; }; [ -z "$fixture" ] || { kill "$fixture" 2>/dev/null || true; wait "$fixture" 2>/dev/null || true; }; rm -rf "$tmp"' EXIT
export FIXTURE_PORT="$tmp/port" FIXTURE_PAUSED="$tmp/paused"
python3 tests/data/sonos-lastfm/fixture.py >"$tmp/fixture.log" 2>&1 & fixture=$!
i=0
while [ ! -s "$FIXTURE_PORT" ] && [ "$i" -lt 100 ]; do sleep 0.05; i=$((i + 1)); done
[ -s "$FIXTURE_PORT" ] || { cat "$tmp/fixture.log"; exit 1; }
export TEST_SONOS="http://127.0.0.1:$(cat "$FIXTURE_PORT")" TEST_LASTFM="http://127.0.0.1:$(cat "$FIXTURE_PORT")/lastfm"
export ZINC_HEADLESS=1
for mode in --interp --native --quickjs; do
  export TEST_DATA="$tmp/data$mode"
  if [ "$mode" = --quickjs ]; then
    "$Z" run tests/data/sonos-lastfm/check.ts --engine quickjs >"$tmp/check.log" 2>&1 || { cat "$tmp/check.log"; exit 1; }
  else
    "$Z" run "$mode" tests/data/sonos-lastfm/check.ts >"$tmp/check.log" 2>&1 || { cat "$tmp/check.log"; exit 1; }
  fi
  grep -q 'sonos-lastfm checks passed' "$tmp/check.log" || { cat "$tmp/check.log"; exit 1; }
done
# Startup/health/authenticated status/graceful shutdown, with no real Last.fm calls.
touch "$FIXTURE_PAUSED"
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
"$Z" build app/sonos-lastfm -o "$tmp/sonos-lastfm" >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
LASTFM_API_KEY=key LASTFM_API_SECRET=secret LASTFM_SESSION_KEY=session "$tmp/sonos-lastfm" --data "$tmp/server" --sonos "$TEST_SONOS" --port "$port" >"$tmp/app.log" 2>&1 & app=$!
i=0
while ! curl -fsS "http://127.0.0.1:$port/health" >"$tmp/health" 2>/dev/null && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
curl -fsS "http://127.0.0.1:$port/health" >"$tmp/health" || { cat "$tmp/app.log"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/status")" = 401 ]
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer wrong' "http://127.0.0.1:$port/status")" = 401 ]
curl -fsS -H "Authorization: Bearer $(cat "$tmp/server/admin.token")" "http://127.0.0.1:$port/status" >"$tmp/status"
python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); assert s["authorized"] and s["pending"]==[]' "$tmp/status"
i=0
while ! grep -q 'PAUSED_PLAYBACK.*Artist - Song.*1:00/2:00.*listened 0:00/1:00.*source: spotify' "$tmp/app.log" && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
grep -q 'PAUSED_PLAYBACK.*Artist - Song.*1:00/2:00.*listened 0:00/1:00.*source: spotify' "$tmp/app.log" || { cat "$tmp/app.log"; exit 1; }
kill "$app"; wait "$app"; app=
python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); assert s["version"]==1 and s["pending"]==[]' "$tmp/server/state.json"
echo 'sonos_lastfm: tracking, SOAP, signatures, outbox, auth and server passed'
