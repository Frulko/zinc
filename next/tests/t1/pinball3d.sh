#!/bin/sh
# The 3D pinball (ZN-649.02, examples/pinball3d): a table file played with zinc:physics3d and drawn with zinc:3d.
# - The scripted game (tests/data/pinball3d/play.input, written by play.py: start, the plunger every five seconds, the flippers in turn, a bump) plays
#   60 seconds headless on the deterministic clock and prints the event log of tests/data/pinball3d/play.log, in the landscape layout and in the
#   portrait one (the game does not depend on the window).
# - Three moments of it in each layout equal their pixel goldens on the software renderer (tests/golden/pinball3d): the table waiting for a
#   player (frame 12), a ball in play (320), the mission's light lit while a bumper fires (460). They show the look of the table (ZN-649.08):
#   the painted playfield, the pools of light of the lit inserts, the modelled pieces, the cabinet, the upper playfield, the backglass. The
#   GPU renderer, which a window uses with 4 samples a pixel and mipmaps, draws the ball-in-play frame as the same picture as the software
#   one: close to it pixel by pixel with multisampling and filtering off, and by structural similarity as a window shows it.
# - Single shots (tools/probe.ts) prove what the third dimension is for: a shot up the ramp climbs it, rides the wire rail above the playfield
#   and drops in the left inlane; the dock catches a ball, holds it and lifts it to the upper playfield, where it rolls to the deck's flipper,
#   leaves by the chute and falls back on the playfield, or is flipped into a beacon; a ball on the deck bounces off the modelled tower (a
#   mesh file with a convex hull); a flip sends the ball away at arcade speed; with the locks it needs, multiball serves and shoots two more balls.
# - Nothing of the table is in the code: no name, text, file or coordinate of table.json appears in the sources, and every file it names is there.
# To make the goldens again after an intended change: tests/t1/pinball3d.sh --update (with ZINC set).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: python3 is not installed"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ex=../examples/pinball3d
data=$PWD/tests/data/pinball3d
gold=$PWD/tests/golden/pinball3d
update=0; [ "$1" = "--update" ] && update=1
python3 "$data/play.py" | cmp -s - "$data/play.input" || { echo "pinball3d: play.input is not what play.py writes"; fail=1; }

play() {   # layout, size, extra environment...: the log in $tmp/<layout>.log, the three frames in $tmp/<layout>-<n>.png
  l=$1; size=$2; shift 2
  env "$@" ZINC_INPUT="$data/play.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$size ZINC_FRAMES=3600 ZINC_SHOT="$tmp/$l.png" ZINC_SHOT_FRAMES=12,320,460 \
    "$ZINC" run $ex -- --log >"$tmp/$l.log" 2>"$tmp/$l.err" || { echo "pinball3d: the $l game failed: $(head -c 400 "$tmp/$l.err")"; fail=1; }
}
play landscape 640x400
play portrait 400x640
if [ $update = 1 ]; then
  mkdir -p "$gold"
  cp "$tmp/landscape.log" "$data/play.log"
  for l in landscape portrait; do for n in 12 320 460; do cp "$tmp/$l-$n.png" "$gold/$l-$n.png"; done; done
  echo "pinball3d: the log and the six frames are written again"
fi
cmp -s "$tmp/landscape.log" "$data/play.log" || { echo "pinball3d: the scripted game does not print play.log: $(diff "$tmp/landscape.log" "$data/play.log" | head -5 | tr '\n' ';')"; fail=1; }
cmp -s "$tmp/portrait.log" "$data/play.log" || { echo "pinball3d: the portrait game does not print the same log"; fail=1; }
grep -q "game over: score" "$data/play.log" && [ "$(grep -c ' hit ' "$data/play.log")" -ge 20 ] || { echo "pinball3d: play.log is not a whole game with hits"; fail=1; }
for l in landscape portrait; do for n in 12 320 460; do
  tools/pngdiff "$tmp/$l-$n.png" "$gold/$l-$n.png" >/dev/null 2>&1 || { echo "pinball3d: frame $n of the $l layout differs from its golden: $(tools/pngdiff "$tmp/$l-$n.png" "$gold/$l-$n.png" 2>&1 | head -1)"; fail=1; }
