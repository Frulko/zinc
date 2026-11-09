#!/bin/sh
# examples/ipod's listening service (src/services/listening.ts), headless, on a fake iPod folder with two 40 s songs: Alpha played from
# Songs (frame 81) for 24 s of the virtual clock, past half its length, then Beta double-clicked (frame 1521), which leaves Alpha.
# Checked in the iPod's cache folder (by its FireWire GUID): plays.json holds one play of Alpha (Allow changes is off, so it waits
# there for the iPod), and history.jsonl one line for Alpha, counted and not skipped, from this computer, heard 20 to 26 s. No service
# is signed in: nothing leaves the machine. Skipped (77) without the plugin's libraries. KEEP=dir keeps the output.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
trap '[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.out "$tmp"/backups/cache/*/*.json* "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys
n = 8000 * 2 * 40   # forty seconds of silence, 8 kHz mono 16-bit: longer than the 30 s a listen needs
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
    { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2, genre: 'Rock', year: 2001 }]);
  const errors = r.map((x) => x.error).join('');
  await ipod.save();
  console.log(errors === '' ? `ok ${r[0].id}` : errors);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$(timeout 60 "$Z" run "$tmp/setup.ts" 2>"$tmp/setup.err")
case "$out" in "ok "*) alpha=${out#ok };; *) echo "ipod_listening: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1;; esac
cd "$tmp" || exit 2
# Songs (frame 41), Alpha double-clicked (81), Beta double-clicked 24 s later (1521)
cat > session.input <<'IN'
41 move 60 393
42 down
43 up
81 move 500 212
82 down
83 up
84 down
85 up
1521 move 500 246
1522 down
1523 up
1524 down
1525 up
IN
IPOD_DEMO_MOUNT="$pod" ZINC_DETERMINISTIC=1 TZ=UTC ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_INPUT="$tmp/session.input" ZINC_FRAMES=1600 \
  timeout 120 "$Z" run --interp "$root/examples/ipod" > app.out 2>&1 || { echo "ipod_listening: the app failed: $(tail -5 app.out)"; exit 1; }
python3 - "$tmp/backups/cache/000A27001234ABCD" "$alpha" > check.out 2>&1 <<'PY' || { echo "ipod_listening: $(tail -1 check.out)"; exit 1; }
import json, os, sys
d, alpha = sys.argv[1], sys.argv[2]
plays = json.load(open(os.path.join(d, 'plays.json')))['plays']
assert [(p['id'], p['count']) for p in plays] == [(alpha, 1)], 'plays.json: %s' % plays
lines = [json.loads(l) for l in open(os.path.join(d, 'history.jsonl'))]
mine = [l for l in lines if l['trackId'] == alpha]
assert len(mine) == 1, 'history.jsonl: %s' % lines
l = mine[0]
assert l['title'] == 'Alpha' and l['counted'] and not l['skipped'] and l['source'] == 'mac' and 20000 <= l['heardMs'] <= 26000, 'history.jsonl: %s' % l
PY
echo "ipod_listening: ok"
