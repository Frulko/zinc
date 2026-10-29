#!/bin/sh
# examples/ipod's remote iPod: the iPod daemon (examples/ipod-web, --allow-changes, port 8688) serves a fake iPod (a folder with
# iPod_Control/Device/SysInfo and two songs, one with a cover, put there by a small program), and the app, headless, connects to it at
# start (IPOD_DEMO_REMOTE). Checked: the remote iPod opens (the log), the songs page lists its two songs (a frame hash), a double-click
# plays the first one (its file fetched into the cache), the second is deleted (Allow changes, the question answered) and a file dropped
# is uploaded: the daemon ends with 2 songs, Alpha and the new one. The iPod's cache (by its FireWire GUID) holds the song played, the
# covers shown and the library. A Genius list kept in the cache is opened on the Playlists page and saved through the daemon
# (POST /api/playlist): the daemon has the playlist after.
# Port 8688 (a fixed port: run alone). Skipped (77) without the plugin's libraries. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$root/tests/golden/ipod-demo/remote.txt
tmp=$(mktemp -d); pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/backups/logs/* "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
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
    { file: dir + '/song.wav', title: 'Alpha', artist: 'Band', album: 'First', trackNr: 1, genre: 'Rock', year: 2001, artworkFile: dir + '/cover.png' },
    { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2, genre: 'Rock', year: 2001 }]);
  console.log(r[0].error + r[1].error === '' ? 'ok' : r[0].error + r[1].error);
  await ipod.close();
}
main();
TS
# the daemon and the app see only the fake iPod's folder, and no USB
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$Z" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_remote: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
cp "$tmp/song.wav" "$tmp/new-song.wav"
B=http://127.0.0.1:8688
"$Z" run examples/ipod-web -- --port 8688 --token secret --allow-changes --mount "$pod" > "$tmp/daemon.out" 2>&1 &
pid=$!
for i in $(seq 1 120); do curl -s "$B/" | grep -q 'Serving' && break; sleep 0.5; done
curl -s "$B/" | grep -q ': 2 songs' || { echo "ipod_remote: the daemon did not open the iPod: $(tail -5 "$tmp/daemon.out")"; exit 1; }
fail=0
# the app: connects at start, Allow changes (frame 40), Songs (60), a double-click on the first song (100), the second selected (120)
# and deleted (130), a file dropped (tick 1000: a tick is a pass of the event loop, several per frame)
cat > "$tmp/session.input" <<'IN'
41 move 196 107
42 down
43 up
61 move 60 363
62 down
63 up
101 move 500 212
102 down
103 up
104 down
105 up
121 move 500 246
122 down
123 up
131 move 818 122
132 down
133 up
151 move 60 513
152 down
153 up
171 move 350 237
172 down
173 up
191 move 1089 148
192 down
193 up
IN
# a Genius list asked earlier (drafts.ts keeps them in genius.json): opened on the Playlists page (170) and saved to the iPod (190)
alpha=$(curl -s -H 'Authorization: Bearer secret' "$B/api/tracks" | python3 -c 'import json,sys; print([t["id"] for t in json.load(sys.stdin)["tracks"] if t["title"] == "Alpha"][0])')
mkdir -p "$tmp/backups/cache/000A27001234ABCD"
printf '[{"kind": "draft", "id": "draft:genius:%s:25", "title": "Genius Alpha", "subtitle": "", "tracks": ["%s"], "at": 0, "why": ["the song it starts from"]}]' \
  "$alpha" "$alpha" > "$tmp/backups/cache/000A27001234ABCD/genius.json"
printf '0 dialog-answer 0\n1000 drop %s\n' "$tmp/new-song.wav" > "$tmp/system.script"   # the answer: Delete, to Delete's question
cd "$tmp" || exit 2
IPOD_DEMO_REMOTE=$B IPOD_DEMO_REMOTE_TOKEN=secret IPOD_DEMO_MOUNT="$tmp/none" ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 TZ=UTC \
  ZINC_SYSTEM_SCRIPT="$tmp/system.script" ZINC_INPUT="$tmp/session.input" ZINC_FRAMES=400 ZINC_FRAMEHASH=all ZINC_SHOT="$tmp/page.png" ZINC_SHOT_FRAMES=30,95,140,170,190,390 \
  timeout 60 "$Z" run --interp "$root/examples/ipod" > app.out 2>&1 || { echo "ipod_remote: the app failed: $(tail -5 app.out)"; exit 1; }
hash_at() { awk -v f="$1" '$2 == "framehash" && $3 + 0 <= f + 0 { h = $5 } END { print f, h }' "$2"; }
hash_at 95 app.out > remote.txt
[ -n "$UPDATE" ] && cp remote.txt "$gold"
cmp -s remote.txt "$gold" || { echo "ipod_remote: the songs page $(cat remote.txt), recorded $(cat "$gold")"; fail=1; }
log=$tmp/backups/logs/demo.log
for op in 'Opened ZINCPOD (remote)' '2 tracks, 1 playlists' 'Allow changes turned on' '1 track removed' '1 added'; do
  grep -q "$op" "$log" || { echo "ipod_remote: '$op' is not in the log file: $(tail -3 "$log")"; fail=1; }
done
# the iPod's cache, by its FireWire GUID: the song played, the cover shown (Alpha's), the library and the daemon's status that names it
c=$tmp/backups/cache/000A27001234ABCD
ls "$c/audio/"*.wav >/dev/null 2>&1 || { echo "ipod_remote: the song played was not fetched into the cache: $(ls -R "$tmp/backups/cache" 2>&1 | head -20)"; fail=1; }
ls "$c/covers/"*.png >/dev/null 2>&1 && grep -q '"title":"Alpha"' "$c/library.json" || { echo "ipod_remote: no cover or library in the cache: $(ls -R "$c" 2>&1 | head -20)"; fail=1; }
curl -s -H 'Authorization: Bearer secret' "$B/api/status" | grep -q '"firewireGuid":"000A27001234ABCD","marker":"[0-9]*:[0-9]*"' || { echo "ipod_remote: /api/status has no GUID or marker: $(curl -s -H 'Authorization: Bearer secret' "$B/api/status")"; fail=1; }
titles=$(curl -s -H 'Authorization: Bearer secret' "$B/api/tracks" | grep -o '"title":"[^"]*"' | tr '\n' ' ')
case $titles in *Alpha*Beta*|*Beta*) echo "ipod_remote: Beta was not deleted: $titles"; fail=1 ;; esac
curl -s "$B/" | grep -q ': 2 songs' || { echo "ipod_remote: the delete and the add did not leave 2 songs: $titles"; fail=1; }
saved=$(curl -s -H 'Authorization: Bearer secret' "$B/api/playlists" | python3 -c 'import json,sys; print([p["trackIds"] for p in json.load(sys.stdin)["playlists"] if p["name"] == "Genius Alpha" and not p["smart"]])')
[ "$saved" = "[['$alpha']]" ] || { echo "ipod_remote: the Genius list was not saved through the daemon: $saved $(grep -i genius "$log" | tail -3)"; fail=1; }
grep -q '1 song in the playlist “Genius Alpha”' "$log" || { echo "ipod_remote: no save in the log: $(tail -3 "$log")"; fail=1; }
kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
[ $fail -eq 0 ] && echo "ipod_remote: ok"
exit $fail
