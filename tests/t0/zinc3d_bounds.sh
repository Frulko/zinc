#!/bin/sh
# zinc:3d bounds(node) (ZN-682): the box and the sphere of a subtree, on the OBJ export, the GLB and the .zmesh of tests/data/zinc3d_gltf (a
# hierarchy of turned, moved and scaled nodes), equal to tests/data/zinc3d_bounds/expected.py's (computed from the files, not by zinc:3d), on
# the interpreter, the AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
here=$PWD
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/assets/zm"
cp tests/data/zinc3d_gltf/assets/base.obj tests/data/zinc3d_gltf/assets/top.obj tests/data/zinc3d_gltf/assets/model.glb "$tmp/p/assets/"
cp tests/data/zinc3d_gltf/assets/model.glb "$tmp/p/assets/zm/"
cat > "$tmp/p/zinc.json" <<'JSON'
{ "name": "bounds", "entry": "main.ts",
  "assets": { "rules": [{ "match": "zm/*.glb", "as": "model", "format": "zmesh" }], "groups": { "all": { "include": ["**"] } } } }
JSON
cat > "$tmp/p/main.ts" <<'TS'
import { Node, Bounds, loadObj, loadModel, bounds } from 'zinc:3d';
import { loadGltf } from 'zinc:3d/gltf';
function show(name: string, b: Bounds): void {
  const v: number[] = [b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], b.center[0], b.center[1], b.center[2], b.radius];
  console.log(name + ' ' + v.map((x: number) => x.toFixed(5)).join(' '));
}
const obj = new Node(null, null);
obj.add(new Node(loadObj('base.obj'), null));
obj.add(new Node(loadObj('top.obj'), null));
show('obj', bounds(obj));
show('glb', bounds(loadGltf('model.glb')));
show('zmesh', bounds(loadModel('zm/model.zmesh')));
const moved = loadGltf('model.glb');
moved.setPosition(1, 2, 3).setRotation(0, Math.PI / 2, 0).setScale(2, 1, 1);
show('moved', bounds(moved));
console.log(`empty ${bounds(new Node(null, null)).isEmpty()}`);
TS
python3 tests/data/zinc3d_bounds/expected.py > "$tmp/want" || { echo "zinc3d_bounds: expected.py failed"; exit 1; }
echo "empty true" >> "$tmp/want"
fail=0
for engine in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  (cd "$tmp/p" && ZINC_HEADLESS=1 ZINC_FRAMES=1 timeout 120 "$ZINC" run $engine . 2>"$tmp/err" | grep -E '^(obj|glb|zmesh|moved|empty) ' > "$tmp/got")
  python3 - "$tmp/want" "$tmp/got" <<'PY' || { echo "zinc3d_bounds ($engine): $(head -c 300 "$tmp/err")"; fail=1; }
import sys
want = [l.split() for l in open(sys.argv[1])]; got = [l.split() for l in open(sys.argv[2])]
if [l[0] for l in want] != [l[0] for l in got]: sys.exit(f'lines {[l[0] for l in got]}, want {[l[0] for l in want]}')
for w, g in zip(want, got):
    if w[0] == 'empty':
        if w != g: sys.exit(f'{" ".join(g)}, want {" ".join(w)}')
        continue
    if any(abs(float(a) - float(b)) > 2e-5 for a, b in zip(w[1:], g[1:])): sys.exit(f'{" ".join(g)}\n  want {" ".join(w)}')
PY
done
cd "$here"
[ $fail -eq 0 ] && echo "zinc3d_bounds: ok"
exit $fail
