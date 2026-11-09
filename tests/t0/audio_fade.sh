#!/bin/sh
# zinc:audio voices on the null backend (ZN-697): two overlapping plays of one sound at their own volumes mix to both, and voice.stop(delay, fade)
# fades a voice to silence in the mixer, sample by sample, and stops it on the frame the fade ends (a pitched voice too: the fade counts frames of
# mix). voice.pause() holds a voice where it is and resume() goes on from there, so a clip held for 1 s ends 1 s later (ZN-695); a voice
# started at an offset plays from it. The interpreter, QuickJS and the compiled program print the same lines.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler for the plugin"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
import { fromSamples, mix, time } from 'zinc:audio';
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
// a ramp of 3 s whose sample is its time / 4: started at 2 s it plays from 2 s
const ramp: number[] = [];
for (let i = 0; i < 144000; i++) ramp.push(i / 48000 / 4);
const r = fromSamples(ramp);
const at2 = r.voice(1, 1, 0, false, 2);
console.log(`seek ${r4(mix(1)[0] * 4)}`);
at2.stop();
// held after 0.5 s for 1 s: silent and still playing, then on from 0.5 s, and over at 3 + 1 s of mix after its start, not at 3
const t0 = time(), h = r.voice(1, 1, 0, false);
m = mix(24000);
h.pause();
h.pause();
const held = mix(48000);
let loud = 0;
for (const x of held) loud = Math.max(loud, Math.abs(x));
console.log(`held ${r4(m[47998] * 4)} ${loud} ${h.playing}`);
h.resume();
console.log(`resumed ${r4(mix(1)[0] * 4)} ${h.playing}`);
mix(119519);
console.log(`late ${h.playing} ${r4(time() - t0)}`);
mix(960);
console.log(`over ${h.playing} ${r4(time() - t0)}`);
// a held voice stopped ends at once; a voice already fading out is not held
const s1 = r.voice(1, 1, 0, false);
s1.pause();
s1.stop(0, 0.5);
const s2 = r.voice(1, 1, 0, true);
s2.stop(0, 0.01);
s2.pause();
mix(960);
console.log(`stops ${s1.playing} ${s2.playing}`);
EOF
cat > "$tmp/want" <<'OUT'
both 0.75
one 0.25 false true
fade 0.5 0.375 0.25 0.001 right 0.25 true
after 0 0 false
delayed 0.5 0.5 0.25 0.0021 true
ended 0 false
pitched 0.25 0.001 true 0 false
seek 2
held 0.5 0 true
resumed 0.5 true
late true 3.99
over false 4.01
stops false false
OUT
ZINC_HEADLESS=1 ZINC_NATIVE=real "$ZINC" run --interp "$tmp/main.ts" 2>"$tmp/err" | diff - "$tmp/want" >"$tmp/d" || { echo "audio_fade: the interpreter differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
ZINC_HEADLESS=1 ZINC_NATIVE=real "$ZINC" run "$tmp/main.ts" --engine quickjs 2>"$tmp/err" | diff - "$tmp/want" >"$tmp/d" || { echo "audio_fade: QuickJS differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
if ZINC_NATIVE=real "$ZINC" build "$tmp/main.ts" -o "$tmp/prog" >"$tmp/build.log" 2>&1; then
  ZINC_HEADLESS=1 "$tmp/prog" 2>&1 | diff - "$tmp/want" >"$tmp/d" || { echo "audio_fade: the compiled program differs: $(head -c 400 "$tmp/d")"; fail=1; }
else echo "audio_fade: the program does not build: $(tail -c 400 "$tmp/build.log")"; fail=1; fi
exit $fail
