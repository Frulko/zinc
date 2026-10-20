#!/bin/sh
# The sound of the web environment (ZN-573): Web Audio and the audio element of lib/std/webenv.js on zinc:audio (plugins/audio, miniaudio).
# No sound card: the runs are headless, so the mixer has no output and the environment renders each frame's time of mix itself;
# ZINC_AUDIO_LOG=1 prints what the mixer was asked (`audio start`, `audio end`) and when the rendered mix held sound, with its peak
# (`audio out`). ZINC_NATIVE=real: the plugin's native code decodes and mixes, and the test fails if it cannot be built
# (the QuickJS engine has no stand-in for a native module: without the plugin the environment says so once and stays silent).
# - tests/golden/webenv/audio/page.js: a buffer the program makes and a decoded Ogg file, through gains, looped, stopped, started at a given
#   time, faded, muted further down the graph, a suspended context, an audio element; the output is page.out (a gain of 0.5 on a wave of
#   0.8 peaks at 0.40; the sound asked for 1.5 starts at 1.500).
# - examples/js-phaser (ZN-712), the scripted game of tests/t1/example_js_phaser.sh: Phaser's WebAudioSoundManager decodes the two WAV
#   files, each of the three stars caught plays the first and the crash plays the second, and the mix holds sound after each.
# To write page.out again after an intended change: tests/t1/webenv_audio.sh --update (with ZINC set).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
G=tests/golden/webenv/audio
run() { env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_AUDIO_LOG=1 "$@"; }
noise() { grep -v '^zinc: Canvas 2D' "$1" | head -c 300; }

run ZINC_WEB=1 ZINC_NATIVE=real ZINC_FRAMES=400 "$ZINC" run $G/page.js --engine quickjs > "$tmp/out" 2> "$tmp/err" || { echo "webenv_audio: the page failed: $(noise "$tmp/err")"; fail=1; }
[ "$1" = "--update" ] && { cp "$tmp/out" $G/page.out; echo "webenv_audio: page.out is written again"; }
diff "$tmp/out" $G/page.out > "$tmp/diff" || { echo "webenv_audio: the page differs from $G/page.out:"; head -20 "$tmp/diff"; fail=1; }

run ZINC_NATIVE=real ZINC_SIZE=320x240 ZINC_FRAMES=600 ZINC_INPUT=tests/golden/js-examples/phaser.input "$ZINC" run ../examples/js-phaser > "$tmp/game" 2> "$tmp/err" \
  || { echo "webenv_audio: js-phaser failed: $(noise "$tmp/err")"; fail=1; }
python3 - "$tmp/game" <<'PY' || fail=1
import re, sys
log = open(sys.argv[1]).read().split('\n')
bad = []
decoded = [float(m.group(1)) for l in log if (m := re.match(r'audio decode: \d+ bytes, ([0-9.]+) s', l))]
if len(decoded) != 2 or min(decoded) <= 0: bad.append(f'the two WAV files are not decoded: {decoded}')
starts = [(float(m.group(1)), float(m.group(2))) for l in log if (m := re.match(r'audio start #\d+: ([0-9.]+) s at ([0-9.]+), gain 1.00 rate 1.00 pan 0.00$', l))]
catch, crash = (decoded + [0, 0])[:2]
if [s[0] for s in starts] != [catch] * 3 + [crash]: bad.append(f'not three catches then a crash: {starts}')
heard = [float(m.group(1)) for l in log if (m := re.match(r'audio out: sound from ([0-9.]+)', l))]
for length, at in starts:
    if not any(at - 0.02 <= h <= at + 0.05 for h in heard): bad.append(f'no sound in the mix at {at}')
if sum(1 for l in log if l.startswith('audio end #')) != len(starts): bad.append('a sound does not end')
if 'game over: 3 stars' not in log: bad.append('the game does not end on 3 stars')
if bad:
    print('webenv_audio: js-phaser: ' + '; '.join(bad[:5]))
    sys.exit(1)
PY
exit $fail
