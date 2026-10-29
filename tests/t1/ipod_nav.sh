#!/bin/sh
# examples/ipod's history and search, headless, on a fake iPod (a folder, as ipod_remote's) of 40 albums filled by tests/data/ipod-nav.
# The session (tests/data/ipod-nav/session.input): the album grid scrolled (frame 90), an album opened (110), Cmd+[ (130: the grid at the
# same offset), "elan" typed in the albums' search (160: Élan Vital, found without its accent), Cmd+K and "cafe"
# (190: a song, an album, an artist and a playlist), Down and Enter (220: that album opened), Cmd+[ (240: the searched grid again, the
# frame of 160 but for the caret: the field typed into still has the focus at 160), Cmd+K then Escape (260: closed, the same frame as 240). Checked: 90 and 130 alike below the top bar (its › is on at
# 130), the two pairs of equal frames, and each frame's hash against tests/golden/ipod-demo/nav.txt.
# Skipped (77) without the plugin's libraries. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$root/tests/golden/ipod-demo/nav.txt
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
out=$(timeout 120 "$Z" run "$root/tests/data/ipod-nav" 2>"$tmp/setup.err")
[ "$out" = 'filled 40' ] || { echo "ipod_nav: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
cd "$tmp" || exit 2
frames="90 110 130 160 190 220 240 260"
IPOD_DEMO_MOUNT=$pod ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 TZ=UTC ZINC_FRAMES=262 ZINC_INPUT="$root/tests/data/ipod-nav/session.input" \
  ZINC_FRAMEHASH=all ZINC_SHOT="$tmp/nav.png" ZINC_SHOT_FRAMES=$(echo $frames | tr ' ' ',') timeout 120 "$Z" run --interp "$root/examples/ipod" > session.out 2>&1 \
  || { echo "ipod_nav: the session failed: $(tail -5 session.out)"; exit 1; }
hash_at() { awk -v f="$1" '$2 == "framehash" && $3 + 0 <= f + 0 { h = $5 } END { print h }' session.out; }   # idle frames are not presented: the last one shown
fail=0
for f in $frames; do echo "$f $(hash_at $f)"; done > nav.txt
same() { [ "$(hash_at "$1")" = "$(hash_at "$2")" ] || { echo "ipod_nav: frame $2 ($3) differs from frame $1"; fail=1; }; }
# back from the album: the grid where it was scrolled (all but the top bar, whose › is now on)
python3 "$root/tools/pngdiff" nav-90.png nav-130.png --crop 232,64,948,696 > crop.out || { echo "ipod_nav: back from the album, the grid is not where it was: $(cat crop.out)"; fail=1; }
same 240 260 'the global search closed by Escape'
[ "$(hash_at 110)" != "$(hash_at 90)" ] || { echo "ipod_nav: the album did not open"; fail=1; }
[ -n "$UPDATE" ] && cp nav.txt "$gold"
cmp -s nav.txt "$gold" || { echo "ipod_nav: frames $(tr '\n' ' ' < nav.txt), recorded $(tr '\n' ' ' < "$gold")"; fail=1; }
[ $fail -eq 0 ] && echo "ipod_nav: ok"
exit $fail
