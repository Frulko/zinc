#!/bin/sh
# 3D in a browser (ZN-563.03): the web exports of examples/three/cubes (three.js on WebGL 2, plugins/three/web) and examples/3d/cubes (zinc:3d on
# WebGL 2, plugins/3d/web/render3d.js) draw frame 30 in headless Chrome on a fixed 1/60 s clock; each is compared with the software renderer's frame
# (tests/golden/examples). three/cubes: SSIM >= 0.95. 3d/cubes: >= 0.93 below its readout (the GPU's mipmaps and multisampling against nearest
# texels and hard edges: the native GPU renderer scores 0.945 there, and the browser's frame is 0.998 of the native GPU's).
# Skipped (77) without Chrome.
cd "$(dirname "$0")/../.." || exit 2
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_3d: no Chrome"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
N=30
INIT="(() => { let T = 0; performance.now = () => T; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => ((globalThis.__zincFrames || 0) >= $N - 1 ? 0 : raf(() => { T += 1000 / 60; cb(T); })); })()"
check() {   # example golden size ssim [crop]
  ex=$1; name=$(echo "$ex" | tr / -)
  cp -R "examples/$ex" "$tmp/$name"
  "$ZINC" export "$tmp/$name" --target web -o "$tmp/$name-web" >"$tmp/$name.log" 2>&1 || { echo "web_3d: $ex: the export failed: $(tail -3 "$tmp/$name.log")"; fail=1; return; }
  grep -q W0602 "$tmp/$name.log" && { echo "web_3d: $ex: a native side has no browser backend: $(grep W0602 "$tmp/$name.log")"; fail=1; }
  out=$(python3 -I tools/web-browser-test "$tmp/$name-web" --wait 3 --size "$3" --init "$INIT" --shot "$tmp/$name.png" --eval "globalThis.__zincFrames") || { echo "web_3d: $ex: Chrome failed: $out"; fail=1; return; }
  case "$out" in *'"errors": []'*) ;; *) echo "web_3d: $ex: $out"; fail=1; return ;; esac
  r=$(python3 -I tools/pngdiff "tests/golden/examples/$2" "$tmp/$name.png" --ssim "$4" ${5:+--crop $5} | tail -1) || { echo "web_3d: $ex in Chrome: $r against the software frame"; fail=1; return; }
  echo "web_3d: $ex in Chrome: $r against the software frame"
}
check three/cubes three-cubes-30.png 800x500 0.95
check 3d/cubes 3d-cubes-30.png 640x480 0.93 0,40,640,440
exit $fail
