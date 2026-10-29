# Sourced by tests/t1/ipod_discover.sh, ipod_repair.sh and ipod_lyrics.sh, from the repository's root with $ZINC set: skips (77) without the
# plugin's libraries; makes $tmp (removed at exit, its shots kept in $KEEP when set) with the fake iPod and history of main.ts, starts the
# online stand-in (stub.py: Last.fm, MusicBrainz, the Cover Art Archive and LRCLIB, never the real ones) and points the app at it.
# Gives: $root, $Z, $tmp, $pod, $fail, app <name> <frames,> <input file> (a headless session: <name>.out, <name>-<frame>.png, scene dumps),
# hash_at <name> <frame>, says <name> <frame> <text>, podread (the iPod's songs, main.ts read mode).
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
stub=''
trap '[ -n "$stub" ] && kill $stub 2>/dev/null && wait $stub 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/*.jsonl "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys, zlib
out = sys.argv[1]
for i in range(1, 9):   # two seconds of silence each, one byte apart: no two files are the same
    n = 8000 * 2 * 2
    open('%s/song-%d.wav' % (out, i), 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + bytes([i]) * 2 + b'\0' * (n - 2))
rows = b''.join(b'\0' + bytes([40, 90, 200]) * 64 for y in range(64))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(out + '/cover.png', 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
PY
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp" TZ=UTC
out=$(timeout 120 "$Z" run "$root/tests/data/ipod-online/main.ts" 2>"$tmp/setup.err")
[ "$out" = 'filled 8' ] || { echo "$(basename "$0" .sh): the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
python3 "$root/tests/data/ipod-online/stub.py" "$tmp" "$tmp/port" & stub=$!
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do [ -s "$tmp/port" ] && break; sleep 0.1; done
P=http://127.0.0.1:$(cat "$tmp/port")
export IPOD_LASTFM_URL=$P/2.0/ IPOD_MUSICBRAINZ_URL=$P/ws/2 IPOD_COVERART_URL=$P IPOD_LRCLIB_URL=$P/api
fail=0
cd "$tmp" || exit 2
app() {
  last=$(echo "$2" | tr ',' '\n' | tail -1)
  IPOD_DEMO_MOUNT=$pod ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_FRAMES=$((last + 2)) ZINC_INPUT="$3" ZINC_FRAMEHASH=all \
    ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=$2 ZINC_SCENE_DUMP="$tmp/$1-scene" timeout 180 "$Z" run --interp "$root/examples/ipod" > "$1.out" 2>&1 \
    || { echo "$(basename "$0" .sh): the $1 session failed: $(tail -5 "$1.out")"; fail=1; }
}
hash_at() { awk -v f="$2" '$2 == "framehash" && $3 + 0 <= f + 0 { h = $5 } END { print h }' "$1.out"; }
says() { python3 "$root/tools/scene-texts" "$tmp/$1-scene-$2" | grep -q "$3" || { echo "$(basename "$0" .sh): $1 frame $2 does not show \"$3\": $(python3 "$root/tools/scene-texts" "$tmp/$1-scene-$2" | head -40 | tr '\n' '|')"; fail=1; }; }
podread() { ONLINE_MODE=read timeout 120 "$Z" run "$root/tests/data/ipod-online/main.ts" 2>/dev/null; }
