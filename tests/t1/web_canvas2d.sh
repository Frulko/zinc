#!/bin/sh
# zinc:canvas's browser version (plugins/canvas2d/web) draws examples/canvas/sketch in a page: a screen context's begin/end kept its canvas on the browser's context through
# the proxy and the first end() threw (fields the proxy did not know). tools/web-real-test, DOM render. Skipped (77) without Chrome or python3.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_canvas2d: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_canvas2d: no Chrome"; exit 77; }
timeout 200 python3 -I tools/web-real-test "$Z" examples/canvas/sketch --render dom --wait 3 2>/dev/null | tail -1 | python3 -I -c "import json, sys; d = json.loads(sys.stdin.read()); p = d.get('problems') or []; sys.exit(0 if not p and d.get('nonblank', 0) > 0.05 else (print('web_canvas2d: %s' % p[:2]) or 1))" || exit 1
exit 0
