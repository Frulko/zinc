#!/bin/sh
# examples/ipod's queue and session on the Mac output, headless (the fake iPod is a folder of four songs, as tests/t1/ipod_sonos.sh makes
# it). The first run opens Songs, plays the first song, plays Delta next from the right-click menu (ZINC_SYSTEM_SCRIPT answers it),
# turns repeat to all, opens the queue panel (shot at frame 300) and closes the window: nothing plays on Sonos, so that quits, within
# its limit, and the quit saved session.json (five entries, Delta marked as added by hand, repeat all, the Mac output). The second run
# shows that session paused (shot at frame 200) and saves the same queue back. KEEP=dir keeps the shots and the logs.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/backups/session.json "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys
n = 8000 * 2 * 20   # twenty seconds of silence, 8 kHz mono 16-bit: the song still plays when the window closes
open(sys.argv[1] + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const r = await ipod.addWith([
    { file: dir + '/song.wav', title: 'Alpha & Co', artist: 'Band', album: 'First', trackNr: 1 },
    { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2 },
    { file: dir + '/song.wav', title: 'Delta', artist: 'Band', album: 'First', trackNr: 3 },
    { file: dir + '/song.wav', title: 'Gamma', artist: 'Band', album: 'First', trackNr: 4 }]);
  console.log(r.map((x) => x.error).join('') === '' ? 'ok' : 'failed');
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$Z" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_queue: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
app=$tmp/app
cp -R examples/ipod "$app" && cp -R examples/ipod-web "$tmp/ipod-web" && rm -rf "$app/build"   # the app imports the daemon's Subsonic module (Share with AudioMuse)
# Songs (61), a double-click on the first song (101), a right click on Delta (161: Play next), repeat (201), the queue button (231),
# the window closed (340)
cat > "$tmp/first.input" <<'IN'
61 move 60 333
62 down
63 up
101 move 500 212
102 down
103 up
104 down
105 up
161 move 500 280
162 right-down
163 right-up
201 move 530 32
202 down
203 up
231 move 967 32
232 down
233 up
340 close
IN
printf '0 dialog-answer play-next\n' > "$tmp/system.script"
printf '200 move 600 400\n' > "$tmp/second.input"
cd "$tmp" || exit 2
export IPOD_DEMO_MOUNT="$pod" ZINC_DETERMINISTIC=1 TZ=UTC ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_FRAMES=100000000
fail=0
ZINC_SYSTEM_SCRIPT="$tmp/system.script" ZINC_INPUT="$tmp/first.input" ZINC_SHOT="$tmp/queue.png" ZINC_SHOT_FRAMES=300 timeout 60 "$Z" run --interp "$app" > first.out 2>&1 &
pid=$!
# the close comes at frame 340; the quit then has 3 s
for i in $(seq 1 450); do kill -0 $pid 2>/dev/null || break; sleep 0.1; done
if kill -0 $pid 2>/dev/null; then echo "ipod_queue: the app still runs 45 s after its window closed: $(tail -3 first.out)"; kill $pid; fail=1; fi
wait $pid 2>/dev/null; pid=''
s=$tmp/backups/session.json
got=$(python3 -c "import json; d = json.load(open('$s')); print(len(d['ids']), d['manual'], d['at'], d['repeat'], repr(d['output']), d['ids'][1] == d['ids'][3])" 2>&1)
[ "$got" = "5 [0, 1, 0, 0, 0] 0 all '' True" ] || { echo "ipod_queue: the session saved at the quit: $got"; fail=1; }
[ -f queue-300.png ] || { echo "ipod_queue: no shot of the queue panel: $(tail -3 first.out)"; fail=1; }
cp "$s" first.json
# started again: the session shown paused, the same queue saved back; closed at once (nothing plays)
printf '200 move 600 400\n230 close\n' > "$tmp/second.input"
ZINC_INPUT="$tmp/second.input" ZINC_SHOT="$tmp/resumed.png" ZINC_SHOT_FRAMES=200 timeout 60 "$Z" run --interp "$app" > second.out 2>&1
again=$(python3 -c "import json; a = json.load(open('first.json')); b = json.load(open('$s')); print(all(a[k] == b[k] for k in ['ids', 'manual', 'at', 'repeat', 'output']), b['playing'])" 2>&1)
[ "$again" = "True False" ] || { echo "ipod_queue: the session started again: $again"; fail=1; }
[ $fail = 0 ] && echo "ipod_queue: ok"
exit $fail
