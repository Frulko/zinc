#!/bin/sh
# The Styles panel in Chrome's own DevTools frontend (ZN-704): tests/data/devtools_styles runs with the inspector on a free port and
# tests/devtools_frontend_check.py styles drives inspector.html in headless Chrome through its UI: rows of Elements clicked and unfolded, the
# class rule and the StyleSheet rule in Styles (shorthands with their longhands), padding-left 8 -> 20 typed into the box model, a colour
# typed into element.style, the app's frame and the console patch after each; no error reply and no exception in the frontend. About ten
# seconds. Skips (77) without Chrome.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $app 2>/dev/null; rm -rf "$tmp"' EXIT
port=$(python3 tests/free_ports.py)
ZINC_DEV=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 90 "$ZINC" run tests/data/devtools_styles > "$tmp/app.log" 2>&1 & app=$!
n=0; while [ $n -lt 400 ] && ! grep -q "zinc devtools:" "$tmp/app.log"; do sleep 0.05; n=$((n+1)); done
grep -q "localhost:$port)" "$tmp/app.log" || { echo "the inspector does not listen on $port: $(cat "$tmp/app.log")"; exit 1; }
timeout 90 python3 tests/devtools_frontend_check.py styles "$port" > "$tmp/check.log" 2>&1; code=$?
[ $code -eq 77 ] && exit 77
[ $code -eq 0 ] || { grep -v "^ok" "$tmp/check.log"; exit 1; }
