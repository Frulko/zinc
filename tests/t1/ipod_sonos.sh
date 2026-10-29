#!/bin/sh
# examples/ipod plays on Sonos, headless, against a made-up speaker (tests/data/sonos/stub_speaker.py: one group, Salon, on a free local
# port, which the app reaches as IPOD_DEMO_SONOS=127.0.0.1:<port>). The fake iPod is a folder (two songs, the first with a
# cover, as tests/t1/ipod_remote.sh makes them). The session opens the output menu, picks Salon, opens Songs and double-clicks the first
# song. Checked in the speaker's log: the queue cleared, the song queued with the URL of the app's own server (a token in the path) and a
# musicTrack DIDL carrying its title, artist and album, the queue played from its first entry; then, as a real speaker would, a GET of
# that URL with a byte range answers 206 with the file's first bytes, the cover is a PNG, and a path out of the iPod or without the
# token is a 404. No real speaker is contacted. Skipped (77) without the plugin's libraries. KEEP=dir keeps the shots and the logs.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=''; pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; [ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/*.log "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys, zlib
d = sys.argv[1]
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(d + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b))
raw = b''.join(b'\0' + b'\xfa\x2d\x48' * 64 for _ in range(64))   # a 64x64 red square
open(d + '/cover.png', 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
PY
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const r = await ipod.addWith([
    { file: dir + '/song.wav', title: 'Alpha & Co', artist: 'Band', album: 'First', trackNr: 1, genre: 'Rock', year: 2001, artworkFile: dir + '/cover.png' },
    { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2, genre: 'Rock', year: 2001 }]);
  console.log(r[0].error + r[1].error === '' ? 'ok' : r[0].error + r[1].error);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$Z" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_sonos: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
port=$((20000 + ($$ + 91) % 20000))
app=$tmp/app
cp -R examples/ipod "$app" && rm -rf "$app/build"
python3 tests/data/sonos/stub_speaker.py $port "$tmp/sonos.log" --fetch > "$tmp/sonos.out" 2>&1 & srv=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null -X POST "http://127.0.0.1:$port/" && break; sleep 0.3; done
# the output button (frame 41), Salon in its menu (frame 141: the search answered), Songs (161), a double-click on the first song (201);
# the app runs until the speaker's fetches are done (ZINC_DETERMINISTIC: the frames follow the input, the network the wall clock)
cat > "$tmp/session.input" <<'IN'
41 move 1110 32
42 down
43 up
141 move 1000 107
142 down
143 up
161 move 60 303
162 down
163 up
201 move 500 212
202 down
203 up
204 down
205 up
IN
cd "$tmp" || exit 2
IPOD_DEMO_SONOS=127.0.0.1:$port ZINC_DETERMINISTIC=1 TZ=UTC IPOD_DEMO_MOUNT="$pod" ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_INPUT="$tmp/session.input" \
  ZINC_FRAMES=100000000 ZINC_SHOT="$tmp/page.png" ZINC_SHOT_FRAMES=140,400 timeout 90 "$Z" run --interp "$app" > app.out 2>&1 &
pid=$!
# the speaker's last fetch, then the app is stopped (its server lives as long as it runs)
for i in $(seq 1 600); do grep -q '^no token' "$tmp/sonos.log" 2>/dev/null && break; kill -0 $pid 2>/dev/null || break; sleep 0.1; done
sleep 0.5; kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
fail=0
log=$tmp/sonos.log
want() { grep -qE "$1" "$log" || { echo "ipod_sonos: the speaker's log has no $2: $(tr '\n' ';' < "$log" | cut -c1-600)"; fail=1; }; }
want '^RemoveAllTracksFromQueue' 'cleared queue'
want "^AddURIToQueue http://127\.0\.0\.1:[0-9]+/[0-9a-f]{32}/file/[^ ]+ <DIDL-Lite.*<res protocolInfo=\"http-get:\*:audio/wav:\*\"" 'song queued by its URL'
want '<dc:title>Alpha &amp; Co</dc:title><upnp:class>object\.item\.audioItem\.musicTrack</upnp:class><dc:creator>Band</dc:creator><upnp:album>First</upnp:album><upnp:albumArtURI>http://' 'musicTrack DIDL'
want '^SetAVTransportURI x-rincon-queue:RINCON_A#0' 'queue played'
want '^Seek TRACK_NR 1' 'first entry'
want '^Play' 'Play'
want '^fetch 206 bytes 0-3/32044 52494646$' 'ranged GET of the song (206, RIFF)'
want '^cover 200 image/png [0-9]+' 'cover'
want '^traversal 404$' '404 for a path out of the iPod'
want '^no token 404$' '404 without the token'
[ $fail = 0 ] && echo "ipod_sonos: ok"
exit $fail
