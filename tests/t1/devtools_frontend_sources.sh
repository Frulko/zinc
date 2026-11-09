#!/bin/sh
# zinc debug --cdp in Chrome's own DevTools frontend (ZN-709): js_app.html in headless Chrome lists main.ts in Sources, a click in the editor's
# gutter sets a breakpoint, the Resume button runs to it, the Scope pane shows the locals, a frontend opened again finds the program paused;
# no error reply and no exception in the frontend. A few seconds. Skips (77) without Chrome.
cd "$(dirname "$0")/../.." || exit 2
out=$(timeout 90 python3 tests/devtools_frontend_check.py sources "$ZINC" tests/data/debug_cli/main.ts 2>&1); code=$?
[ $code -eq 77 ] && exit 77
[ $code -eq 0 ] || { echo "$out" | grep -v "^ok"; exit 1; }