done; done
# the GPU renderer (where there is no GL context the software renderer draws, and the frame is the golden): without multisampling it draws the
# software frame within display-gl's tolerance; as a window shows it (4 samples a pixel: smooth edges, which the software frame does not have)
# it stays the same picture, by the measure of zinc:3d's own GPU test (tests/t1/three_gpu.sh)
gpu() {   # name, extra environment...
  n=$1; shift
  env "$@" ZINC_3D=gpu ZINC_INPUT="$data/play.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=320 ZINC_SHOT="$tmp/$n.png" ZINC_SHOT_FRAMES=320 \
    "$ZINC" run $ex >/dev/null 2>"$tmp/$n.err" || { echo "pinball3d: the game failed on the GPU renderer ($n): $(head -c 300 "$tmp/$n.err")"; fail=1; }
}
gpu gpu ZINC_3D_MSAA=0 ZINC_3D_FILTER=nearest
tools/pngdiff "$tmp/gpu-320.png" "$gold/landscape-320.png" --tol 24 --max-diff 2560 >"$tmp/gpu.txt" 2>&1 || { echo "pinball3d: the GPU frame is not within tolerance of the software one: $(head -1 "$tmp/gpu.txt")"; fail=1; }
gpu smooth
tools/pngdiff "$tmp/smooth-320.png" "$gold/landscape-320.png" --ssim 0.95 >"$tmp/smooth.txt" 2>&1 || { echo "pinball3d: the multisampled GPU frame is another picture: $(tail -1 "$tmp/smooth.txt")"; fail=1; }

# single shots: place and velocity of the ball (centimetres, cm/s), seconds
probe() { "$ZINC" run $ex/tools/probe.ts -- "$@" 2>&1; }
table=$(cd $ex/assets/tables && ls | head -1)
t=assets/tables/$table
out=$(probe $t 36 70 1.37 0 -330 0 4)
echo "$out" | grep -q " ramp enter" && echo "$out" | grep -q " rail exit" && echo "$out" | grep -q " inlaneLeft roll" || { echo "pinball3d: a shot up the ramp does not ride it to the left inlane: $(echo "$out" | tail -4 | tr '\n' ';')"; fail=1; }
high=$(echo "$out" | sed -n 's/.*highest \([0-9.]*\),.*/\1/p')
python3 -c "import sys; sys.exit(0 if 6.5 < float('$high') < 9.5 else 1)" || { echo "pinball3d: the ball on the ramp reaches a height of $high (the ramp is 5.5 high, the glass 9.5)"; fail=1; }
out=$(probe $t 36 70 1.37 0 -150 0 4)
echo "$out" | grep -q " rail exit" && { echo "pinball3d: a weak shot (1.5 m/s) climbs the ramp"; fail=1; }
out=$(probe $t 40.5 30 1.37 0 -90 0 3)
echo "$out" | grep -q " dock capture" && echo "$out" | grep -q "^1.04[0-9] dock eject" || { echo "pinball3d: the dock does not hold the ball a second and throw it: $(echo "$out" | tail -4 | tr '\n' ';')"; fail=1; }
high=$(echo "$out" | sed -n 's/.*highest \([0-9.]*\),.*/\1/p')
python3 -c "import sys; sys.exit(0 if 6.5 < float('$high') < 7.5 else 1)" || { echo "pinball3d: the dock does not lift the ball to the upper playfield (highest $high; the deck is 5.5 high)"; fail=1; }
# the upper playfield: left alone, the ball rolls to the deck's flipper, leaves by the chute, falls back on the playfield, is turned by
# the relays into the right inlane, and does not fall in the dock again; flipped, it hits a beacon; a ball on the deck bounces off the tower, a mesh file with a hull
out=$(probe $t 40.5 30 1.37 0 -90 0 6)
echo "$out" | grep -q " stand1 hit" && echo "$out" | grep -q " inlaneRight roll" && [ "$(echo "$out" | grep -c ' dock capture')" = 1 ] || { echo "pinball3d: a ball left alone on the deck does not come back down the right side: $(echo "$out" | tail -5 | tr '\n' ';')"; fail=1; }
out=$(probe $t 40.5 30 1.37 0 -90 0 3 left@1.7)
echo "$out" | grep -q " deckFlipper flip" && echo "$out" | grep -q " beacon1 hit" || { echo "pinball3d: the deck's flipper does not send the ball to a beacon: $(echo "$out" | tail -5 | tr '\n' ';')"; fail=1; }
out=$(probe $t 44 9.5 6.87 150 -115 0 1)
echo "$out" | grep -q " tower hit" || { echo "pinball3d: a ball on the deck does not hit the modelled tower: $(echo "$out" | tail -3 | tr '\n' ';')"; fail=1; }
out=$(probe $t 6.4 74 1.37 0 20 0 2 left@0.9)
fast=$(echo "$out" | sed -n 's/.*fastest \([0-9.]*\),.*/\1/p')
python3 -c "import sys; sys.exit(0 if 300 < float('$fast') < 700 else 1)" || { echo "pinball3d: a flip sends the ball at $fast cm/s (3 to 7 m/s expected)"; fail=1; }
cp -R "$ex/$t" "$tmp/multi"   # the whole folder: the table names its images, models and sounds
python3 - "$ex/$t/table.json" "$tmp/multi/table.json" <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))
t['rules']['multiball']['locks'] = 1
json.dump(t, open(sys.argv[2], 'w'))
PY
out=$(probe "$tmp/multi" 40.5 30 1.37 0 -90 0 4)
echo "$out" | grep -q " game multiballStart" && [ "$(echo "$out" | grep -c ' plunger launch')" -ge 2 ] || { echo "pinball3d: one lock does not start multiball with two more balls: $(echo "$out" | head -8 | tr '\n' ';')"; fail=1; }
# four bumps in a row tilt the table (two warnings, the next tilts): the flippers die
out=$(probe $t 23 50 1.37 0 0 0 4 bump@0.2 left@0.9)
echo "$out" | grep -q " game tilt" || { echo "pinball3d: bumps do not tilt the table: $(echo "$out" | tail -5 | tr '\n' ';')"; fail=1; }
echo "$out" | grep -q " left flip" && { echo "pinball3d: a flipper answers on a tilted table"; fail=1; }
# touch: a finger (here the pointer) on the left half of the table's view is the left flipper button
printf '20 pad Start\n24 padup Start\n40 move 100 300\n41 down\n50 up\n' > "$tmp/touch.input"
ZINC_INPUT="$tmp/touch.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=60 "$ZINC" run $ex -- --log 2>&1 | grep -q " left flip" || { echo "pinball3d: a touch on the left of the table does not flip"; fail=1; }
# a settings file with a fault is named
printf '{ "controls": { "left": ["mouse:1"] } }\n' > "$tmp/settings.json"
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 "$ZINC" run $ex -- "--settings=$tmp/settings.json" 2>&1 | grep -q 'controls.left\[0\]: "mouse:1" is no input' || { echo "pinball3d: a bad settings file is not reported"; fail=1; }

