#!/bin/sh
# zinc:3d World (include/zn/zworld.h): the native choice of what a frame draws, on a synthetic world of 40 cells of 100 m in a row along +x,
# each with a near chunk (100 triangles), a mid chunk per 4 cells (20 a cell) and one far chunk for all (4 a cell). The eye looks along the
# row from x = -50: the levels by distance (near 300 m, mid 1300 m), the coarsest level asked for first, a cell whose level is not loaded
# showing another (coarser first, else finer: no holes), the hysteresis on the way out, the frustum, and the triangle budget kept by the governor.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/src" "$tmp/p/assets/w"
printf '{ "name": "world", "entry": "src/main.ts", "assets": { "dir": "assets" } }\n' > "$tmp/p/zinc.json"
python3 -I - "$tmp/p/assets/w" <<'PY' || { echo "zinc3d_world: the synthetic world was not written"; exit 1; }
import struct, sys
d = sys.argv[1]
def chunk(name, cell, cells, tris):   # one solid batch, `tris` triangles a cell, 3 vertices
    ni = cells * tris * 3
    spans = [i * tris * 3 for i in range(cells + 1)]
    rec = struct.pack('<5I3i5I8f', 2, 1, 0xffffff, 0, 0, -1, -1, cell, cells, 1, 0, 3, ni, 0, 0, 0, 1, 1, 1, 0, 0)
    verts = b''.join(struct.pack('<5h4B3b3x', 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 127, 0) for _ in range(3))
    idx = struct.pack('<%dH' % ni, *([0, 1, 2] * (ni // 3)))
    idx += b'\0' * (-len(idx) % 4)
    open(d + '/' + name, 'wb').write(b'ZWC1' + struct.pack('<3I', 1, len(spans), 0) + rec + struct.pack('<%dI' % len(spans), *spans) + verts + idx)
chunks = [(2, 'far.zwc')] + [(1, 'm%d.zwc' % j) for j in range(10)] + [(0, 'n%d.zwc' % i) for i in range(40)]
chunk('far.zwc', 0, 40, 4)
for j in range(10): chunk('m%d.zwc' % j, 4 * j, 4, 20)
for i in range(40): chunk('n%d.zwc' % i, i, 1, 100)
out = b'ZWD1' + struct.pack('<3I', 1, 40, len(chunks))
for i in range(40): out += struct.pack('<8f3i', 100 * i, 0, 0, 100 * i + 100, 10, 100, 0, 0, 11 + i, 1 + i // 4, 0)
for lvl, name in chunks:
    b = name.encode(); out += struct.pack('<2I', lvl, len(b)) + b + b'\0' * (-len(b) % 4)
open(d + '/w.zworld', 'wb').write(out)
PY
cat > "$tmp/p/src/main.ts" <<'TS'
import { Camera, World } from 'zinc:3d';
const camera = new Camera();
camera.far = 5000;
function look(x: number, dx: number): void { camera.setPosition(x, 20, 50).lookAt(x + dx, 20, 50); }
function world(): World { const w = new World('w/w.zworld'); w.nearReach = 300; w.midReach = 1300; w.budget = 0; return w; }
function pick(w: World, x: number): i32 { look(x, 1); w.select(camera, 1.5, [], 0.016); return w.triangles; }
function all(w: World): void { look(-50, 1); for (let n = 0; n < 4; n++) { w.select(camera, 1.5, [], 0); for (const k of w.missing) w.load(k); } }
const a = world();
pick(a, -50);
console.log(`empty ${a.triangles} first ${a.missing[0]} asks ${a.missing.length}`);
a.load(0);
console.log(`far ${pick(a, -50)}`);
all(a);
console.log(`all ${pick(a, -50)} missing ${a.missing.length}`);
a.free(11);
console.log(`coarser ${pick(a, -50)}`);
a.load(11);
console.log(`hysteresis ${pick(a, -110)} ${pick(a, -160)}`);
const b = world();
all(b);
b.free(0); b.free(1);
console.log(`finer ${pick(b, -50)}`);
look(-50, -1); b.select(camera, 1.5, [], 0);
console.log(`behind ${b.triangles}`);
const c = world();
all(c);
c.budget = 400;
let most: i32 = 0;
for (let n = 0; n < 200; n++) { const t = pick(c, -50); if (n >= 100 && t > most) most = t; }
console.log(`budget ${most} ${c.reachScale}`);
TS
ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run "$tmp/p" >"$tmp/out" 2>&1 || { echo "zinc3d_world: the run failed: $(tail -3 "$tmp/out")"; exit 1; }
# empty: nothing loaded, nothing drawn; asked first the far chunk (every cell's coarsest), then m0-m3 and n0-n2. far: every cell at its far
# level (160). all: near 0-2 (300) + mid 3-12 (200) + far 13-39 (108). coarser: cell 0 without its near shows its mid (608 - 100 + 20).
# hysteresis: at -110 cell 2 (310 m) keeps its near and cell 12 (1310 m) its mid (608); at -160 cell 2 (360 m, past 345) goes mid (528).
# finer: without the far and m0, cells 0-2 show their near (300), 4-12 their mid (180), 13-15 the mid m3 in place of the far (60); cell 3
# has no level loaded at all and 16-39 only the far that is gone (540). behind: the eye turned away draws nothing.
want='empty 0 first 0 asks 8
far 160
all 608 missing 0
coarser 528
hysteresis 608 528
finer 540
behind 0
budget'
got=$(grep -E '^(empty|far|all|coarser|hysteresis|finer|behind|budget)' "$tmp/out")
fail=0
[ "$(printf '%s\n' "$got" | sed 's/^budget .*/budget/')" = "$want" ] || { echo "zinc3d_world: got"; printf '%s\n' "$got"; fail=1; }
# budget: from 608 triangles the reaches come in (scale under 1) and, once settled, no frame passes 400 by more than one cell's step
# of level (here 80 triangles, a fifth of the budget; a city's cells are a few hundredths of it): at most 10% over
budget=$(printf '%s\n' "$got" | sed -n 's/^budget \([0-9]*\) 0\..*/\1/p')
[ -n "$budget" ] && [ "$budget" -le 440 ] && [ "$budget" -gt 200 ] || { echo "zinc3d_world: the governor did not keep 400 triangles: $(grep budget "$tmp/out")"; fail=1; }
[ $fail -eq 0 ] && echo "zinc3d_world: ok"
exit $fail
