#!/bin/sh
# Scrobbling of the iPod app and daemon against a local stand-in of Last.fm and ListenBrainz (tests/data/ipod-scrobble/stub.py: the
# real services are never called, IPOD_LASTFM_URL and IPOD_LISTENBRAINZ_URL point at it). First the core (tests/data/ipod-scrobble,
# on the interpreter and QuickJS): the rule, a listen that adds up and counts once, the Last.fm sign-in, now playing, the queues kept
# on disk while the services are down and sent after a restart in batches of 50; the stub checks every Last.fm signature and every
# ListenBrainz payload. Then the daemon (examples/ipod-web, port 8689: run alone) on a fake iPod with two 40 s songs: read only, a
# POST /api/played and a Subsonic scrobble wait in the iPod's cache folder (the scrobble goes to both services and to the listen
# history), now playing reaches both; started again with --allow-changes, the plays waiting are written to the iPod's play counts.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
tmp=$(mktemp -d); stub=''; pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; [ -n "$stub" ] && kill $stub 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
python3 tests/data/ipod-scrobble/stub.py "$tmp" "$tmp/port" & stub=$!
for i in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done
S=http://127.0.0.1:$(cat "$tmp/port")
export IPOD_LASTFM_URL=$S/2.0/ IPOD_LISTENBRAINZ_URL=$S ZINC_HEADLESS=1 SCROBBLE_DIR=$tmp

# ---- the core
cat > "$tmp/want" <<'OUT'
rule false true false true false
off true 0 0
auth url https://www.last.fm/api/auth/?api_key=apikey&token=tok123
session ann sk-ann
not approved yet true
check ann · 2500 scrobbles ann
refused ListenBrainz: Token invalid.
now playing errors true
heard false true false
open listen l2|beta|1 true
offline waiting 1 1 true true
after restart 60 60
sent 0 0 true true
OUT
for engine in --interp quickjs; do
  rm -rf "$tmp/q" "$tmp/off" "$tmp/offline" "$tmp/requests.jsonl"
  if [ $engine = quickjs ]; then "$ZINC" run tests/data/ipod-scrobble/main.ts --engine quickjs > "$tmp/out" 2>"$tmp/err"
  else "$ZINC" run --interp tests/data/ipod-scrobble/main.ts > "$tmp/out" 2>"$tmp/err"; fi
  diff "$tmp/want" "$tmp/out" > "$tmp/d" || { echo "ipod_scrobble: the core on $engine: $(cat "$tmp/d" | head -20) $(tail -3 "$tmp/err")"; fail=1; }
  python3 - "$tmp/requests.jsonl" <<'PY' || fail=1
import json, sys
rs = [json.loads(l) for l in open(sys.argv[1])]
fm = [r for r in rs if r['service'] == 'lastfm']
lb = [r for r in rs if r['service'] == 'listenbrainz']
bad = [r for r in fm if not r['signed']]
assert not bad, 'unsigned Last.fm calls: %s' % bad[:1]
sent = [r for r in fm if r['method'] == 'track.scrobble' and not r['offline']]
assert [sum(1 for k in r['params'] if k.startswith('timestamp[')) for r in sent] == [50, 10], 'Last.fm batches: %s' % [len(r['params']) for r in sent]
first = sent[0]['params']
assert first['artist[0]'] == 'Band' and first['track[0]'] == 'Alpha' and first['album[0]'] == 'First' and first['duration[0]'] == '200' and first['sk'] == 'sk-ann', first
assert any(r['method'] == 'track.updateNowPlaying' and r['params']['track'] == 'Alpha' for r in fm), 'no now playing on Last.fm'
lbsent = [r['body'] for r in lb if not r['offline']]
kinds = [b['listen_type'] for b in lbsent]
assert kinds[0] == 'playing_now' and kinds[1:] == ['import', 'import'], kinds
assert [len(b['payload']) for b in lbsent[1:]] == [50, 10], [len(b['payload']) for b in lbsent]
m = lbsent[1]['payload'][0]
assert m['listened_at'] == 1700000000 and m['track_metadata']['track_name'] == 'Alpha' and m['track_metadata']['additional_info']['duration_ms'] == 200000, m
assert all(r['auth'] == 'Token lbtoken' for r in lb)
PY
done

