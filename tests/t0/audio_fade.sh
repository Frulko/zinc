#!/bin/sh
# zinc:audio voices on the null backend (ZN-697): two overlapping plays of one sound at their own volumes mix to both, and voice.stop(delay, fade)
# fades a voice to silence in the mixer, sample by sample, and stops it on the frame the fade ends (a pitched voice too: the fade counts frames of
# mix). The interpreter, QuickJS and the compiled program print the same lines.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler for the plugin"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
import { fromSamples, mix } from 'zinc:audio';
const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const flat: number[] = [];
for (let i = 0; i < 48000; i++) flat.push(0.5);
const s = fromSamples(flat);
// two plays of a 0.5 sound at volumes 0.5 and 1: 0.75 together, 0.25 once the louder one stops
const a = s.voice(0.5, 1, 0, true), b = s.voice(1, 1, 0, true);
console.log(`both ${r4(mix(4)[0])}`);
b.stop();
console.log(`one ${r4(mix(4)[0])} ${b.playing} ${a.playing}`);
a.stop();
// a fade of 480 frames (10 ms) from now (mix() is stereo: frame k is at 2k): 0.5 on frame 0, 0.375 on 120, 0.25 on 240, 1/960 on 479, then
// silent and stopped from frame 480 on
const v = s.voice(1, 1, 0, true);
v.stop(0, 0.01);
let m = mix(480);
console.log(`fade ${r4(m[0])} ${r4(m[240])} ${r4(m[480])} ${r4(m[958])} right ${r4(m[481])} ${v.playing}`);
m = mix(480);
console.log(`after ${r4(m[0])} ${r4(m[958])} ${v.playing}`);
// a fade after a delay: full for 240 frames, then 240 frames down to 0
const d = s.voice(1, 1, 0, true);
d.stop(0.005, 0.005);
m = mix(480);
console.log(`delayed ${r4(m[478])} ${r4(m[480])} ${r4(m[720])} ${r4(m[958])} ${d.playing}`);
console.log(`ended ${r4(mix(2)[0])} ${d.playing}`);
// a voice played an octave up fades over the same frames of mix
const p = s.voice(1, 2, 0, true);
mix(64);
p.stop(0, 0.01);
m = mix(480);
console.log(`pitched ${r4(m[480])} ${r4(m[958])} ${p.playing} ${r4(mix(2)[0])} ${p.playing}`);
EOF
cat > "$tmp/want" <<'OUT'
both 0.75
one 0.25 false true
fade 0.5 0.375 0.25 0.001 right 0.25 true
after 0 0 false
delayed 0.5 0.5 0.25 0.0021 true
ended 0 false
pitched 0.25 0.001 true 0 false
OUT
ZINC_HEADLESS=1 ZINC_NATIVE=real "$ZINC" run --interp "$tmp/main.ts" 2>"$tmp/err" | diff - "$tmp/want" >"$tmp/d" || { echo "audio_fade: the interpreter differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
ZINC_HEADLESS=1 ZINC_NATIVE=real "$ZINC" run "$tmp/main.ts" --engine quickjs 2>"$tmp/err" | diff - "$tmp/want" >"$tmp/d" || { echo "audio_fade: QuickJS differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
if ZINC_NATIVE=real "$ZINC" build "$tmp/main.ts" -o "$tmp/prog" >"$tmp/build.log" 2>&1; then
  ZINC_HEADLESS=1 "$tmp/prog" 2>&1 | diff - "$tmp/want" >"$tmp/d" || { echo "audio_fade: the compiled program differs: $(head -c 400 "$tmp/d")"; fail=1; }
else echo "audio_fade: the program does not build: $(tail -c 400 "$tmp/build.log")"; fail=1; fi
exit $fail
