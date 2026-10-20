#!/bin/sh
# Breakout in a browser through the glue (ZN-135): headless Chrome loads targets/wasm/glue/index.html (served with COOP/COEP), the program runs on vm-web.wasm in a worker, draws on an
# OffscreenCanvas and the last frame is compared with the native frame of `zinc capture` (the rectangles must match; text is the browser's own). Skipped without Chrome.
cd "$(dirname "$0")/../.." || exit 2
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME=$(command -v google-chrome chromium chromium-browser 2>/dev/null | head -1)
[ -n "$CHROME" ] && [ -x "$CHROME" ] || { echo "wasm_browser: no Chrome, skipped"; exit 0; }
tools/build-wasm >/dev/null 2>&1 || { echo "tools/build-wasm failed"; exit 1; }
exec python3 tools/wasm-browser-test "$CHROME"
