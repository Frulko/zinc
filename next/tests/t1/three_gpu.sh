#!/bin/sh
# zinc:3d on the GPU (ZN-563): three/cubes and three/gltf-viewer, compiled (AOT) and drawn by render3d.gl.cpp, are the software renderer's frames
# (tests/golden/examples, SSIM >= 0.95) read synchronously (deterministic) and one frame late (asynchronous read); the renderer is the one the option
# "renderer" (zinc.json), ZINC_3D or a deterministic run (software, for the goldens) chooses.
cd "$(dirname "$0")/../.." || exit 2
[ -z "$ZINC_CI" ] || { echo "skipped: needs a real GPU (a hosted CI runner has a virtual one: no multisampling, other pixels)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
shot() {   # example frame file [env...]
  ex=$1; f=$2; out=$3; shift 3
  env "$@" ZINC_RUN=native ZINC_3D=gpu ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=$f ZINC_SCALE=1 ZINC_SHOT="$tmp/$out.png" ZINC_SHOT_FRAMES=$f "$ZINC" run "../examples/$ex" >"$tmp/$out.log" 2>&1
  [ -f "$tmp/$out-$f.png" ] || { echo "$ex: no frame $f: $(head -c 300 "$tmp/$out.log")"; fail=1; return 1; }
}
for e in three/cubes:three-cubes three/gltf-viewer:three-gltf-viewer; do
  ex=${e%%:*}; name=${e#*:}
  shot "$ex" 30 "$name" && { tools/pngdiff "$tmp/$name-30.png" "tests/golden/examples/$name-30.png" --ssim 0.95 >"$tmp/q" || { echo "$ex on the GPU: $(tail -1 "$tmp/q") against the software frame"; fail=1; }; }
done
# highlights (ZN-563.04): Phong and Standard spheres, per vertex in software (the golden, exact) and per pixel on the GPU
ZINC_3D=software ZINC_RUN=native ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_SCALE=1 ZINC_SHOT="$tmp/sw.png" ZINC_SHOT_FRAMES=3 "$ZINC" run tests/data/three_specular >/dev/null 2>&1
tools/pngdiff "$tmp/sw-3.png" tests/golden/examples/three-specular-3.png >"$tmp/q" || { echo "three_specular in software: $(head -1 "$tmp/q")"; fail=1; }
ZINC_RUN=native ZINC_3D=gpu ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_SCALE=1 ZINC_SHOT="$tmp/spec.png" ZINC_SHOT_FRAMES=3 "$ZINC" run tests/data/three_specular >/dev/null 2>&1
tools/pngdiff "$tmp/spec-3.png" tests/golden/examples/three-specular-3.png --ssim 0.9 >"$tmp/q" || { echo "three_specular on the GPU: $(tail -1 "$tmp/q") against the software frame"; fail=1; }
# asynchronous read: frame 31 shows frame 30
shot three/cubes 31 async ZINC_GL_PRESENT=async && { tools/pngdiff "$tmp/async-31.png" tests/golden/examples/three-cubes-30.png --ssim 0.95 >"$tmp/q" || { echo "three/cubes, asynchronous read: $(tail -1 "$tmp/q")"; fail=1; }; }
# which renderer: the GPU counts the triangles it is given (12 for a cube), the software renderer those it draws (the faces turned to the camera)
mkdir -p "$tmp/p/src"
printf "import { onFrame, quit } from 'zinc:gfx';\nimport { Scene, Camera, Node, Material, cube, render } from 'zinc:3d';\nconst scene = new Scene();\nscene.add(new Node(cube(1), new Material(0xff8000)));\nconst camera = new Camera().setPosition(0, 0, 4).lookAt(0, 0, 0);\nonFrame((dt: number) => { console.log('triangles ' + render(scene, camera, 0, 0, 64, 48)); quit(); });\n" > "$tmp/p/src/main.ts"
renderer() {   # zinc.json renderer (or none), env... -> gpu | software
  r=$1; shift
  if [ -n "$r" ]; then printf '{ "name": "p", "entry": "src/main.ts", "targets": { "macos": { "plugins": { "3d": { "renderer": "%s" } } } } }\n' "$r"; else printf '{ "name": "p", "entry": "src/main.ts" }\n'; fi > "$tmp/p/zinc.json"
  n=$(env -u ZINC_DETERMINISTIC "$@" ZINC_HEADLESS=1 "$ZINC" run "$tmp/p" 2>&1 | sed -n 's/^triangles //p')
  [ "$n" = 12 ] && echo gpu || { [ -n "$n" ] && echo software || echo "none"; }
}
check() { got=$(renderer "$@"); [ "$got" = "$want" ] || { echo "renderer with zinc.json '$1' and ${2:-no env}: $got, want $want"; fail=1; }; }
want=gpu; check ""
want=software; check "" ZINC_DETERMINISTIC=1
want=gpu; check "" ZINC_DETERMINISTIC=1 ZINC_3D=gpu
want=software; check software
want=gpu; check gpu ZINC_DETERMINISTIC=1
want=software; check gpu ZINC_3D=software
exit $fail
