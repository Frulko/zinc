#!/bin/sh
# ZN-1047: a synthetic glTF city with night extras, a textured pad and a height field, for a PSP run of the shadows switch.
set -e
R=$(cd "$(dirname "$0")/../../.." && pwd)
D="${D:?set D to one scratch directory for setup.sh and psprun.sh}"
rm -rf "$D/psp"; mkdir -p "$D/psp/src" "$D/psp/assets/w"
awk '/^python3 -I - "\$tmp\/p\/assets\/w" <<.PY./{f=1;next} f&&/^PY$/{exit} f' "$R/tests/t0/zinc3d_world_build.sh" > "$D/gen.py"
sed -i "" "s/150, .1, 60, 150, .1, 80, 170, .1, 80, 170, .1, 60/150, 2, 60, 150, 2, 80, 170, 2, 80, 170, 2, 60/" "$D/gen.py"; sed -i "" "s/png(4, 4)/png(16, 16)/g" "$D/gen.py"; python3 -I "$D/gen.py" "$D/psp/assets/w"
python3 -I -c "
import struct,sys
open(sys.argv[1],'wb').write(b''.join(struct.pack('<H', (30 if (i//8)%2==0 and (j//8)%2==0 else 0)) for j in range(32) for i in range(32)))" "$D/psp/assets/w/h.bin"
cat > "$D/psp/zinc.json" <<'J'
{ "name": "shadowswitch", "entry": "src/main.ts", "assets": { "dir": "assets", "rules": [
  { "match": "w/city.gltf", "as": "world", "cell": 50, "block": 2 } ] } }
J
cat > "$D/psp/src/main.ts" <<'TS'
import { Scene, Camera, World, Light, defaults3D } from 'zinc:3d';
import { onFrame, width, height } from 'zinc:gfx';
const scene = new Scene();
scene.lights.push(new Light(-0.5, -0.6, -0.4, 0xffffff));
const camera = new Camera();
camera.far = 2000;
camera.setPosition(100, 120, -80).lookAt(100, 0, 100);
const d = defaults3D();
d.budget = 0;
const w = new World('w/city.zworld', d);
scene.add(w);
w.shadows('w/h.bin', 0, 0, 6.25, 32, 32, 0, 1);
console.log(`shown ${w.shadowsState as i32}`);
let frame = 0;
onFrame((dt: number) => {
  frame++;
  if (frame === 20) console.log(`hide ${w.setShadows(false) as i32}`);
  if (frame === 30) console.log(`show ${w.setShadows(true) as i32}`);
  if (frame === 40) { w.clearShadows(); console.log(`clear ${w.setShadows(true) as i32}`); }
  if (frame === 50) { w.shadows('w/h.bin', 0, 0, 6.25, 32, 32, 0, 1); console.log(`again ${w.shadowsState as i32}`); }
  if (frame === 55) w.setNight(1);
  if (frame === 60) console.log(`tris ${w.triangles}`);
  w.select(camera, width() / height(), [], 1 / 30);
  w.serve(100);
  camera.render(scene, 0, 0, width(), height());
});
TS
echo ok
