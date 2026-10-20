#!/bin/sh
# zinc dev --target web (docs/targets/web.md, "Hot reload"): the web-hot fixture is served, a counter is clicked up, a component is edited (Fast Refresh: the text changes, the counter and
# the page stay), a file is broken (an overlay with the diagnostics) and fixed, and the state module is edited (a full reload). tools/web-dev-test drives headless Chrome over the DevTools
# pipe. Skipped (77) without Chrome or python3. Firefox and Safari are not tested here.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_dev: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_dev: no Chrome"; exit 77; }
out=$(timeout 150 python3 -I tools/web-dev-test "$Z" tests/fixtures/web-hot) || { echo "web_dev: $out"; exit 1; }
exit 0
