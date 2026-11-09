#!/bin/sh
# The audio importer (ZN-440.01): an "as": "audio" rule of zinc.json encodes a sound to QOA at pack time (3.2 bits a sample), at the rule's rate and
# channels; report.json names each sound's codec and the bytes of each codec. zinc:audio plays what it wrote: load() decodes the QOA effect whole
# (mono at 22.05 kHz, as its rule asked), loadMusic() streams the QOA track from the mounted pack a frame at a time (a 4 s stereo sine, left and
# right opposite: ten seconds loop it without a gap, under 64 KB held, a seek lands where asked). The interpreter, QuickJS and the compiled program
# print the same lines.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler for the plugin"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/assets/music" "$tmp/p/assets/sfx" "$tmp/p/assets/raw" "$tmp/run" "$tmp/empty"
# 4 s of 16-bit stereo at 44.1 kHz: a 441 Hz sine at half scale on the left (400 whole periods: the end meets the start), its opposite on the
# right for the music, the same on both sides for the effect (mixed down to one channel)
python3 - "$tmp/p/assets" <<'PY' || exit 2
import math, struct, sys
rate, n = 44100, 176400
for name, sign in (('music/theme.wav', -1), ('sfx/coin.wav', 1)):
    data = b''.join(struct.pack('<hh', v, sign * v) for v in (int(16384 * math.sin(2 * math.pi * i / 100)) for i in range(n)))
    fmt = struct.pack('<HHIIHH', 1, 2, rate, rate * 4, 4, 16)
    body = b'WAVE' + b'fmt ' + struct.pack('<I', len(fmt)) + fmt + b'data' + struct.pack('<I', len(data)) + data
    open(sys.argv[1] + '/' + name, 'wb').write(b'RIFF' + struct.pack('<I', len(body)) + body)
PY
cp "$tmp/p/assets/music/theme.wav" "$tmp/p/assets/raw/keep.wav"
cat > "$tmp/p/zinc.json" <<'JSON'
{ "name": "p",
  "assets": { "rules": [{ "match": "{music,sfx}/*.wav", "as": "audio", "codec": "qoa" }, { "match": "sfx/**", "channels": 1, "rate": 22050 }] } }
JSON
"$ZINC" assets build "$tmp/p" >"$tmp/build.out" 2>&1 || { echo "audio_import: assets build failed: $(cat "$tmp/build.out")"; exit 1; }
report=$(cat "$tmp"/p/build/assets/*/report.json)
pack=$(ls "$tmp"/p/build/assets/*/default.zpk)
row() { echo "$report" | grep -F "\"name\": \"$1\""; }
for want in 'music/theme.wav", "importer": "audio"' 'sfx/coin.wav", "importer": "audio"' 'raw/keep.wav", "importer": "copy"'; do
  echo "$report" | grep -qF "$want" || { echo "audio_import: report.json has no $want"; fail=1; }
done
row music/theme.wav | grep -q '"codec": "qoa"' && row raw/keep.wav | grep -q '"codec": "pcm"' || { echo "audio_import: the codecs: $(row music/theme.wav) $(row raw/keep.wav)"; fail=1; }
python3 - "$tmp"/p/build/assets/*/report.json <<'PY' || fail=1
import json, sys
r = json.load(open(sys.argv[1]))
a = {i['name']: i for i in r['assets']}
t, c, k = a['music/theme.wav'], a['sfx/coin.wav'], a['raw/keep.wav']
codecs = r['totals']['codecs']
ok = (t['sourceBytes'] > 4.5 * t['outputBytes'] and 3.5 * c['outputBytes'] < t['outputBytes'] < 4.5 * c['outputBytes']   # 3.2 bits a sample; the effect mono at half the rate: a quarter
      and codecs.get('qoa') == t['packBytes'] + c['packBytes'] and codecs.get('pcm') == k['packBytes'] and t['packBytes'] == t['outputBytes'])
print('report: theme %d -> %d bytes, coin %d bytes, codecs %s' % (t['sourceBytes'], t['outputBytes'], c['outputBytes'], codecs), file=sys.stderr)
sys.exit(0 if ok else 1)
PY
[ $fail = 0 ] || { echo "audio_import: report.json: $report"; exit 1; }
cat > "$tmp/run/main.ts" <<EOF
import { load, loadMusic, mix } from 'zinc:audio';
import { readBytes, mount } from 'zinc:assets';
mount('$pack');
const head = readBytes('music/theme.wav');
console.log(\`stored \${String.fromCharCode(head[0], head[1], head[2], head[3])}\`);
const coin = load('sfx/coin.wav');
let peak = 0;
for (const v of coin.samples(0)) peak = Math.max(peak, Math.abs(v));
console.log(\`effect \${coin.ok} \${coin.channels} \${coin.sampleRate} \${Math.round(coin.duration * 1000) / 1000} peak \${Math.round(peak * 100) / 100}\`);
const m = loadMusic('music/theme.wav');
console.log(\`music \${m.ready} '\${m.error}' duration \${m.duration}\`);
m.loop = true;
m.play();
let h = 0, step = 0, quiet = 0, run = 0, side = 0, prev = 0;
for (let c = 0; c < 100; c++) {   // 10 s in blocks of 100 ms
  const s = mix(4800);
  for (let i = 0; i < s.length; i += 2) {
    h = (h * 31 + Math.round(s[i] * 32767) + 65536) % 1000000007;
    step = Math.max(step, Math.abs(s[i] - prev));
    run = Math.abs(s[i]) < 0.01 && c + i > 0 ? run + 1 : 0;
    quiet = Math.max(quiet, run);
    side = Math.max(side, Math.abs(s[i] + s[i + 1]));
    prev = s[i];
  }
}
console.log(\`hash \${h} position \${Math.round(m.position * 1000) / 1000} playing \${m.playing}\`);
console.log(\`seamless \${step < 0.04} \${quiet < 2} opposite \${side < 0.02}\`);
console.log(\`memory \${m.memory} under 64 KB \${m.memory > 0 && m.memory < 65536}\`);
m.seek(3.5);
mix(480);
console.log(\`seek \${Math.round(m.position * 100) / 100}\`);
m.close();
EOF
run() { (cd "$tmp/run" && ZINC_HEADLESS=1 ZINC_NATIVE=real ZINC_ASSETS="$tmp/empty" "$@" 2>"$tmp/err"); }
run "$ZINC" run --interp main.ts >"$tmp/want"
grep -q '^stored qoaf$' "$tmp/want" && grep -q '^effect true 1 22050 4 peak 0.5$' "$tmp/want" && grep -q "^music true '' duration 4$" "$tmp/want" \
  && grep -q '^seamless true true opposite true$' "$tmp/want" && grep -q 'under 64 KB true$' "$tmp/want" && grep -q '^seek 3.51$' "$tmp/want" \
  || { echo "audio_import: the interpreter: $(cat "$tmp/want") $(tail -c 300 "$tmp/err")"; fail=1; }
run "$ZINC" run main.ts --engine quickjs | diff - "$tmp/want" >"$tmp/d" || { echo "audio_import: QuickJS differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
if ZINC_NATIVE=real "$ZINC" build "$tmp/run/main.ts" -o "$tmp/prog" >"$tmp/build.log" 2>&1; then
  run "$tmp/prog" | diff - "$tmp/want" >"$tmp/d" || { echo "audio_import: the compiled program differs: $(head -c 400 "$tmp/d")"; fail=1; }
else echo "audio_import: the program does not build: $(tail -c 400 "$tmp/build.log")"; fail=1; fi
exit $fail
