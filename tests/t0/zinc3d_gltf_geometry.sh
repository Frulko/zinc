#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
command -v node >/dev/null 2>&1 || { echo 'glTF stand-in source check needs Node'; exit 77; }
timeout 10 node -e "require.resolve('@typescript/typescript6')" >/dev/null 2>&1 || { echo 'glTF stand-in source check needs the existing TypeScript6 test dependency'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir -p "$tmp/p/assets"
python3 tests/data/zinc3d_gltf_geometry/fixtures.py "$tmp/p/assets"
python3 - "$PWD" "$tmp/p/main.ts" <<'PYCODE'
from pathlib import Path
import sys, os
relative=os.path.relpath(Path(sys.argv[1])/'plugins/three/native/three.spec.ts',Path(sys.argv[2]).parent)
Path(sys.argv[2]).write_text(Path('tests/data/zinc3d_gltf_geometry/main.ts').read_text().replace('__THREE_SPEC__',relative))
PYCODE
printf '{"name":"gltf-geometry","entry":"main.ts","assets":"assets"}\n' > "$tmp/p/zinc.json"
for engine in interp native quickjs; do
  case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 40 "$ZINC" run "$tmp/p" "$@" > "$tmp/$engine.out" 2> "$tmp/$engine.err" || { cat "$tmp/$engine.err"; exit 1; }
  printf 'glTF geometry, material factors, strict failures and document cleanup passed\n' | diff -u - "$tmp/$engine.out"
done

timeout 10 node --no-warnings tests/native/gltf_sim_registry.mjs "$tmp/p/assets"
