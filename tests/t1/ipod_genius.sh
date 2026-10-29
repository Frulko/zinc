#!/bin/sh
# Genius of the iPod app (examples/ipod/src/services/genius.ts) on a fake iPod (a folder with SysInfo, as ipod_plugin) filled by
# tests/data/ipod-genius with 26 songs and a generated history whose neighbours are known: the picks from a seed and their order, the
# artists spread, a 1-star song never picked, the same list twice, Refresh, Last.fm's similar artists fetched once from the stand-in of
# tests/data/ipod-scrobble/stub.py (never the real service) and cached, the taste clusters (the three planted groups, named by their
# artists and genre), the fallback without a history (the genres), and the list saved to the iPod as a normal playlist and read back.
# The interpreter, then QuickJS on a fresh iPod (the same lines; the app runs AOT: ipod_demo builds it).
# Skips (77) without the system libraries of zinc:ipod. KEEP=dir keeps the output.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
tmp=$(mktemp -d); stub=''
trap '[ -n "$stub" ] && kill $stub 2>/dev/null && wait $stub 2>/dev/null; rm -rf "$tmp"' EXIT
python3 tests/data/ipod-scrobble/stub.py "$tmp" "$tmp/port" & stub=$!
for i in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done
python3 - "$tmp/song.wav" <<'PY'
import struct, sys
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
export IPOD_LASTFM_URL=http://127.0.0.1:$(cat "$tmp/port")/2.0/ IPOD_HISTORY_PACE_MS=1 ZINC_HEADLESS=1 ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" \
  ZINC_IPOD_NO_USB=1 ZINC_IPOD_BACKUPS="$tmp/backups" IPOD_SONG="$tmp/song.wav"
cat > "$tmp/want" <<'OUT'
tracks 26 refused 0
weights 4 true
fetched without a key 0
genius 25 AAAAAAACCCCCCCCBBBBBBBBLL seed first true spread true
one star picked false same again true
refresh true true Alpha songs 7 spread true
stopped after 2 0/13 1/13 2/13 
fetched 11 again 0
genius with similar artists AAAAAAALBBBLBBBBCCCCCCCCB spread true
old file read true lines kept true true
ten 10 AAAAAAACCC
mixes 3
mix Alpha One, Alpha Two · Rock | 8 7 A spread true
mix Bravo One, Bravo Three · Jazz | 8 8 B spread true
mix Charlie One, Charlie Three · Electronic | 8 8 C spread true
mixes without history 3 8
saved Genius · Alpha One Song 1 false true
OUT
fail=0
run() {   # $1: the engine's flag; a new fake iPod and history each time
  rm -rf "$tmp/Volumes" "$tmp/backups" "$tmp/h"; mkdir -p "$tmp/Volumes/ZINCPOD/iPod_Control/Device" "$tmp/h"
  printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$tmp/Volumes/ZINCPOD/iPod_Control/Device/SysInfo"
  : > "$tmp/requests.jsonl"
  GENIUS_DIR="$tmp/h" timeout 120 "$ZINC" run tests/data/ipod-genius/main.ts $1 > "$tmp/out" 2>"$tmp/err"
  [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp/out" "$KEEP/out$1" && cp "$tmp/err" "$KEEP/err$1"
  diff "$tmp/want" "$tmp/out" > "$tmp/diff" || { echo "ipod_genius ($1): $(head -20 "$tmp/diff") $(grep -v '^  ' "$tmp/err" | tail -3)"; fail=1; }
  # each artist asked once, with the key; nothing asked without it
  n=$(grep -c '"artist.getsimilar"' "$tmp/requests.jsonl")
  [ "$n" -eq 13 ] || { echo "ipod_genius ($1): $n artist.getsimilar calls, 13 expected"; fail=1; }
}
run --interp
run "--engine quickjs"
[ $fail -eq 0 ] && echo "ipod_genius: ok"
exit $fail
