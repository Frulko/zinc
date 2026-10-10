#!/bin/sh
# zinc:audio (ZN-390). The plugin's native code (miniaudio) on its null backend, where mix() returns what the mixer renders: two WAV files written by the
# program play, overlap, change volume, loop and stop with the exact samples expected, 41 plays keep 32 voices and the loop among them, a 24 kHz file is
# resampled, tones and the Vorbis, FLAC and MP3 decoders give sound, a missing or broken file gives a silent Sound and a warning; the same output interpreted
# and as an AOT program that links the plugin. Then the calls every silent backend answers alike (silent.ts): the null backend, the Zinc stand-in
# (audio.sim.ts), and a deterministic run, which binds the stand-in and builds no native code (a fresh ZINC_HOME stays without a plugin cache).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
G=tests/golden/audio
ZINC_HEADLESS=1 ZINC_NATIVE=real "$ZINC" run $G/audio.ts >"$tmp/i.out" 2>"$tmp/i.err"
diff "$tmp/i.out" $G/audio.out >"$tmp/d" || { echo "audio.ts interpreted: $(head -4 "$tmp/d") $(head -c 300 "$tmp/i.err")"; fail=1; }
grep -q "zinc:audio: missing.wav: no such asset" "$tmp/i.err" && grep -q "zinc:audio: broken.wav: not a WAV" "$tmp/i.err" || { echo "no warning for the missing and the broken file"; fail=1; }
ZINC_NATIVE=real "$ZINC" build $G/audio.ts -o "$tmp/audio" >"$tmp/b.log" 2>&1 || { echo "audio.ts does not build: $(head -c 300 "$tmp/b.log")"; fail=1; }
ZINC_HEADLESS=1 ZINC_ASSETS="$PWD/$G/assets" "$tmp/audio" 2>/dev/null | diff - $G/audio.out >"$tmp/d" || { echo "audio.ts as an AOT program: $(head -4 "$tmp/d")"; fail=1; }
for mode in real sim; do
  ZINC_HEADLESS=1 ZINC_NATIVE=$mode "$ZINC" run $G/silent.ts 2>/dev/null | diff - $G/silent.out >"$tmp/d" || { echo "silent.ts with ZINC_NATIVE=$mode: $(head -4 "$tmp/d")"; fail=1; }
done
ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run $G/silent.ts 2>/dev/null | diff - $G/silent.out >"$tmp/d" || { echo "silent.ts in a deterministic run: $(head -4 "$tmp/d")"; fail=1; }
[ -z "$(ls -d "$tmp"/home/cache/*/plugins/audio-* 2>/dev/null)" ] || { echo "a deterministic run built the plugin's native code"; fail=1; }
exit $fail
