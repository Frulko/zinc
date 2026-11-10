#!/bin/sh
# Manual feature proof, outside the tiers: ZINC=... timeout 60 tests/wasm/loading_export.sh
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"$Z" export tests/data/wasm_loading --target wasm -o "$tmp/site" >/dev/null
python3 tools/wasm-loading-test "$tmp/site" "$tmp/proof"
# An asset-free app must not export stale packs left by an older cooking pass.
mkdir -p "$tmp/empty/build/assets/wasm"
cp -R examples/hello/src "$tmp/empty/src"
cp examples/hello/zinc.json "$tmp/empty/zinc.json"
cp "$tmp/site/"*.zpk "$tmp/empty/build/assets/wasm/stale.zpk"
"$Z" export "$tmp/empty" --target wasm -o "$tmp/empty-site" >/dev/null
python3 - "$tmp/empty-site" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1])
assert json.loads((p/'boot.json').read_text())['packs']==[]
assert not (p/'ktx2.wasm').exists()
PY
