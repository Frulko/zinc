#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
python3 - "$tmp" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
(root / 'zinc.json').write_text(json.dumps({'name': 'blob-routes', 'entry': 'main.ts', 'app': {'id': 'org.zinc.blobroutes'}}))
(root / 'main.ts').write_text("import { rect } from 'zinc:gfx';\nrect(0, 0, 10, 10, 0);\n" + '\n'.join('console.log("' + 'embedded tables keep common string prefixes across separate constants: ' + str(i) + '");' for i in range(20)))
PY
for route in native noembed bundle; do
  set -- "$tmp/main.ts" -o "$tmp/$route"
  case $route in
    noembed) set -- "$@" --no-embed ;;
    bundle) set -- --bundle "$tmp/main.ts" -o "$tmp/bundle.app" ;;
  esac
  if CXX=false ZN_KEEP_CPP=1 "$ZINC" build "$@" > "$tmp/$route.log" 2>&1; then
    echo "aot blob routes: failing compiler succeeded for $route"; exit 1
  fi
done
ZN_AOT_CPP_ONLY=1 CXX=false "$ZINC" build "$tmp/main.ts" -o "$tmp/export" > "$tmp/export.log" 2>&1
"$ZINC" --emit=cpp "$tmp/main.ts" > "$tmp/stdout.cpp"
python3 - "$tmp" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
assert 'unpackEmbeddedBlob' in (root / 'native.cpp').read_text()
for route in ('noembed.cpp', 'export.cpp', 'stdout.cpp'):
    assert 'unpackEmbeddedBlob' not in (root / route).read_text(), route
bundled = list((root / 'bundle.app').glob('Contents/MacOS/*.cpp'))
assert len(bundled) == 1, bundled
assert 'unpackEmbeddedBlob' not in bundled[0].read_text()
assert (root / 'noembed.res').read_bytes().startswith(b'ZRS1')
resources = list((root / 'bundle.app').glob('Contents/Resources/*.res'))
assert len(resources) == 1 and resources[0].read_bytes().startswith(b'ZRS1')
PY
echo 'aot blob routes: ok'
