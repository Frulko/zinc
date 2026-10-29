#!/bin/sh
# The listening history of the iPod app (examples/ipod/src/services/history.ts, historyImport.ts) against the stand-in Last.fm and
# ListenBrainz of tests/data/ipod-scrobble/stub.py (the real services are never called): the fake iPod's history.jsonl, a Last.fm
# import of 2,500 generated scrobbles stopped after 3 pages and resumed (an error 29 on the way), an incremental import that finds the
# scrobble made meanwhile, ListenBrainz by its API (rate-limit headers) and by an export zip, the matching to the fixture iPod
# (accents, feat., remaster, live, & and "and", one fuzzy, one MBID, a cover and a near-duplicate that must not match) and the queries
# (top songs, sessions, plays per iPod track, skips, last played, unmatched). On the interpreter (the app runs AOT: ipod_demo builds
# it). Not on QuickJS yet: there a zinc:process child started after a net.fetch never reports its end (the program exits early,
# silently), an engine defect reported with this test.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null && command -v unzip >/dev/null || exit 77
tmp=$(mktemp -d); stub=''
trap '[ -n "$stub" ] && kill $stub 2>/dev/null; rm -rf "$tmp"' EXIT
python3 tests/data/ipod-scrobble/stub.py "$tmp" "$tmp/port" & stub=$!
for i in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done
S=http://127.0.0.1:$(cat "$tmp/port")
export IPOD_LASTFM_URL=$S/2.0/ IPOD_LISTENBRAINZ_URL=$S IPOD_HISTORY_PACE_MS=1 ZINC_HEADLESS=1
unset ZINC_DETERMINISTIC   # the importers bound their pages by the wall clock (Date.now), as against the real services
fail=0
w="$tmp/w"; mkdir -p "$w"; cp "$tmp/history-data.json" "$w/"
python3 tests/data/ipod-history/check.py setup "$w" || exit 1
HISTORY_DIR=$w "$ZINC" run --interp tests/data/ipod-history/main.ts > "$w/out.json" 2>"$w/err"
python3 tests/data/ipod-history/check.py check "$w" "$w/out.json" > "$w/why" 2>&1 || { echo "ipod_history: $(head -20 "$w/why") $(tail -3 "$w/err")"; fail=1; }
# the Last.fm calls: every one with the key, 200 a page and extended; the bound only goes down; two incremental runs
python3 - "$tmp/requests.jsonl" <<'PY' || fail=1
import json, sys
rs = [json.loads(l) for l in open(sys.argv[1])]
recent = [r['params'] for r in rs if r['service'] == 'lastfm-read' and r['method'] == 'user.getrecenttracks']
assert all(p['api_key'] == 'apikey' and p['limit'] == '200' and p['extended'] == '1' and p['page'] == '1' for p in recent), recent[:1]
run = recent
tos = [int(p['to']) for p in run if 'from' not in p]
assert tos == sorted(tos, reverse=True), 'the bound does not go down: %s' % tos
assert sum(1 for p in run if 'from' in p) == 2, 'incremental runs: %s' % [p for p in run if 'from' in p]
lb = [r for r in rs if r['service'] == 'listenbrainz-read' and r['path'].endswith('/listens')]
assert lb and all(r['params']['count'] == '1000' for r in lb), lb[:1]
PY
[ $fail -eq 0 ] && echo "ipod_history: ok"
exit $fail
