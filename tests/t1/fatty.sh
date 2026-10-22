#!/bin/sh
# Original screens, actual pointer hits, all countdowns, name entry, saved scores and idle redraws on Zinc/QuickJS.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
trap '[ -z "${KEEP:-}" ] || { mkdir -p "$KEEP"; cp "$tmp"/*.out "$tmp"/*.png "$tmp"/*.txt "$KEEP/" 2>/dev/null || :; }; rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1024x768 ZINC_STORAGE="$tmp/storage"
app="$tmp/app"
cp -R examples/fatty "$app"
# Seed only this test copy; retain all 60 seconds of simulation, drawing every tenth tick during its idle middle.
python3 - "$app" "$PWD" <<'PY'
from pathlib import Path
import sys
app, repo = Path(sys.argv[1]), Path(sys.argv[2])
p = app / 'src/main.ts'
s = p.read_text().replace('const stage = new Stage();', '''let seed = 2013;
Math.random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; };
const stage = new Stage();''')
(app / 'src/probe.ts').write_text((repo / 'tests/data/fatty/probe.ts').read_text().replace('../../../examples/fatty/src/', './'))
s = "import { probe } from './probe';\n" + s
s = s.replace('onFrame((dt: number)', 'let frame = 0;\nonFrame((dt: number)')
s = s.replace('main.frame(dt)', '{ frame++; main.frame(dt*(frame === 810 ? 0 : frame > 400 && frame < 800 ? 10 : 1)); probe(stage); }')
p.write_text(s)
PY
timeout 15 "$Z" bundle "$app" --check -o "$tmp/fatty.js" > "$tmp/check.out" 2>&1
ZINC_FRAMES=950 ZINC_INPUT="$PWD/tests/data/fatty/session.input" ZINC_FRAMEHASH=all \
  ZINC_SHOT="$tmp/session.png" ZINC_SHOT_FRAMES=35,80,400,737,780,919 \
  timeout 45 "$Z" run "$app" > "$tmp/session.out" 2>&1 || { tail -15 "$tmp/session.out"; exit 1; }
awk '$1 == "zinc:" && $2 == "framehash" && ($3 == 35 || $3 == 80 || $3 == 400 || $3 == 737 || $3 == 780 || $3 == 919) {print $3, $5}' "$tmp/session.out" > "$tmp/hashes.txt"
[ "$(wc -l < "$tmp/hashes.txt" | tr -d ' ')" = 6 ] || { echo 'fatty: missing frames'; exit 1; }
grep -q '^fatty hit 20$' "$tmp/session.out" || { echo 'fatty: pointer missed the rotating target'; exit 1; }
grep -q '^fatty name entry' "$tmp/session.out" || { echo 'fatty: missing end-of-game name entry'; exit 1; }
grep -q 'Guillaume' "$tmp/storage" || { echo 'fatty: name/score not persisted'; exit 1; }
for page in home tutorial scores; do
  [ "$(grep -c "^fatty page $page" "$tmp/session.out")" = 2 ] || { echo "fatty: broken navigation to $page"; exit 1; }
done
if [ -n "${UPDATE:-}" ]; then
  cp "$tmp/hashes.txt" tests/golden/fatty/hashes.txt
  for frame in 35 80 400 737 780 919; do cp "$tmp/session-$frame.png" "tests/golden/fatty/$frame.png"; done
fi
cmp "$tmp/hashes.txt" tests/golden/fatty/hashes.txt
ZINC_FRAMES=300 ZINC_FRAMEHASH=all ZINC_PROFILE=1 timeout 15 "$Z" run "$app" > "$tmp/idle.out" 2>&1
[ "$(awk '$1=="zinc:" && $2=="framehash" && $3>=30 {print $5}' "$tmp/idle.out" | sort -u | wc -l | tr -d ' ')" = 1 ] || { echo 'fatty: idle menu changed'; exit 1; }
# Frame hashes alone cannot prove redraw suppression: use the host's paint timings too.
grep -q 'zinc profile: paint p50=0.00 ' "$tmp/idle.out" || { echo 'fatty: menu keeps painting after its fade'; exit 1; }
echo 'fatty: screens, original pointer controls, full game, local scores and idle ok'
