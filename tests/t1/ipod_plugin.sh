#!/bin/sh
# zinc:ipod end to end (tests/data/ipod-app) on a fake iPod: a folder with iPod_Control/Device/SysInfo that detect() finds through
# ZINC_IPOD_ROOTS. The plugin is built from its vendored libgpod; open() writes SysInfoExtended and a new database, add() copies a tagged
# WAV and refuses a FLAC, then playlists, update, save with a snapshot, check, plays counted, smart playlists (the TypeScript evaluator against libgpod on a table of
# rules, rules read back, refilled after a play), a bad cover and close. The interpreter, QuickJS and the
# compiled program print the same lines. Skips (77) without the system libraries (docs/plugins/ipod.md, Install).
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
python3 - "$tmp/song.wav" <<'PY'
import struct, sys
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
cp "$tmp/song.wav" "$tmp/song.wav.flac"
fresh() {   # a new fake iPod for each engine
  rm -rf "$tmp/Volumes" "$tmp/backups"; mkdir -p "$tmp/Volumes/ZINCPOD/iPod_Control/Device"
  printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$tmp/Volumes/ZINCPOD/iPod_Control/Device/SysInfo"
}
unset ZINC_DETERMINISTIC   # "in the last" rules: the TypeScript evaluator and libgpod read the same wall clock
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 IPOD_SONG="$tmp/song.wav" ZINC_HEADLESS=1
cat > "$tmp/want" <<'OUT'
detected Classic (Silver) hash58 database false
opened Zinc Pod sysinfo true free > 0 true
added true refused an iPod cannot play .flac files (convert to MP3, AAC or ALAC)
addWith true progress true
track song  0 0 0 audio true
track Override  0 0 4 podcast true
playlist Zinc Pod true false 2
playlist Mix false false 1
playlist Podcasts false true 1
updated Test song
snapshots true
check 0 0
specs tracks 2 firmware  disk
artwork 0 -1
backups 2 true false true
played 1 2 1700000000
bpm 124 skips 0 0
smart agree 26 of 26 rules read back 26
unplayed 1 after a play 0 Match all: playCount is 0 · live
rules changed 1
bad rule: rule 1 (mood is): unknown field
bad cover: true
closed: no iPod is open
OUT
check() { if ! diff "$tmp/out" "$tmp/want" >"$tmp/d"; then echo "ipod_plugin: $1 differs: $(head -c 600 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; fi; }
fresh; "$ZINC" run --interp tests/data/ipod-app >"$tmp/out" 2>"$tmp/err"; check "the interpreter"
fresh; "$ZINC" run tests/data/ipod-app --engine quickjs >"$tmp/out" 2>"$tmp/err"; check "QuickJS"
if "$ZINC" build tests/data/ipod-app -o "$tmp/prog" >"$tmp/err" 2>&1; then fresh; "$tmp/prog" >"$tmp/out" 2>"$tmp/err"; check "the compiled program"
else echo "ipod_plugin: the program does not build: $(tail -c 400 "$tmp/err")"; fail=1; fi
exit $fail
