#!/bin/sh
# examples/ipod's "Share with AudioMuse", headless, on a fake iPod (two songs, as tests/t1/ipod_web.sh makes them): config.json has
# sharing on, so the app serves the daemon's Subsonic module on its own port at start. AudioMuse-AI's calls (apiKey, f=json): ping,
# search3 with an empty query, a song's fields, a playlist write refused while Allow changes is off (50), a bad key (44), no other path
# than /rest. Started again with Allow changes clicked on: createPlaylist and updatePlaylist as AudioMuse sends them, and the playlist
# is on the iPod's database once the app has quit. A free port. Skipped (77) without the plugin's libraries.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device" "$tmp/backups"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 -c "import struct, sys; n = 32000; open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)" "$tmp/song.wav"
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  await ipod.open(env('SETUP_DIR') + '/Volumes/ZINCPOD', env('READ') === '', '', 'Zinc Pod');
  if (env('READ') !== '') { for (const p of await ipod.playlists()) if (!p.master) console.log(p.name, p.trackIds.length); await ipod.close(); return; }
  const r = await ipod.addWith([
    { file: env('SETUP_DIR') + '/song.wav', title: 'Alpha', artist: 'Band', album: 'First', trackNr: 1 },
    { file: env('SETUP_DIR') + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2 }]);
  console.log(r[0].error + r[1].error === '' ? 'ok' : r[0].error + r[1].error);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$Z" run "$tmp/setup.ts" 2>&1)
[ "$out" = ok ] || { echo "the setup: $out"; exit 1; }
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("", 0)); print(s.getsockname()[1])')
printf '{"shareOn": true, "sharePort": %s, "shareUser": "muse", "sharePassword": "pw", "shareApiKey": "k3y"}\n' "$port" > "$tmp/backups/config.json"
R="http://127.0.0.1:$port/rest"; K='apiKey=k3y&v=1.16.1&c=AudioMuse-AI&f=json'
start() {   # the app, until its Subsonic port answers
  (cd "$tmp" && IPOD_DEMO_MOUNT="$pod" ZINC_DETERMINISTIC=1 ZINC_FRAMES=100000000 ZINC_INPUT="$1" exec timeout 120 "$Z" run --interp "$root/examples/ipod" > "$tmp/app.out" 2>&1) &
  pid=$!
  for i in $(seq 1 240); do curl -s "$R/search3.view?$K&query=" | grep -q '"title":"Beta"' && return 0; sleep 0.5; done
  echo "the app does not share the iPod: $(tail -5 "$tmp/app.out")"; exit 1
}
stop() { kill $pid 2>/dev/null; for i in $(seq 1 40); do kill -0 $pid 2>/dev/null || break; sleep 0.1; done; pid=''; }
fail=0
want() { case $3 in $2) ;; *) echo "$1: $(echo "$3" | tail -c 400)"; fail=1 ;; esac; }

: > "$tmp/none.input"
start "$tmp/none.input"
want 'ping' '{"subsonic-response":{"status":"ok"*' "$(curl -s "$R/ping.view?u=muse&p=enc:7077&v=1.16.1&c=AudioMuse-AI&f=json")"
a=$(curl -s "$R/search3.view?$K&query=&songCount=1&songOffset=0" | sed 's/.*"song":\[{"id":"\([^"]*\)".*/\1/')
want 'the song' '*"albumArtist":"Band"*"path":"/iPod/000A27001234ABCD/iPod_Control/Music/*' "$(curl -s "$R/getSong.view?$K&id=$a")"
want 'read only' '*"code":50*' "$(curl -s -X POST "$R/createPlaylist.view?$K&name=Mix_instant&songId=$a")"
want 'bad key' '*"code":44*' "$(curl -s "$R/ping.view?apiKey=nope&f=json")"
want 'not /rest' 404 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/")"
stop

printf '41 move 196 107\n42 down\n43 up\n' > "$tmp/allow.input"   # Allow changes, in the sidebar
start "$tmp/allow.input"
made=''
for i in $(seq 1 60); do made=$(curl -s -X POST "$R/createPlaylist.view?$K&name=Mix_instant&songId=$a"); case $made in *'"status":"ok"'*) break ;; esac; sleep 0.5; done
want 'createPlaylist' '*"playlist":{"id":"pl-*","name":"Mix_instant","songCount":1*' "$made"
pl=$(echo "$made" | sed 's/.*"playlist":{"id":"\([^"]*\)".*/\1/')
want 'updatePlaylist' '*"status":"ok"*' "$(curl -s -X POST "$R/updatePlaylist.view?$K&playlistId=$pl&songIdToAdd=$a&public=true")"
stop
want 'on the iPod' 'Mix_instant 2' "$(READ=1 "$Z" run "$tmp/setup.ts" 2>&1)"
[ $fail -eq 0 ] && echo "ipod_share: ok"
exit $fail
