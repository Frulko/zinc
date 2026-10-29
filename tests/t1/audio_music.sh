#!/bin/sh
# zinc:audio's Music (a file played as it is read) on the null backend: a WAV everywhere, and an AAC file (.m4a, made by afconvert) on macOS,
# where AudioToolbox reads it. Opened in the background, played, paused, seeked, played to its end and again; a missing file says why.
# Real time (ZINC_DETERMINISTIC=0): the reader is a thread, and a run on virtual time would not wait for it.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp/tone.wav" <<'PY' || exit 2
import math, struct, sys, wave
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
w.writeframes(b''.join(struct.pack('<hh', v, v) for v in (int(12000 * math.sin(2 * math.pi * 440 * i / 44100)) for i in range(88200))))
PY
want=$(cat tests/golden/audio-music.out) fail=0
files="$tmp/tone.wav"
[ "$(uname)" = Darwin ] && afconvert -f m4af -d aac "$tmp/tone.wav" "$tmp/tone.m4a" && files="$files $tmp/tone.m4a"
for f in $files; do
  out=$(MUSIC_FILE=$f ZINC_DETERMINISTIC=0 ZINC_HEADLESS=1 ZINC_NATIVE=real "$ZINC" run tests/data/audio-music 2>&1 | grep -v '^  \|^zinc')
  [ "$out" = "$want" ] || { echo "$(basename "$f"): $out"; fail=1; }
done
exit $fail
