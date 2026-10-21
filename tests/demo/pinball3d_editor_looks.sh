#!/bin/sh
# The table editor of the 3D pinball, what the eye sees set by hand (ZN-649.15): a colour is picked in a square of shades or among the
# colours the table already uses, not typed; the glow of a light is pulled with a handle on the top view; the painting of an upper
# playfield shows in the top view; the eye of a screen layout is turned in the 3D pane and kept; the things of the score panel are
# dragged in a picture of the game's window. One session (tests/golden/pinball3d-editor/looks.input) on the test's table, in a
# folder with one image written here:
#   - an upper playfield is drawn and given a look whose image is chosen in the folder: frame 52, the top view with the painting
#     (pixel golden, the top view's part of the window);
#   - the glow of slingLight is set by pulling its handle; a look's colour by a click in the square of shades, another by a click on
#     a colour of the table's palette; the 3D pane is turned by a drag and C keeps that view for the layout the pane looks through;
#     the bonus of the landscape panel is dragged in the screen layout: frame 120, the layout being edited (the game's own drawing of
#     its window: held to the same picture by structure, as the other 3D frames of the editor's tests are);
#   - the saved table equals looks.json, the game's loader accepts it, and each of the five things changed is in it.
# Sizes and boxes set by pointing (ZN-649.18), a second session (handles.input) on the same table:
#   - the radius of a bumper is pulled with the handle on the circle of its body (the format gives a bumper's and a kicker's
#     radius the role of a distance around the thing, as a light's glow has);
#   - in the screen layout, the box the table is drawn in is sized by the square at its corner and moved by a drag, the panel's
#     own box is dragged, and two notches of the wheel over the table narrow the eye's field of view;
#   - the saved table equals handles.json, the loader accepts it, and each of the four things is in it.
# The painting of an upper playfield that is not a rectangle stays inside its outline (ZN-649.18): an L-shaped one wears the
# image; the top view equals its pixel golden (deck-6.png), and the corner the L leaves out is the same picture as on the table
# whose upper playfield has no painting, while the playfield itself is not.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: python3 is not installed"; exit 77; }
ex=$PWD/examples/pinball3d-editor; g=$PWD/tests/golden/pinball3d-editor
game=$PWD/examples/pinball3d
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# the top view and the pane beside it, in a window of 1440 x 900: x, y, width, height
CROP=386,48,714,820

