#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"
[ -s build-wasm/vm-web.wasm ] || { echo 'wasm_native: build tools/build-wasm first'; exit 77; }
timeout 10 node --no-warnings tests/wasm/native.mjs build-wasm/vm-web.wasm
