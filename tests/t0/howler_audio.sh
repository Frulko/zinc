#!/bin/sh
# Standalone upstream Howler on the production null mixer, comparing rendered stereo envelopes.
set -eu
cd "$(dirname "$0")/../.."
howler=$(timeout 15 tools/test-lib howler-2.2.4) || { echo 'skipped: pinned Howler unavailable'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
timeout 30 env ZINC_HEADLESS=1 ZINC_AUDIO=null ZINC_DETERMINISTIC=1 ZINC_NATIVE=real ZINC_WEB=1 ZINC_FRAMES=180 ZINC_AUDIO_LOG=1 WEBENV_HOWLER="$howler" "$ZINC" run tests/golden/webenv/howler/page.js --engine quickjs > "$tmp/out" 2> "$tmp/err" || { cat "$tmp/err"; exit 1; }
python3 - "$tmp/out" <<'PY'
import pathlib,re,sys
out=pathlib.Path(sys.argv[1]).read_text()
assert 'howler loaded 0.050 Web Audio' in out and 'howler complete' in out, out
starts=[float(t) for t in re.findall(r'audio out: sound from ([0-9.]+)',out)]
envelopes=[tuple(map(float,row)) for row in re.findall(r'audio out: silence from ([0-9.]+), the sound peaked at ([0-9.]+) left, ([0-9.]+) right',out)]
# The fade begins one frame into its 200ms ramp; mixing uses the facade's frame-rate parameter updates.
expected=[(.050,.40,.40),(.300,.80,.80),(.184,.73,.73),(.183,.80,0),(.183,0,.80)]
assert len(starts)==len(envelopes)==len(expected), out
for start,(end,left,right),(duration,want_left,want_right) in zip(starts,envelopes,expected):
    assert abs(end-start-duration)<.019 and abs(left-want_left)<.02 and abs(right-want_right)<.02, out
assert out.count('audio start #')==5 and out.count('audio end #')==5, out
print('Howler play/loop/fade/stereo: rendered null-mixer envelopes ok')
PY
