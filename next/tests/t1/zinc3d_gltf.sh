#!/bin/sh
# glTF in zinc:3d (ZN-658). tests/data/zinc3d_gltf/assets/model.glb (two meshes, an embedded PNG texture, three nodes in TRS and matrix form,
# written by make_model.py) renders like its OBJ export drawn with the same materials (pngdiff, tolerance 24), and like the golden
# (tests/golden/zinc3d-gltf/frame.png), on the interpreter and compiled. A file with skins, animations and an unsupported extension loads
# with a warning that names them; a file that requires one is an error naming it. A 90601-vertex grid is split in meshes of 65535 at most.
# A zinc:3d program that does not import zinc:3d/gltf does not link the reader.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
shot() {   # name interp|native [program arguments]
  n=$1; r=$2; shift 2
  ZINC_RUN=$r ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$n.png" "$ZINC" run tests/data/zinc3d_gltf -- "$@" >"$tmp/$n.log" 2>&1
  [ -f "$tmp/$n.png" ] || { echo "$n: no frame: $(head -c 300 "$tmp/$n.log")"; fail=1; }
}
shot glb interp
shot obj interp obj
shot compiled native
grep -q "model.glb: 4 nodes, 2 with a mesh, 18 triangles" "$tmp/glb.log" || { echo "glb: $(head -c 300 "$tmp/glb.log")"; fail=1; }
tools/pngdiff "$tmp/glb.png" "$tmp/obj.png" --tol 24 >"$tmp/d" || { echo "the GLB and its OBJ export differ: $(head -1 "$tmp/d")"; fail=1; }
for n in glb compiled; do
  tools/pngdiff "$tmp/$n.png" tests/golden/zinc3d-gltf/frame.png --tol 24 >"$tmp/d" || { echo "$n: the frame differs from the golden: $(head -1 "$tmp/d")"; fail=1; }
done
printf '%s' '{"asset":{"version":"2.0"},"extensionsUsed":["KHR_texture_transform","KHR_materials_unlit"],"skins":[{"joints":[1]}],"animations":[{"channels":[],"samplers":[]}],"scenes":[{"nodes":[0]}],"nodes":[{"children":[1]},{}]}' >"$tmp/warn.gltf"
printf '%s' '{"asset":{"version":"2.0"},"extensionsUsed":["KHR_draco_mesh_compression"],"extensionsRequired":["KHR_draco_mesh_compression"],"scenes":[{"nodes":[]}]}' >"$tmp/draco.gltf"
ZINC_HEADLESS=1 "$ZINC" run tests/data/zinc3d_gltf -- load "$tmp/warn.gltf" >"$tmp/w.log" 2>&1
grep -q "not supported, ignored: animations (1), skins (1), KHR_texture_transform$" "$tmp/w.log" && grep -q "3 nodes, 0 with a mesh, 0 triangles" "$tmp/w.log" ||
  { echo "warning: $(head -c 300 "$tmp/w.log")"; fail=1; }
ZINC_HEADLESS=1 "$ZINC" run tests/data/zinc3d_gltf -- load "$tmp/draco.gltf" >"$tmp/e.log" 2>&1 && { echo "draco.gltf loaded"; fail=1; }
grep -q "required extension KHR_draco_mesh_compression is not supported" "$tmp/e.log" || { echo "error: $(head -c 300 "$tmp/e.log")"; fail=1; }
# a scan-sized mesh: a 300 x 300 grid (90601 vertices, 180000 triangles, 32-bit indices) is split in meshes of at most 65535 vertices
python3 - "$tmp/grid.glb" <<'PY'
import json, struct, sys
n = 301
pos = struct.pack(f'<{n * n * 3}f', *[c for j in range(n) for i in range(n) for c in (i / 300, 0, j / 300)])
idx = struct.pack(f'<{300 * 300 * 6}I', *[v for j in range(300) for i in range(300) for a in (j * n + i,) for v in (a, a + n, a + 1, a + 1, a + n, a + n + 1)])
doc = {'asset': {'version': '2.0'}, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
       'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]}],
       'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': n * n, 'type': 'VEC3', 'min': [0, 0, 0], 'max': [1, 0, 1]},
                     {'bufferView': 1, 'componentType': 5125, 'count': 300 * 300 * 6, 'type': 'SCALAR'}],
       'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(pos)}, {'buffer': 0, 'byteOffset': len(pos), 'byteLength': len(idx)}],
       'buffers': [{'byteLength': len(pos) + len(idx)}]}
js = json.dumps(doc).encode(); js += b' ' * (-len(js) % 4); b = pos + idx
open(sys.argv[1], 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(b)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(b), 0x004E4942) + b)
PY
ZINC_HEADLESS=1 "$ZINC" run tests/data/zinc3d_gltf -- load "$tmp/grid.glb" >"$tmp/g.log" 2>&1
grep -q "loaded: 4 nodes, 2 with a mesh, 180000 triangles" "$tmp/g.log" || { echo "grid: $(head -c 300 "$tmp/g.log")"; fail=1; }
# a zinc:3d program that does not import zinc:3d/gltf links no glTF reader (ZN-658 left its binary byte-identical); the one that does links it
for p in zinc3d_aa zinc3d_gltf; do "$ZINC" build tests/data/$p/main.ts -o "$tmp/$p" >"$tmp/b.log" 2>&1 || { echo "build $p: $(head -c 300 "$tmp/b.log")"; fail=1; }; done
grep -q -a "not a glTF 2.0 document" "$tmp/zinc3d_aa" && { echo "zinc3d_aa links the glTF reader"; fail=1; }
grep -q -a "not a glTF 2.0 document" "$tmp/zinc3d_gltf" || { echo "zinc3d_gltf: no glTF reader found in the binary"; fail=1; }
exit $fail