# ---- the daemon
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp/song.wav" <<'PY'
import struct, sys
n = 8000 * 40 * 2   # forty seconds of silence, 8 kHz mono 16-bit: long enough to count
open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const r = await ipod.addWith([{ file: dir + '/song.wav', title: 'Alpha', artist: 'Band', album: 'First' }, { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First' }]);
  console.log(r[0].error + r[1].error === '' ? 'ok' : r[0].error + r[1].error);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 SETUP_DIR="$tmp"
out=$("$ZINC" run "$tmp/setup.ts" 2>&1)
[ "$out" = ok ] || { echo "ipod_scrobble: the setup: $out"; exit 1; }
rm -f "$tmp/requests.jsonl"
B=http://127.0.0.1:8689
A='Authorization: Bearer secret'
start() {
  "$ZINC" run examples/ipod-web -- --port 8689 --token secret --user ann --password sesame --mount "$pod" \
    --lastfm-key apikey --lastfm-secret sekrit --lastfm-session sk-ann --listenbrainz-token lbtoken "$@" > "$tmp/daemon.out" 2>&1 &
  pid=$!
  for i in $(seq 1 120); do curl -s "$B/" | grep -q 'Serving' && return 0; sleep 0.5; done
  echo "ipod_scrobble: the daemon did not open the iPod: $(tail -5 "$tmp/daemon.out")"; exit 1
}
stop() { kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''; }
start
alpha=$(curl -s -H "$A" "$B/api/tracks" | python3 -c 'import json,sys; print([t["id"] for t in json.load(sys.stdin)["tracks"] if t["title"] == "Alpha"][0])')
r=$(curl -s -w ' %{http_code}' -H "$A" -H 'Content-Type: application/json' -d "{\"plays\": [{\"id\": \"$alpha\", \"count\": 2, \"at\": 1700000000}]}" "$B/api/played")
[ "$r" = '{"pending": 1}
 202' ] || { echo "ipod_scrobble: /api/played while read only: $r"; fail=1; }
R="$B/rest/scrobble.view?u=ann&p=sesame&v=1.16.1&c=test&f=json&id=tr-$alpha"
curl -s "$R&submission=false" | grep -q '"status":"ok"' || { echo "ipod_scrobble: Subsonic now playing refused"; fail=1; }
curl -s "$R&time=1700000100000" | grep -q '"status":"ok"' || { echo "ipod_scrobble: Subsonic scrobble refused"; fail=1; }
c=$tmp/backups/cache/000A27001234ABCD
for i in $(seq 1 50); do [ "$(grep -c 'track.scrobble\|"import"\|"single"' "$tmp/requests.jsonl" 2>/dev/null)" -ge 2 ] && break; sleep 0.1; done
python3 - "$tmp/requests.jsonl" "$c" <<'PY' || fail=1
import json, sys
rs = [json.loads(l) for l in open(sys.argv[1])]
fm = [r['params']['method'] for r in rs if r['service'] == 'lastfm']
lb = [r['body']['listen_type'] for r in rs if r['service'] == 'listenbrainz']
assert fm == ['track.updateNowPlaying', 'track.scrobble'] and lb == ['playing_now', 'single'], (fm, lb)
assert all(r['signed'] for r in rs if r['service'] == 'lastfm')
plays = json.load(open(sys.argv[2] + '/plays.json'))['plays']
assert [p['count'] for p in plays] == [2, 1] and plays[1]['at'] == 1700000100, plays
h = [json.loads(l) for l in open(sys.argv[2] + '/history.jsonl')]
assert len(h) == 1 and h[0]['source'] == 'subsonic' and h[0]['title'] == 'Alpha' and h[0]['counted'] and h[0]['startedAt'][:4] == '2023', h
PY
stop
start --allow-changes
for i in $(seq 1 40); do [ -f "$c/plays.json" ] || break; sleep 0.25; done
count=$(curl -s -H "$A" "$B/api/tracks" | python3 -c 'import json,sys; print([t["playCount"] for t in json.load(sys.stdin)["tracks"] if t["title"] == "Alpha"][0])')
[ "$count" = 3 ] && [ ! -f "$c/plays.json" ] || { echo "ipod_scrobble: the plays waiting were not written: play count $count, $(tail -3 "$tmp/daemon.out")"; fail=1; }
r=$(curl -s -H "$A" -H 'Content-Type: application/json' -d "{\"plays\": [{\"id\": \"$alpha\", \"count\": 1, \"at\": 1700000200}]}" "$B/api/played")
[ "$r" = '{"counted": 1}' ] || { echo "ipod_scrobble: /api/played with changes allowed: $r"; fail=1; }
stop
[ $fail -eq 0 ] && echo "ipod_scrobble: ok"
exit $fail
