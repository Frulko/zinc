#!/bin/sh
# The iPod app's queue on a Sonos group (examples/ipod/src/services/player.ts, driven by tests/data/ipod-sonos-queue/main.ts without the
# UI) against the made-up speaker of tests/data/sonos/stub_speaker.py (--house: Salon and Bureau; --transition: a Seek to a time right
# after Play is refused with 701, as a starting speaker does), on a fake iPod folder of 40 songs: a list played from its 11th song is
# put on the group whole (the songs before it added in front, at a position), 1,100 entries are paged in, a saved session's group read
# while a list starts does not take the group back, and 12 s into a song the output switched to Bureau goes on there from 0:00:12.
# No real speaker and no network discovery (IPOD_DEMO_SONOS). Skipped (77) without the plugin's libraries. KEEP=dir keeps the logs.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=''
trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.out "$tmp"/*.log "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys
n = 8000 * 2   # a second of silence, 8 kHz mono 16-bit
open(sys.argv[1] + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const items: ipod.TrackInput[] = [];
  for (let i = 1; i <= 40; i++) items.push({ file: dir + '/song.wav', title: `Song ${i < 10 ? '0' : ''}${i}`, artist: 'Band', album: 'Forty', trackNr: i, genre: 'Rock', year: 2001 });
  const r = await ipod.addWith(items);
  await ipod.save();
  const errors = r.map((x) => x.error).join('');
  console.log(errors === '' ? 'ok' : errors);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$(timeout 60 "$Z" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_sonos_queue: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
python3 tests/data/sonos/stub_speaker.py 0 "$tmp/sonos.log" --house --transition > "$tmp/sonos.out" 2>&1 & srv=$!
for i in $(seq 1 50); do [ -s "$tmp/sonos.log.port" ] && curl -s -o /dev/null -X POST "http://127.0.0.1:$(cat "$tmp/sonos.log.port")/" && break; sleep 0.1; done
cat > "$tmp/want" <<'OUT'
before true 40 true 0
paged true 1100 true 0
attach false true 40 true 0
moved true no error
OUT
IPOD_DEMO_SONOS=127.0.0.1:$(cat "$tmp/sonos.log.port") timeout 120 "$Z" run tests/data/ipod-sonos-queue/main.ts > "$tmp/run.out" 2>"$tmp/run.err"
fail=0
diff "$tmp/want" "$tmp/run.out" > "$tmp/diff" || { echo "ipod_sonos_queue: $(cat "$tmp/diff") $(grep -v '^  ' "$tmp/run.err" | tail -3)"; fail=1; }
log=$tmp/sonos.log
# the 11th song first: 16 entries put, played, then the 10 before it in front (at 1) and the 14 after it at the end
grep -qE '^AddMultipleURIsToQueue 10 .* 1 0$' "$log" || { echo "ipod_sonos_queue: the songs before were not added in front: $(grep -c '^AddMultipleURIsToQueue' "$log") adds"; fail=1; }
# Bureau: its queue played, then the song sought to where it was on Salon (refused while the group starts, then asked again)
awk '/^SetAVTransportURI x-rincon-queue:RINCON_B#0/ { b = 1 } b && /^Seek REL_TIME 0:00:12$/ { ok = 1 } END { exit !ok }' "$log" ||
  { echo "ipod_sonos_queue: the position was not carried to Bureau: $(grep -E '^(SetAVTransportURI|Seek)' "$log" | tail -6 | tr '\n' ';')"; fail=1; }
[ $fail -eq 0 ] && echo "ipod_sonos_queue: ok"
exit $fail