# nothing of the table in the code: its names and texts (anything with a capital, a digit or a space, the words of the format left aside)
# and its coordinates with two decimals
python3 - "$ex" "$ex/$t/table.json" <<'PY' || fail=1
import json, os, re, sys, glob
ex, table = sys.argv[1], sys.argv[2]
missing = []
code = ''.join(open(f).read() for f in glob.glob(ex + '/src/*.ts') + glob.glob(ex + '/src/format/*.ts') + glob.glob(ex + '/tools/*.ts'))
found = []
# fields whose value is a word of the format, not of the table
WORDS = {'format', 'event', 'jackpotEvent', 'do', 'mode', 'test', 'is', 'kind', 'shape', 'style', 'show', 'align', 'button', 'shading', 'penalty', 'collide', 'wave'}
def walk(v, key=''):
    if isinstance(v, dict):
        for k, x in v.items(): walk(x, k)
    elif isinstance(v, list):
        for x in v: walk(x, key)
    elif isinstance(v, str):
        if key not in WORDS and len(v) > 3 and not v.startswith('#') and re.search(r'[A-Z0-9 /.]', v) and (("'" + v + "'") in code or ('"' + v + '"') in code or ('`' + v + '`') in code): found.append(v)
        # a file the table names: an image, a model, a sound
        if key in ('texture', 'textureLit', 'mesh', 'image', 'file') and v:
            if not os.path.exists(os.path.dirname(table) + '/' + v): missing.append(v)
            if v not in credited: missing.append(v + ' (no credit)')
    elif isinstance(v, float) and v >= 1 and round(v * 100) != round(v * 10) * 10:
        if re.search(r'(?<![0-9.])' + re.escape(repr(v)) + r'(?![0-9])', code): found.append(repr(v))
data = json.load(open(table))
credited = {f for c in data.get('credits', []) for f in c['files'] if c.get('author') and c.get('licence')}
walk(data)
if found:
    print('pinball3d: the code holds values of the table: ' + ', '.join(sorted(set(found))[:10]))
    sys.exit(1)
if missing:
    print('pinball3d: the table names files that are not in its folder, or have no author and licence in its credits: ' + ', '.join(sorted(set(missing))[:10]))
    sys.exit(1)
PY
exit $fail
