#!/bin/sh
# zinc export --target wasm (ZN-326.01): the hello and a zinc:ui example (examples/ui/forms) as static sites (index.html, app.js, app.wasm, app.zbc, serve.py), each served
# by its own serve.py and run in headless Chrome: hello prints what it prints natively, forms draws its 960x600 canvas (zinc.json targets.wasm). Skipped (77) without Chrome or the pinned zig.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME=$(command -v google-chrome chromium chromium-browser 2>/dev/null | head -1)
[ -n "$CHROME" ] && [ -x "$CHROME" ] || { echo "export_wasm: no Chrome"; exit 77; }
ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-* >/dev/null 2>&1 || { echo "export_wasm: no pinned zig downloaded"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" export ../examples/hello --target wasm -o "$tmp/hello" >/dev/null || { echo "export_wasm: the hello export failed"; exit 1; }
"$Z" export ../examples/ui/forms --target wasm -o "$tmp/forms" >/dev/null || { echo "export_wasm: the forms export failed"; exit 1; }
for f in index.html app.js app.wasm app.zbc worker.mjs wasi.mjs serve.py; do [ -s "$tmp/hello/$f" ] || { echo "export_wasm: $f is missing"; fail=1; }; done
grep -q '<title>hello</title>' "$tmp/hello/index.html" || { echo "export_wasm: the page is not titled after the app"; fail=1; }
grep -q 'width="960" height="600"' "$tmp/forms/index.html" || { echo "export_wasm: the canvas does not take zinc.json targets.wasm"; fail=1; }
python3 tools/wasm-export-test "$CHROME" "$tmp/hello" 0 "$("$Z" run ../examples/hello)" || fail=1   # the same bytes as the native run
python3 tools/wasm-export-test "$CHROME" "$tmp/forms" 30 "exit 0" || fail=1
exit $fail
