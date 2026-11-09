#!/bin/sh
# zinc:audio's loadMusic (ZN-440.02) on the null backend: a 4 s stereo IMA ADPCM WAV at 44.1 kHz (left a 390 Hz sine, right its opposite), put
# in a pack with writePack and mounted, is read in place and decoded on the mix as it goes. Ten seconds of mix loop it twice without a gap (no
# step between two frames above a sine's, no silent run) with the right channel the left's opposite; the music holds under 64 KB of memory;
# the hash of the mixed samples, the position and the memory are the same on the interpreter, QuickJS and the compiled program; the pack
# cannot be unmounted while the music reads it, and can once it is closed.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler for the plugin"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/assets"
# IMA ADPCM, Microsoft's WAV framing (format 0x11): blocks of 1024 bytes, 1017 frames each, a 4-byte header per channel, then 8 samples per
# channel at a time in 4 bytes. 173 blocks, 1557 periods of 113 frames: the end meets the start (a partial last block would be heard as silence).
python3 - "$tmp/assets/song.wav" <<'PY' || exit 2
import math, struct, sys
STEPS = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157,
         173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878,
         2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289,
         16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767]
MOVE = [-1, -1, -1, -1, 2, 4, 6, 8] * 2
def code(s, st):
    pred, idx = st
    step, diff, c = STEPS[idx], s - pred, 0
    if diff < 0: c, diff = 8, -diff
    if diff >= step: c |= 4; diff -= step
    if diff >= step >> 1: c |= 2; diff -= step >> 1
    if diff >= step >> 2: c |= 1
    dq = step >> 3
    if c & 4: dq += step
    if c & 2: dq += step >> 1
    if c & 1: dq += step >> 2
    pred = max(-32768, min(32767, pred - dq if c & 8 else pred + dq))
    st[0], st[1] = pred, max(0, min(88, idx + MOVE[c]))
    return c
rate, per = 44100, 1017
frames = per * 173
left = [int(16384 * math.sin(2 * math.pi * i / 113)) for i in range(frames)]
chans = [left, [-v for v in left]]
data, idx = bytearray(), [48, 48]   # a step near the sine's slope from the first frame: the loop goes back to it
for b in range(0, frames, per):
    block = [c[b:b + per] + [0] * (per - len(c[b:b + per])) for c in chans]
    state = [[c[0], idx[k]] for k, c in enumerate(block)]   # the step index carries over: a block starting at the smallest step lags
    for c in range(2): data += struct.pack('<hBB', block[c][0], state[c][1], 0)
    for g in range(1, per, 8):
        for c in range(2):
            n = [code(block[c][g + k], state[c]) for k in range(8)]
            data += bytes(n[k] | n[k + 1] << 4 for k in range(0, 8, 2))
    idx = [state[0][1], state[1][1]]
fmt = struct.pack('<HHIIHHHH', 0x11, 2, rate, rate * 1024 // per, 1024, 4, 2, per)
body = b'WAVE' + b'fmt ' + struct.pack('<I', len(fmt)) + fmt + b'fact' + struct.pack('<II', 4, frames) + b'data' + struct.pack('<I', len(data)) + bytes(data)
open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', len(body)) + body)
PY
cat > "$tmp/main.ts" <<'EOF'
import { loadMusic, mix } from 'zinc:audio';
import { readBytes, writePack, mount, unmount } from 'zinc:assets';
writePack('music.zpk', ['music/theme.wav'], [readBytes('song.wav')]);
mount('music.zpk');
const m = loadMusic('music/theme.wav');
console.log(`ready ${m.ready} ${m.error === ''} duration ${m.duration}`);
m.loop = true;
m.play();
let h = 0, step = 0, quiet = 0, run = 0, side = 0, prev = 0;
for (let c = 0; c < 100; c++) {   // 10 s in blocks of 100 ms
  const s = mix(4800);
  for (let i = 0; i < s.length; i += 2) {
    h = (h * 31 + Math.round(s[i] * 32767) + 65536) % 1000000007;
    step = Math.max(step, Math.abs(s[i] - prev));
    run = Math.abs(s[i]) < 0.01 && c + i > 0 ? run + 1 : 0;   // the first frame is the sine's 0, the next ones the resampler's start
    quiet = Math.max(quiet, run);
    side = Math.max(side, Math.abs(s[i] + s[i + 1]));
    prev = s[i];
  }
}
console.log(`hash ${h} position ${Math.round(m.position * 1000) / 1000} playing ${m.playing}`);
console.log(`seamless ${step < 0.04} ${quiet < 2} opposite ${side < 0.01}`);
console.log(`memory ${m.memory} under 64 KB ${m.memory > 0 && m.memory < 65536}`);
console.log(`unmount while playing ${unmount('music.zpk')}`);
m.close();
console.log(`unmount once closed ${unmount('music.zpk')}`);
const none = loadMusic('music/none.ogg');
console.log(`missing ${none.ready} ${none.error}`);
EOF
run() { (cd "$tmp" && ZINC_HEADLESS=1 ZINC_NATIVE=real ZINC_ASSETS="$tmp/assets" "$@" 2>"$tmp/err"); }
run "$ZINC" run --interp main.ts >"$tmp/want"
grep -q '^seamless true true opposite true$' "$tmp/want" && grep -q 'under 64 KB true$' "$tmp/want" && grep -q '^unmount while playing false$' "$tmp/want" \
  && grep -q '^unmount once closed true$' "$tmp/want" && grep -q '^ready true true duration 3.98' "$tmp/want" && grep -q '^missing false music/none.ogg: no such asset$' "$tmp/want" \
  || { echo "audio_stream_pack: the interpreter: $(cat "$tmp/want") $(tail -c 300 "$tmp/err")"; fail=1; }
run "$ZINC" run main.ts --engine quickjs | diff - "$tmp/want" >"$tmp/d" || { echo "audio_stream_pack: QuickJS differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
if ZINC_NATIVE=real "$ZINC" build "$tmp/main.ts" -o "$tmp/prog" >"$tmp/build.log" 2>&1; then
  run "$tmp/prog" | diff - "$tmp/want" >"$tmp/d" || { echo "audio_stream_pack: the compiled program differs: $(head -c 400 "$tmp/d")"; fail=1; }
else echo "audio_stream_pack: the program does not build: $(tail -c 400 "$tmp/build.log")"; fail=1; fi
exit $fail
