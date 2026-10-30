#!/bin/sh
# The dev bridge of zinc dev --target web (docs/targets/web.md, "The dev bridge"): tests/fixtures/web-bridge uses zinc:process, which has no browser backend; its native side
# runs on this machine and the page gets a child's line (a callback) and a run() result (a promise); a request without the token is refused; the bridge stops with zinc dev.
# tools/web-bridge-test drives headless Chrome. Skipped (77) without Chrome or python3.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_bridge: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_bridge: no Chrome"; exit 77; }
out=$(timeout 120 python3 -I tools/web-bridge-test "$Z" tests/fixtures/web-bridge) || { echo "web_bridge: $out"; exit 1; }
exit 0
