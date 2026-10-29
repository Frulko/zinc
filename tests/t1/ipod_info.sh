#!/bin/sh
# examples/ipod's Info window (Get Info), headless, on a fake iPod of three songs (tests/data/ipod-info: one album, each its own comment
# and year, no grouping). The session (tests/data/ipod-info/session.input): Allow changes, Songs, Alpha clicked, Cmd+I (frame 70: one
# song, Details), Escape; Alpha then Cmd-click Beta, Cmd+I (frame 120: 2 songs, Comments and Year Mixed), "Live" typed in Grouping
# (frame 140: its box ticked, "1 field will be applied"), OK. Checked: the iPod's database after: Alpha and Beta grouped Live, their
# comments and years as they were, Gamma untouched; the log says the job wrote 1 field to 2 songs; the three frames against
# tests/golden/ipod-demo/info.txt. Skipped (77) without the plugin's libraries. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$root/tests/golden/ipod-demo/info.txt
tmp=$(mktemp -d)
trap '[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(sys.argv[1] + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$(INFO_MODE=fill timeout 120 "$Z" run "$root/tests/data/ipod-info" 2>"$tmp/setup.err")
[ "$out" = 'filled 3' ] || { echo "ipod_info: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
cd "$tmp" || exit 2
frames="70 120 140"
IPOD_DEMO_MOUNT=$pod ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 TZ=UTC ZINC_FRAMES=260 ZINC_INPUT="$root/tests/data/ipod-info/session.input" \
  ZINC_FRAMEHASH=all ZINC_SHOT="$tmp/info.png" ZINC_SHOT_FRAMES=$(echo $frames | tr ' ' ',') timeout 120 "$Z" run --interp "$root/examples/ipod" > session.out 2>&1 \
  || { echo "ipod_info: the session failed: $(tail -5 session.out)"; exit 1; }
fail=0
hash_at() { awk -v f="$1" '$2 == "framehash" && $3 + 0 <= f + 0 { h = $5 } END { print h }' session.out; }
for f in $frames; do echo "$f $(hash_at $f)"; done > info.txt
cat > want <<'OUT'
Alpha [Live] Rock 2001 one 0 false
Beta [Live] Rock 2002 two 0 false
Gamma [] Rock 2003 three 0 false
OUT
INFO_MODE=read timeout 120 "$Z" run "$root/tests/data/ipod-info" > db.out 2>"$tmp/read.err"
cmp -s db.out want || { echo "ipod_info: the iPod's database: $(tr '\n' '|' < db.out) $(tail -2 "$tmp/read.err")"; fail=1; }
grep -q '1 field written to 2 songs' "$tmp/backups/logs/demo.log" 2>/dev/null || { echo "ipod_info: no job in the log: $(tail -3 "$tmp/backups/logs/demo.log" 2>&1)"; fail=1; }
[ -n "$UPDATE" ] && cp info.txt "$gold"
cmp -s info.txt "$gold" || { echo "ipod_info: frames $(tr '\n' ' ' < info.txt), recorded $(tr '\n' ' ' < "$gold" 2>/dev/null)"; fail=1; }
[ $fail -eq 0 ] && echo "ipod_info: ok"
exit $fail
