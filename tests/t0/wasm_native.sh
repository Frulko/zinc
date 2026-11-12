#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"
[ -s build-wasm/vm-web.wasm ] || { echo 'wasm_native: build tools/build-wasm first'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
timeout 10 "$ZINC" --emit=zbc-bin tests/data/wasm_native/arrays.ts "$tmp/arrays.zbc"
timeout 10 node --no-warnings tests/wasm/native.mjs build-wasm/vm-web.wasm "$tmp/arrays.zbc"
