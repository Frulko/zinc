#!/bin/sh
# 3D models (ZN-441, docs/reports/zinc-next-assets.md "Models") on the gltf-viewer's CesiumMilkTruck.glb:
# 1. a copy of the viewer with a model rule: `zinc assets build` runs the truck and the box through gltfpack (quantised, EXT_meshopt_compression)
#    (twice, in two directories, the second without the cache: the same pack)
#    and the truck's JPEG through the texture importer; the pack's entries and their sizes are printed beside the source's;
# 2. the three plugin reads the packed models as cgltf reads the originals (tests/golden/gltf/stats.txt: meshes, triangles, bounding box;
#    gltfpack welds vertices, so their count is not compared);
# 3. the viewer's frame 30 from the packs is within a tolerance of its frame from the original files (software renderer, deterministic);
# 4. zinc:3d draws the truck's .zmesh (loadModel: each part's arrays as they are) within a tolerance of loadGltf's frame of the GLB, refuses
#    a damaged part (cut short, an index past its vertices), loads the rule's LOD (fewer triangles), and the load times of both are printed
#    (a run that is not deterministic).
# gltfpack: ZINC_GLTFPACK, else the pinned one of ZINC_HOME or ~/.zinc, built once by `zinc toolchain gltfpack` (skipped when it cannot be had).
cd "$(dirname "$0")/../.." || exit 2
N=$PWD
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
if [ -z "$ZINC_GLTFPACK" ]; then
  ZINC_GLTFPACK=$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/gltfpack-*/gltfpack 2>/dev/null | head -1)
  [ -n "$ZINC_GLTFPACK" ] || ZINC_GLTFPACK=$("$Z" toolchain gltfpack 2>/dev/null | tail -1)
