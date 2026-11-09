#!/bin/sh
# zinc dev --target web --engine wasm (docs/targets/web.md, "Two engines"): tests/fixtures/web-dev-wasm runs on the ZBC interpreter in WebAssembly in a
# cross-origin isolated page; a type error shows on the page, the next good save reloads it with the new output; another Host is refused.
# tools/web-dev-wasm-test drives headless Chrome. Skipped (77) without Chrome or python3.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_dev_wasm: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_dev_wasm: no Chrome"; exit 77; }
out=$(timeout 180 python3 -I tools/web-dev-wasm-test "$Z" tests/fixtures/web-dev-wasm) || { echo "web_dev_wasm: $out"; exit 1; }
exit 0
