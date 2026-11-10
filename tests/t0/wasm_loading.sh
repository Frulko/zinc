#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ -s build-wasm/vm-web.wasm ] && [ -s build-wasm/ktx2-web.wasm ] || { echo 'wasm_loading: build tools/build-wasm first'; exit 77; }
timeout 10 node --no-warnings tests/wasm/loading.mjs build-wasm/vm-web.wasm build-wasm/ktx2-web.wasm
