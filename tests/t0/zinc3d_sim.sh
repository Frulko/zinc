#!/bin/sh
# zinc:3d's stand-in (plugins/3d/native/render3d.sim.ts, ZINC_NATIVE=sim): it compiles, renders a cube and selects zinc3d_world's World as the
# native renderer does (the same levels, holes filled, hysteresis, frustum and governor). And a console's pack takes Render3D from the core:
# no library of this machine is built for it and the stand-in never goes in its place.
cd "$(dirname "$0")/../.." || exit 2
here=$PWD
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
out=$(ZINC_NATIVE=sim tests/t0/zinc3d_world.sh 2>&1) || { echo "zinc3d_sim: the World on the stand-in: $out"; fail=1; }
mkdir -p "$tmp/p/src"
printf '{ "name": "cube", "entry": "src/main.ts" }\n' > "$tmp/p/zinc.json"
cat > "$tmp/p/src/main.ts" <<'TS'
import { Scene, Camera, Node, Material, cube, render } from 'zinc:3d';
const scene = new Scene();
scene.add(new Node(cube(1), new Material(0xff0000)));
console.log(`cube ${render(scene, new Camera(), 0, 0, 64, 64)}`);
TS
got=$(ZINC_NATIVE=sim ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run "$tmp/p" 2>&1 | grep '^cube')
[ "$got" = "cube 12" ] || { echo "zinc3d_sim: the stand-in's cube: '$got' (want the 12 triangles submitted)"; fail=1; }
(cd "$tmp/p" && "$ZINC" pack --profile psp . -o "$tmp/psp.zapp" >"$tmp/pack.log" 2>&1) || { echo "zinc3d_sim: zinc pack --profile psp: $(tail -3 "$tmp/pack.log")"; fail=1; }
if [ -f "$tmp/psp.zapp" ]; then
  tar -tf "$tmp/psp.zapp" | grep -q '^native/' && { echo "zinc3d_sim: the psp pack carries a library of this machine"; fail=1; }
  tar -xf "$tmp/psp.zapp" -C "$tmp" program.zbc
  grep -q '__Native0_Render3D' "$tmp/program.zbc" || { echo "zinc3d_sim: the psp pack does not call the core's Render3D"; fail=1; }
  grep -q 'ZWD1' "$tmp/program.zbc" && { echo "zinc3d_sim: the psp pack holds the stand-in"; fail=1; }
fi
cd "$here"
[ $fail -eq 0 ] && echo "zinc3d_sim: ok"
exit $fail