fi
[ -x "$ZINC_GLTFPACK" ] || { echo "skipped: no gltfpack (zinc toolchain gltfpack)"; exit 77; }
export ZINC_GLTFPACK
M=$(cd ../examples/three/gltf-viewer && pwd)
[ -f "$M/assets/CesiumMilkTruck.glb" ] || { echo "skipped: the viewer's models are not here"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
unset ZINC_ASSETS ZINC_PACKS
fail=0

# 1. the packs of the viewer's copy
cp -R "$M" "$tmp/gv" && rm -rf "$tmp/gv/build"
python3 - "$M/zinc.json" "$tmp/gv/zinc.json" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
j["assets"] = {"rules": [{"match": "**/*.{glb,gltf}", "as": "model"}], "groups": {"models": {"include": ["**"]}}}
json.dump(j, open(sys.argv[2], "w"), indent=1)
PY
"$Z" assets build "$tmp/gv" >"$tmp/build.txt" 2>&1 || { echo "model: the build failed: $(head -c 600 "$tmp/build.txt")"; exit 1; }
python3 - "$tmp/gv/build/assets/macos" "$M/assets/CesiumMilkTruck.glb" <<'PY' || fail=1
import json, struct, sys
d, src = sys.argv[1], sys.argv[2]
b = open(d + "/models.zpk", "rb").read()
n, toc, names = struct.unpack("<I", b[8:12])[0], 32, struct.unpack("<I", b[20:24])[0]
rows = {}
for i in range(n):
    r = b[toc + 64 * i:toc + 64 * (i + 1)]
    no, nl = struct.unpack("<II", r[8:16])
    rows[b[names + no:names + no + nl].decode()] = (struct.unpack("<Q", r[24:32])[0], struct.unpack("<Q", r[32:40])[0], r[42])
s = open(src, "rb").read()
j = json.loads(s[20:20 + struct.unpack("<I", s[12:16])[0]])
img = sum(j["bufferViews"][i["bufferView"]]["byteLength"] for i in j["images"])
print("source CesiumMilkTruck.glb: %d bytes (geometry and JSON %d, JPEG %d)" % (len(s), len(s) - img, img))
for k in sorted(rows):
    if k.startswith("CesiumMilkTruck") or k.startswith("box/"): print("  %-30s %9d bytes (kind %d)" % (k, rows[k][1], rows[k][2]))
want = {"CesiumMilkTruck.glb": 0, "CesiumMilkTruck.glb.0.jpg": 1, "box/BoxTextured.gltf": 0}
bad = [k for k in want if k not in rows or rows[k][2] != want[k]]
r = json.load(open(d + "/report.json"))
truck = [a for a in r["assets"] if a["name"] == "CesiumMilkTruck.glb"][0]
print("  report: format %s, %d bytes in the pack, %d GPU bytes" % (truck["format"], truck["packBytes"], truck["gpuBytes"]))
if bad: print("model: missing or wrong entries: %s" % bad); sys.exit(1)
if rows["CesiumMilkTruck.glb"][1] >= len(s) - img: print("model: the packed truck is not smaller than its source"); sys.exit(1)
PY
# the same pack from a second copy in another directory, imported again (no cache): gltfpack and the importer are deterministic
cp -R "$tmp/gv" "$tmp/gv2" && rm -rf "$tmp/gv2/build"
ZINC_NO_CACHE=1 "$Z" assets build "$tmp/gv2" >/dev/null 2>&1 && cmp -s "$tmp/gv/build/assets/macos/models.zpk" "$tmp/gv2/build/assets/macos/models.zpk" &&
  echo "determinism: two builds in two directories give the same models.zpk" || { echo "model: two builds give two packs"; fail=1; }

# 2. the three plugin reads the packed models
(cd "$tmp/gv" && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 ZINC_PACKS="$tmp/gv/build/assets/macos" "$Z" run "$N/tests/golden/host/gltf_stats/main.ts" -- CesiumMilkTruck.glb box/BoxTextured.gltf) >"$tmp/stats.txt" 2>&1
sed 's/ vertices=[0-9]*//' tests/golden/gltf/stats.txt >"$tmp/want.txt"
sed 's/ vertices=[0-9]*//' "$tmp/stats.txt" | diff -u "$tmp/want.txt" - && echo "three reads the packed models: $(tr '\n' ';' <"$tmp/stats.txt")" || { echo "model: the packed models read differently"; fail=1; }

close() {   # frame, reference, limit of the pixels over 24 in %, limit of the mean error: glcompare's line
  o=$(python3 tools/glcompare "$2" "$1")
  python3 -c "
import re, sys
m = re.search(r'pixels over \d+: ([\d.]+)%, mae ([\d.]+)', sys.argv[1])
sys.exit(0 if m and float(m.group(1)) <= float(sys.argv[2]) and float(m.group(2)) <= float(sys.argv[3]) else 1)" "$o" "$3" "$4" || { echo "$o (limits $3% and $4)"; return 1; }
  echo "$o"
}

# 3. the viewer's frame 30, from the original files and from the packs
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=30 ZINC_SHOT_FRAMES=30"
(cd "$M" && env $env ZINC_SHOT="$tmp/orig.png" "$Z" run . >"$tmp/orig.txt" 2>&1)
(cd "$tmp/gv" && env $env ZINC_SHOT="$tmp/packed.png" "$Z" run . >"$tmp/packed.txt" 2>&1)
grep -q "loaded CesiumMilkTruck.glb: 5 meshes, 2856 triangles" "$tmp/packed.txt" || { echo "model: the viewer did not load the packed truck: $(tail -c 300 "$tmp/packed.txt")"; fail=1; }
if [ -f "$tmp/orig-30.png" ] && [ -f "$tmp/packed-30.png" ]; then
  o=$(close "$tmp/packed-30.png" "$tmp/orig-30.png" 1 1) && echo "gltf-viewer frame 30, packed against original: $o" || { echo "model: gltf-viewer frame 30: $o"; fail=1; }
else
  echo "model: the viewer drew no frame 30: $(tail -c 300 "$tmp/orig.txt") $(tail -c 300 "$tmp/packed.txt")"; fail=1
fi

# 4. zinc:3d: the .zmesh against the GLB
cp -R tests/data/model "$tmp/z3" && mkdir -p "$tmp/z3/assets/zm" && cp "$M/assets/CesiumMilkTruck.glb" "$tmp/z3/assets/zm/truck.glb" && cp "$M/assets/CesiumMilkTruck.glb" "$tmp/z3/assets/truck.glb"
for m in zmesh gltf; do
  (cd "$tmp/z3" && env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT_FRAMES=2 MODEL=$m ZINC_SHOT="$tmp/z3-$m.png" "$Z" run . >"$tmp/z3-$m.txt" 2>&1)
  (cd "$tmp/z3" && env ZINC_HEADLESS=1 ZINC_3D=software ZINC_FRAMES=1 MODEL=$m "$Z" run . 2>&1 | grep "loaded in")
done
grep -q "zm/truck.zmesh: 3 meshes, 3624 triangles" "$tmp/z3-zmesh.txt" || { echo "model: loadModel: $(tail -c 300 "$tmp/z3-zmesh.txt")"; fail=1; }
grep "damaged parts\|lod1" "$tmp/z3-zmesh.txt"
lod=$(sed -n 's/^zm\/truck.lod1.zmesh: [0-9]* meshes, \([0-9]*\) triangles$/\1/p' "$tmp/z3-zmesh.txt")
[ -n "$lod" ] && [ "$lod" -gt 0 ] && [ "$lod" -lt 3624 ] || { echo "model: the LOD has ${lod:-no} triangles"; fail=1; }
grep -q "damaged parts refused: cut short true, index past the vertices true" "$tmp/z3-zmesh.txt" || { echo "model: zinc:3d took a damaged .zmesh part"; fail=1; }
if [ -f "$tmp/z3-zmesh-2.png" ] && [ -f "$tmp/z3-gltf-2.png" ]; then
  o=$(close "$tmp/z3-zmesh-2.png" "$tmp/z3-gltf-2.png" 0.5 0.5) && echo "zinc:3d, .zmesh against the GLB: $o" || { echo "model: zinc:3d .zmesh frame: $o"; fail=1; }
else
  echo "model: zinc:3d drew no frame: $(tail -c 300 "$tmp/z3-zmesh.txt") $(tail -c 300 "$tmp/z3-gltf.txt")"; fail=1
fi
[ $fail -eq 0 ] && echo "model: ok"
exit $fail