mkdir -p "$tmp/looks/art"
cp "$g/table.json" "$tmp/looks/table.json"
python3 - "$tmp/looks/art/deck.png" <<'PY'
import struct, sys, zlib
# 32 x 64, bands of two colours: a painting that is seen at once on the upper playfield
rows = b''.join(b'\x00' + bytes((60, 70, 110) if (y // 8) % 2 == 0 else (200, 170, 60)) * 32 for y in range(64))
chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
PY
PINBALL_EDITOR_LANG=en ZINC_INPUT="$g/looks.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=126 ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=52,120 \
  "$ZINC" run "$ex" -- "$tmp/looks" --log >"$tmp/out" 2>"$tmp/err" || { echo "the editor failed on looks.input: $(head -c 300 "$tmp/err")"; fail=1; }
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/looks/table.json" "$g/looks.json"; for f in 52 120; do cp "$tmp/shot-$f.png" "$g/looks-$f.png"; done; fi
cmp -s "$tmp/looks/table.json" "$g/looks.json" || { echo "the looks session: table.json differs from $g/looks.json"; diff "$tmp/looks/table.json" "$g/looks.json" 2>/dev/null | head -10; fail=1; }
got=$("$ZINC" run "$game/tools/table.ts" -- check "$tmp/looks" 2>&1)
case $got in *'is a valid table (version 1)'*) ;; *) echo "the game's loader refuses the table of the looks session: $(printf '%s' "$got" | head -c 300)"; fail=1 ;; esac
# the same bytes are the same picture; a file that differs is decoded and compared in the top view only
cmp -s "$tmp/shot-52.png" "$g/looks-52.png" || tools/pngdiff "$tmp/shot-52.png" "$g/looks-52.png" --crop $CROP >/dev/null || { echo "the top view with the painting of an upper playfield differs from $g/looks-52.png"; fail=1; }
cmp -s "$tmp/shot-120.png" "$g/looks-120.png" || tools/pngdiff "$tmp/shot-120.png" "$g/looks-120.png" --crop $CROP --ssim 0.8 >/dev/null || { echo "the screen layout being edited is another picture than $g/looks-120.png"; fail=1; }
# what the session changed, each by pointing: nothing of it is in the table the session starts from
python3 - "$g/table.json" "$tmp/looks/table.json" <<'PY' || fail=1
import json, sys
was, now = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
look = lambda t, name: next(l for l in t['looks'] if l['id'] == name)
light = lambda t, name: next(l for l in t['lights'] if l['id'] == name)
bonus = lambda t: next(i for i in t['layouts']['landscape']['panel']['items'] if i['show'] == 'bonus')['box']
bad = []
if not any(f.get('look') and look(now, f['look']).get('texture') == 'art/deck.png' for f in now.get('floors', [])): bad.append('no upper playfield wears the image of the folder')
if not light(now, 'slingLight').get('glow', 0) > 3: bad.append('the glow of slingLight was not pulled out')
if look(now, 'popCap')['color'] == look(was, 'popCap')['color']: bad.append('the colour of popCap was not picked in the square')
if look(now, 'popCap').get('glow') not in {l['color'] for l in was['looks']} | {l['color'] for l in was['lights']}: bad.append('the glow of popCap is not one of the colours the table uses')
moved = [k for k in ('landscape', 'portrait') if now['layouts'][k]['camera'] != was['layouts'][k]['camera']]
if len(moved) != 1 or now['layouts'][moved[0]]['camera']['target'] != was['layouts'][moved[0]]['camera']['target']: bad.append('the eye of one layout was not turned round what it looks at')
if bonus(now)[0] >= bonus(was)[0] or bonus(now)[1] <= bonus(was)[1] or bonus(now)[2:] != bonus(was)[2:]: bad.append('the bonus of the panel was not dragged to the left and down')
if bad:
    print('the looks session: ' + '; '.join(bad))
    sys.exit(1)
PY

# ---- sizes and boxes set by pointing
mkdir -p "$tmp/handles"
cp "$g/table.json" "$tmp/handles/table.json"
PINBALL_EDITOR_LANG=en ZINC_INPUT="$g/handles.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=52 \
  "$ZINC" run "$ex" -- "$tmp/handles" --log >"$tmp/out" 2>"$tmp/err" || { echo "the editor failed on handles.input: $(head -c 300 "$tmp/err")"; fail=1; }
grep -q '^Not done' "$tmp/out" && { echo "handles.input: the editor refused something: $(grep '^Not done' "$tmp/out" | head -2 | tr '\n' ';')"; fail=1; }
[ -n "$ZN_UPDATE_GOLDEN" ] && cp "$tmp/handles/table.json" "$g/handles.json"
cmp -s "$tmp/handles/table.json" "$g/handles.json" || { echo "the handles session: table.json differs from $g/handles.json"; diff "$tmp/handles/table.json" "$g/handles.json" 2>/dev/null | head -10; fail=1; }
got=$("$ZINC" run "$game/tools/table.ts" -- check "$tmp/handles" 2>&1)
case $got in *'is a valid table (version 1)'*) ;; *) echo "the game's loader refuses the table of the handles session: $(printf '%s' "$got" | head -c 300)"; fail=1 ;; esac
python3 - "$g/table.json" "$tmp/handles/table.json" <<'PY' || fail=1
import json, sys
was, now = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
pop = lambda t: next(b for b in t['bumpers'] if b['id'] == 'pop1')
a, b = was['layouts']['landscape'], now['layouts']['landscape']
bad = []
if 'radius' in pop(was) or pop(now).get('radius') != 4: bad.append('the radius of pop1 was not pulled to 4 cm')
if b['view'] != [a['view'][0] + 20, a['view'][1] + 20, a['view'][2] - 40, a['view'][3] - 40]: bad.append('the box of the table was not sized and moved: %s' % b['view'])
if b['panel']['box'] != [a['panel']['box'][0] - 20] + a['panel']['box'][1:]: bad.append('the box of the panel was not dragged: %s' % b['panel']['box'])
if b['camera']['fov'] != a['camera']['fov'] - 2: bad.append('the field of view was not narrowed by two degrees: %s' % b['camera']['fov'])
if bad:
    print('the handles session: ' + '; '.join(bad))
    sys.exit(1)
PY

# ---- the painting of an L-shaped upper playfield
for kind in deck plain; do
  mkdir -p "$tmp/$kind/art"; cp "$tmp/looks/art/deck.png" "$tmp/$kind/art/deck.png"
  python3 - "$g/table.json" "$tmp/$kind/table.json" $kind <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))
t['looks'].append({'id': 'deckArt', 'texture': 'art/deck.png'} if sys.argv[3] == 'deck' else {'id': 'deckArt'})
t['floors'] = [{'id': 'deck', 'points': [[6, 40], [20, 40], [20, 48], [13, 48], [13, 56], [6, 56]], 'z': 5.5, 'look': 'deckArt'}]
json.dump(t, open(sys.argv[2], 'w'))
PY
  printf '4 move 1000 700\n' > "$tmp/still.input"
  PINBALL_EDITOR_LANG=en ZINC_INPUT="$tmp/still.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=8 ZINC_SHOT="$tmp/$kind.png" ZINC_SHOT_FRAMES=6 \
    "$ZINC" run "$ex" -- "$tmp/$kind" >"$tmp/out" 2>&1 || { echo "the editor failed on the table with an L-shaped upper playfield: $(head -c 300 "$tmp/out")"; fail=1; }
done
[ -n "$ZN_UPDATE_GOLDEN" ] && cp "$tmp/deck-6.png" "$g/deck-6.png"
cmp -s "$tmp/deck-6.png" "$g/deck-6.png" || tools/pngdiff "$tmp/deck-6.png" "$g/deck-6.png" --crop $CROP >/dev/null || { echo "the top view with the painting of an L-shaped upper playfield differs from $g/deck-6.png"; fail=1; }
# the L covers x 6 to 20 and y 40 to 56 cm, without its corner from (13, 48): that corner, then the part of the L beside it
tools/pngdiff "$tmp/deck-6.png" "$tmp/plain-6.png" --crop 591,443,38,45 >/dev/null || { echo "the painting of an L-shaped upper playfield goes over the corner the L leaves out"; fail=1; }
tools/pngdiff "$tmp/deck-6.png" "$tmp/plain-6.png" --crop 545,443,38,45 >/dev/null && { echo "the L-shaped upper playfield does not show its painting"; fail=1; }

[ $fail = 0 ] && echo "pinball3d_editor_looks: ok"
exit $fail
