#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"
timeout 10 node tests/wasm/gfx.mjs
