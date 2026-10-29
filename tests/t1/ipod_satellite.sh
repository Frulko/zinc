#!/bin/sh
# The iPod daemon (examples/ipod-web) as a read-only jukebox satellite, on a fake iPod (a folder, no USB) with two songs: the routes
# of jukebox's contract (music-lib-manager docs/architecture.md "Satellites"; the shapes of its reference apps/satellite/src/serve.ts
# and of what apps/server/test/api.test.ts and acquire.test.ts send and read): /satellite, /devices, /devices/:id, /devices/:id/tracks
# paged, the token, the errors in jukebox's shape, a song fetched by its sourceUrl with no header (as acquire.ts does), jobs refused;
# and the iPod announced to a stand-in of jukebox (tests/data/ipod-jukebox/stub.py) with --jukebox: POST /devices then PUT the tracks
# with the jukebox token. Free ports. Skipped (77) without the plugin's libraries.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
tmp=$(mktemp -d); stub=''; pid=''
trap '[ -n "$stub" ] && kill $stub 2>/dev/null; [ -n "$pid" ] && kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp/song.wav" <<'PY'
import struct, sys
n = 8000 * 2 * 2
open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const r = await ipod.addWith([{ file: dir + '/song.wav', title: 'Highway', artist: 'Neon', album: 'Night Drive', trackNr: 1 },
    { file: dir + '/song.wav', title: 'Lost B-side', artist: 'Forgotten Band', album: 'Demo Tape' }]);
  console.log(r[0].error + r[1].error === '' ? 'ok' : r[0].error + r[1].error);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$ZINC" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_satellite: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
python3 tests/data/ipod-jukebox/stub.py "$tmp" "$tmp/port" & stub=$!
for i in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done
J=http://127.0.0.1:$(cat "$tmp/port")
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
B=http://127.0.0.1:$port
"$ZINC" run examples/ipod-web -- --port "$port" --token secret --mount "$pod" --url "$B" --jukebox "$J" --jukebox-token jbtoken > "$tmp/daemon.out" 2>&1 & pid=$!
for i in $(seq 1 120); do curl -s "$B/" | grep -q 'Serving' && break; sleep 0.5; done
for i in $(seq 1 40); do grep -q 'reported to jukebox' "$tmp/daemon.out" && break; sleep 0.25; done
fail=0
for p in /satellite /devices /devices/ipod-000A27001234ABCD /devices/ipod-000A27001234ABCD/tracks; do
  curl -s "$B$p" -o "$tmp/$(echo "$p" | tr / _).json"
done
curl -s -H 'Authorization: Bearer nope' -w '%{http_code}' "$B/satellite" > "$tmp/refused"
curl -s -H 'Authorization: Bearer secret' -w '%{http_code}' -X POST -d '{}' "$B/devices/ipod-000A27001234ABCD/jobs" > "$tmp/jobs"
python3 - "$tmp" "$B" <<'PY' || fail=1
import json, os, sys, urllib.request
d, B = sys.argv[1], sys.argv[2]
def get(path, token='secret'):
    r = urllib.request.Request(B + path, headers={'Authorization': 'Bearer ' + token} if token else {})
    try:
        with urllib.request.urlopen(r) as f: return f.status, f.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
# 127.0.0.1 with --token given: refused without it, in jukebox's error shape
assert json.load(open(d + '/_satellite.json')) == {'error': {'code': 'unauthorized', 'message': 'a token is needed: Authorization: Bearer <token>, or ?token=<token>'}}
assert open(d + '/refused').read().endswith('401')
s, body = get('/satellite'); sat = json.loads(body)
assert s == 200 and sat['id'].startswith('sat-') and sat['api'] == '1.0' and sat['families'] == ['device'] and sat['url'] == B, sat   # serve.ts /satellite
s, body = get('/devices'); devs = json.loads(body)['items']
assert len(devs) == 1, devs
dev = devs[0]
for k in ('id', 'name', 'kind', 'capacity', 'battery', 'charging', 'acceptedFormats', 'model', 'serial', 'firmware', 'free'):
    assert k in dev, (k, dev)   # serve.ts /devices, and what app.ts POST /devices stores
assert dev['id'] == 'ipod-000A27001234ABCD' and dev['name'] == 'Zinc Pod' and dev['kind'] == 'ipod-classic' and dev['capacity'] > 0, dev
assert dev['acceptedFormats'] == ['mp3', 'aac', 'alac', 'wav', 'aiff'], dev
assert json.loads(get('/devices/ipod-000A27001234ABCD')[1]) == dev
s, body = get('/devices/ipod-other')
assert s == 404 and json.loads(body)['error']['code'] == 'not_found', body
first = json.loads(get('/devices/ipod-000A27001234ABCD/tracks?limit=1')[1])
second = json.loads(get('/devices/ipod-000A27001234ABCD/tracks?limit=1&cursor=' + first['next'])[1])
items = first['items'] + second['items']
assert first['next'] == '1' and second['next'] is None and len(items) == 2, (first, second)
assert json.loads(get('/devices/ipod-000A27001234ABCD/tracks')[1])['items'] == items
for t in items:   # serve.ts DeviceTrack, and what app.ts PUT /devices/:id/tracks reads
    for k in ('deviceLocalId', 'name', 'artist', 'album', 'duration', 'size', 'format', 'sourceUrl'):
        assert k in t, (k, t)
    assert t['format'] == 'wav' and t['duration'] == 2 and t['size'] > 0, t
    with urllib.request.urlopen(t['sourceUrl']) as f:   # acquire.ts: fetch(t.sourceUrl), no header
        assert f.read() == open(d + '/song.wav', 'rb').read()
assert sorted(t['name'] for t in items) == ['Highway', 'Lost B-side'], items
assert open(d + '/jobs').read().endswith('405')
# the announce: POST /devices then PUT /devices/:id/tracks, with the jukebox token
rs = [json.loads(l) for l in open(d + '/requests.jsonl')]
reg = [r for r in rs if r['method'] == 'POST' and r['path'] == '/api/v1/devices']
put = [r for r in rs if r['method'] == 'PUT' and r['path'] == '/api/v1/devices/ipod-000A27001234ABCD/tracks']
assert len(reg) == 1 and reg[0]['auth'] == 'Bearer jbtoken' and reg[0]['body']['satelliteId'].startswith('sat-'), reg
assert {k: v for k, v in reg[0]['body'].items() if k != 'satelliteId'} == dev, reg
assert len(put) == 1 and put[0]['body']['items'] == items, put
PY
grep -q 'ipod-web: 2 tracks reported to jukebox .*"received": 2, "matched": 1, "orphans": 1' "$tmp/daemon.out" || { echo "ipod_satellite: no report line: $(tail -5 "$tmp/daemon.out")"; fail=1; }
kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
kill $stub 2>/dev/null; wait $stub 2>/dev/null; stub=''
[ $fail -eq 0 ] && echo "ipod_satellite: ok"
exit $fail
