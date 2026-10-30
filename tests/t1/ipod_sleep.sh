#!/bin/sh
# examples/ipod's sleep timer and wake-up alarm (services/sleep.ts, services/alarm.ts), headless, on a fake iPod folder (four two-minute
# songs and a playlist, Morning), with the app's minutes 120 times faster (IPOD_DEMO_TIME_SCALE=120: each volume step is printed).
#   1. This computer: a song played from Songs, the moon of the bar, 15 minutes: the button shows the time left (14:xx, from the frame's
#      scene dump); in its last 60 s the volume steps down to 0, the music pauses, then the volume is back to 100.
#   2. Sonos (tests/data/sonos/stub_speaker.py, the group Salon at 30): the same on the group; the speaker's log has SetGroupVolume
#      going down to 0, then Pause, then SetGroupVolume 30.
#   3. The alarm (config.json: 07:00 on Wednesdays, the playlist Morning on this computer, a one-minute fade-in from 10 to 40): the clock
#      at 06:55 on Wednesday 2026-10-28, it rings at 07:00 and the volume rises from 10 to 40; at 06:55 on Thursday it does not ring.
#   4. The alarm on Salon (a three-minute fade-in): the group plays Morning, its volume going from 10 up to 40.
# No real speaker is contacted. Skipped (77) without the plugin's libraries. KEEP=dir keeps the shots and the logs.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=''
trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/*.log "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys
n = 8000 * 2 * 120   # two minutes of silence, 8 kHz mono 16-bit
open(sys.argv[1] + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const r = await ipod.addWith([
    { file: dir + '/song.wav', title: 'Alpha', artist: 'Band', album: 'First', trackNr: 1, genre: 'Rock', year: 2001 },
    { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2, genre: 'Rock', year: 2001 },
    { file: dir + '/song.wav', title: 'Delta', artist: 'Band', album: 'First', trackNr: 3, genre: 'Rock', year: 2001 },
    { file: dir + '/song.wav', title: 'Gamma', artist: 'Band', album: 'First', trackNr: 4, genre: 'Rock', year: 2001 }]);
  const errors = r.map((x) => x.error).join('');
  const id = await ipod.createPlaylist('Morning');
  await ipod.setPlaylistTracks(id, r.map((x) => x.id));
  await ipod.save();
  console.log(errors === '' ? `ok ${id}` : errors);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$Z" run "$tmp/setup.ts" 2>"$tmp/setup.err")
case "$out" in "ok "*) playlist=${out#ok };; *) echo "ipod_sleep: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1;; esac
port=$((20000 + ($$ + 57) % 20000))
app=$tmp/app
cp -R examples/ipod "$app" && cp -R examples/ipod-web "$tmp/ipod-web" && rm -rf "$app/build"   # the app imports the daemon's Subsonic module
python3 tests/data/sonos/stub_speaker.py $port "$tmp/sonos.log" > "$tmp/sonos.out" 2>&1 & srv=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null -X POST "http://127.0.0.1:$port/" && break; sleep 0.3; done
cd "$tmp" || exit 2
export IPOD_DEMO_MOUNT="$pod" IPOD_DEMO_TIME_SCALE=120 ZINC_DETERMINISTIC=1 TZ=UTC ZINC_SCALE=1 ZINC_SIZE=1180x760
fail=0
run() {   # run <name> <frames> <shot frames> [env...]: a session of the app with <name>.input (none if missing), its output in <name>.out
  n=$1 f=$2 s=$3; shift 3
  [ -f "$tmp/$n.input" ] || : > "$tmp/$n.input"
  env "$@" ZINC_INPUT="$tmp/$n.input" ZINC_FRAMES=$f ZINC_SHOT="$tmp/$n.png" ZINC_SHOT_FRAMES=$s ZINC_SCENE_DUMP="$tmp/$n-scene" \
    timeout 120 "$Z" run --interp "$app" > "$n.out" 2>&1
}
monotone() {   # monotone <name> <values> <down|up> <last> [fewest]: at least <fewest> (3) values, each below (down) or above (up) the one before, the last <last>
  echo "$2" | awk -v n="$1" -v dir="$3" -v last="$4" -v least="${5:-3}" '{ if (NF < least) { print "ipod_sleep: " n ": only " NF " steps: " $0; exit 1 }
    for (i = 2; i <= NF; i++) if ((dir == "down" && $i >= $(i - 1)) || (dir == "up" && $i <= $(i - 1))) { print "ipod_sleep: " n ": not going " dir ": " $0; exit 1 }
    if ($NF != last) { print "ipod_sleep: " n ": ends at " $NF ", not " last ": " $0; exit 1 } }' || fail=1
}

# ---- 1. this computer: Songs (frame 41), the first song double-clicked (81), the moon (121), 15 minutes (141)
cat > local.input <<'IN'
41 move 60 393
42 down
43 up
81 move 500 212
82 down
83 up
84 down
85 up
121 move 568 32
122 down
123 up
141 move 600 100
142 down
143 up
IN
rm -rf "$tmp/backups"
run local 720 160
python3 "$root/tools/scene-texts" local-scene-160 | grep -qE '^1[34]:[0-5][0-9]$' ||
  { echo "ipod_sleep: the moon does not show the time left at frame 160: $(python3 "$root/tools/scene-texts" local-scene-160 | head -12 | tr '\n' '|')"; fail=1; }
seq=$(grep -E '^(sleep: |volume )' local.out | tr '\n' ';')
case "$seq" in *"sleep: fade from 100;"*"volume 0;sleep: pause;volume 100;sleep: volume back to 100;"*) ;; *) echo "ipod_sleep: this computer: $seq $(tail -3 local.out)"; fail=1;; esac
monotone 'this computer' "$(sed -n '/^sleep: fade/,/^sleep: pause/p' local.out | sed -n 's/^volume //p' | tr '\n' ' ')" down 0

# ---- 2. Sonos: the output button (41), Salon (241: the search has time to answer), Songs (261), the first song (301), the moon (341),
# 15 minutes (361)
cat > sonos.input <<'IN'
41 move 1110 32
42 down
43 up
241 move 1000 107
242 down
243 up
261 move 60 393
262 down
263 up
301 move 500 212
302 down
303 up
304 down
305 up
341 move 568 32
342 down
343 up
361 move 600 100
362 down
363 up
IN
rm -rf "$tmp/backups"
run sonos 1300 380 IPOD_DEMO_SONOS=127.0.0.1:$port
vols=$(grep -oE '^(SetGroupVolume [0-9]+|Pause)' sonos.log | tr '\n' ';')
case "$vols" in *"SetGroupVolume 0;Pause;SetGroupVolume 30;") ;; *) echo "ipod_sleep: Sonos: the speaker got '$vols' $(grep -E '^sleep' sonos.out | tr '\n' ';')"; fail=1;; esac
monotone 'Sonos' "$(echo "$vols" | tr ';' '\n' | sed -n '/^Pause/q;s/^SetGroupVolume //p' | tr '\n' ' ')" down 0 2   # the speaker answers in real time, the frames run on: a few steps

# ---- 3. the alarm on this computer, on its day (Wednesday 2026-10-28 06:55 UTC) and on another (Thursday)
alarm() {   # alarm <output id> <output name> <fade minutes>: a fresh backups folder whose config.json has the alarm
  rm -rf "$tmp/backups"; mkdir -p "$tmp/backups"
  printf '{"alarmOn":true,"alarmTime":"07:00","alarmDays":"3","alarmPlay":"playlist","alarmItem":"%s","alarmItemName":"Morning","alarmOutput":"%s","alarmOutputName":"%s","alarmFadeMin":%s,"alarmFrom":10,"alarmTo":40}\n' "$playlist" "$1" "$2" "$3" > "$tmp/backups/config.json"
}
alarm '' '' 1
run wed 400 300 IPOD_DEMO_NOW=1793170500
seq=$(grep -E '^(alarm: |volume )' wed.out | tr '\n' ';')
case "$seq" in "alarm: ring;volume 10;"*"volume 40;alarm: fade done;") ;; *) echo "ipod_sleep: the alarm on Wednesday: '$seq' $(tail -3 wed.out | cut -c1-300)"; fail=1;; esac
monotone 'the alarm' "$(sed -n 's/^volume //p' wed.out | tr '\n' ' ')" up 40
grep -q 'Wake-up alarm	Morning on this computer' "$tmp/backups/logs/demo.log" || { echo "ipod_sleep: the log has no alarm: $(tail -3 "$tmp/backups/logs/demo.log")"; fail=1; }
alarm '' '' 1
run thu 400 300 IPOD_DEMO_NOW=$((1793170500 + 86400))
grep -q '^alarm: ' thu.out && { echo "ipod_sleep: the alarm rang on Thursday: $(grep '^alarm' thu.out | head -2)"; fail=1; }

# ---- 4. the alarm on Salon: the group plays Morning, its volume from 10 up to 40
mark=$(wc -l < sonos.log)
alarm 'RINCON_A:1' 'Salon' 3
run salon 1500 600 IPOD_DEMO_NOW=1793170500 IPOD_DEMO_SONOS=127.0.0.1:$port
tail -n +$((mark + 1)) sonos.log > salon.log
grep -q '^AddMultipleURIsToQueue 4 ' salon.log && grep -q '^Play' salon.log || { echo "ipod_sleep: the alarm did not play Morning on Salon: $(cut -c1-80 salon.log | tr '\n' ';')"; fail=1; }
monotone 'the alarm on Salon' "$(sed -n 's/^SetGroupVolume //p' salon.log | tr '\n' ' ')" up 40 2
[ "$(sed -n 's/^SetGroupVolume //p' salon.log | head -1)" = 10 ] || { echo "ipod_sleep: the alarm on Salon did not start at 10: $(grep SetGroupVolume salon.log | tr '\n' ';')"; fail=1; }

[ $fail = 0 ] && echo "ipod_sleep: ok"
exit $fail
