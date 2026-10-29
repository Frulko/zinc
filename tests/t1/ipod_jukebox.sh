#!/bin/sh
# The iPod app's "From jukebox" source (examples/ipod/src/services/jukebox.ts) against a stand-in of jukebox (tests/data/ipod-jukebox/
# stub.py, a free port: the real server is never called) on a fake iPod (a folder with iPod_Control/Device/SysInfo, no USB). Checked
# (tests/data/ipod-jukebox/main.ts): a wrong token refused, Test connection, artists, albums, playlists and search; an album added with
# jukebox's tags and cover, its FLAC song converted by one jukebox job and fetched as the AAC rendition; a playlist whose second song's
# download is cut in the middle (nothing made yet), then added again: the song goes on from its last slice (Range) and the playlist is
# made in jukebox's order; a Subsonic server (no /api/v1) browsed and a song converted while sent (stream?format=aac). Then what the
# stub was asked. Needs ffmpeg or afconvert (an AAC file); skipped (77) without them or the plugin's libraries.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
tmp=$(mktemp -d); stub=''; daemon=''
trap '[ -n "$stub" ] && kill $stub 2>/dev/null; [ -n "$daemon" ] && kill $daemon 2>/dev/null; [ -n "$KEEP" ] && cp -r "$tmp" "$KEEP"; rm -rf "$tmp"' EXIT
python3 - "$tmp" <<'PY'
import struct, sys, zlib
d = sys.argv[1]
def wav(name, seconds, rate):
    n = rate * seconds * 2
    open(d + '/' + name, 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
wav('highway.wav', 2, 8000); wav('long.wav', 10, 8000); wav('aac-source.wav', 2, 44100)
def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b))
raw = b''.join(b'\0' + b'\x20\x60\xe0' * 64 for _ in range(64))   # a 64x64 blue square
open(d + '/cover.png', 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
PY
if command -v ffmpeg >/dev/null; then ffmpeg -loglevel error -i "$tmp/aac-source.wav" -c:a aac -b:a 64k "$tmp/tunnel.m4a" || exit 1
elif command -v afconvert >/dev/null; then afconvert -f m4af -d aac "$tmp/aac-source.wav" "$tmp/tunnel.m4a" || exit 1
else echo "skipped: neither ffmpeg nor afconvert to make an AAC file"; exit 77; fi
cp "$tmp/tunnel.m4a" "$tmp/encore.m4a"
echo 65536 > "$tmp/cut-t3"   # Long Song (160 KB, slices of 64 KB): its second slice is cut halfway, once
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> { await ipod.open(env('POD'), true, '', 'Zinc Pod'); await ipod.save(); await ipod.close(); console.log('ok'); }
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 POD="$pod" IPOD_DEMO_MOUNT="$pod"
out=$("$ZINC" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_jukebox: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
python3 tests/data/ipod-jukebox/stub.py "$tmp" "$tmp/port" & stub=$!
for i in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done
export JUKEBOX_URL=http://127.0.0.1:$(cat "$tmp/port")
fail=0
cat > "$tmp/want" <<'OUT'
refused jukebox refused the token: make one in jukebox (Settings, tokens) and paste it here
connect false Connected to jukebox: 4 songs
artists Neon(2 songs), Other Band(2 songs)
albums Night Drive(Neon)
playlists Road Trip(2 songs)
search Tunnel
album 2 0 0 [] 
track Highway Neon Night Drive Synthwave J. Neon from jukebox Drive 1 2 1 2019 4 118 true .wav
track Tunnel Neon Night Drive Synthwave    2 2 1 2019 0 0 true .m4a
cut 0 1 1 [] Long Song — Other Band: fetch failed: ECONNRESET
resumed 1 1 0 [Road Trip] 
playlist Long Song,Highway
subsonic true Connected to a Subsonic server: 2 artists
subsonic albums Big(Other Band) Road Trip(2 songs) Encore
subsonic add 1 1 0
encore Other Band Big 2 2001 false .m4a
OUT
"$ZINC" run --interp tests/data/ipod-jukebox/main.ts > "$tmp/out" 2>"$tmp/err"
diff "$tmp/want" "$tmp/out" > "$tmp/d" || { echo "ipod_jukebox: $(head -30 "$tmp/d") $(tail -5 "$tmp/err")"; fail=1; }
python3 - "$tmp/requests.jsonl" <<'PY' || fail=1
import json, sys
rs = [json.loads(l) for l in open(sys.argv[1])]
tc = [r['body'] for r in rs if r['path'] == '/api/v1/transcode']
assert tc == [{'ids': ['t2'], 'format': 'aac', 'replace': False}], 'one conversion job, of the FLAC song only: %s' % tc
tunnel = [r['query'].get('rendition') for r in rs if r['path'] == '/api/v1/stream/t2']
assert tunnel == ['r-t2-aac'], 'Tunnel fetched as its AAC rendition: %s' % tunnel
long = [r['range'] for r in rs if r['path'] == '/api/v1/stream/t3']
assert long == ['bytes=0-65535', 'bytes=65536-131071', 'bytes=65536-131071', 'bytes=131072-196607'], 'Long Song resumed at its cut slice: %s' % long
sub = [(r['path'], r['query'].get('format')) for r in rs if r['path'].startswith('/navi/rest/stream') or r['path'].startswith('/navi/rest/download')]
assert sub == [('/navi/rest/stream.view', 'aac')], 'Encore converted while sent by the Subsonic server: %s' % sub
PY
# a remote iPod: the daemon (examples/ipod-web, a free port, --allow-changes) on a second fake iPod; the album goes through /api/add
# and its tags through /api/update
pod2="$tmp/Volumes/REMOTEPOD"
mkdir -p "$pod2/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDF\nFirewireGuid: 0x000A27001234ABCE\n' > "$pod2/iPod_Control/Device/SysInfo"
out=$(POD="$pod2" "$ZINC" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_jukebox: the remote setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
"$ZINC" run examples/ipod-web -- --port "$port" --token secret --allow-changes --mount "$pod2" > "$tmp/daemon.out" 2>&1 & daemon=$!
for i in $(seq 1 120); do curl -s "http://127.0.0.1:$port/" | grep -q 'Serving' && break; sleep 0.5; done
REMOTE=http://127.0.0.1:$port "$ZINC" run --interp tests/data/ipod-jukebox/remote.ts > "$tmp/rout" 2>"$tmp/rerr"
kill $daemon 2>/dev/null; wait $daemon 2>/dev/null; daemon=''
want='remote 2 0 0 
remote Highway Neon Night Drive J. Neon from jukebox 1 2019 4 118 .wav
remote Tunnel Neon Night Drive   2 2019 0 0 .m4a'
[ "$(cat "$tmp/rout")" = "$want" ] || { echo "ipod_jukebox: the remote iPod: $(cat "$tmp/rout") $(tail -5 "$tmp/rerr") $(tail -3 "$tmp/daemon.out")"; fail=1; }
kill $stub 2>/dev/null; wait $stub 2>/dev/null; stub=''
[ $fail -eq 0 ] && echo "ipod_jukebox: ok"
exit $fail
