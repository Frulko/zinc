#!/bin/sh
# The Styles panel (ZN-369): tests/data/devtools_styles runs with the inspector on a free port and scripts/cdp-check.mjs --styles reads the rules of a
# class-styled and a StyleSheet-styled box, edits element.style as the box model does (padding-left, background), checks the box and the frame after
# each edit and the patch sent to the console (the class string, the style keys). Skips (77) without node.
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null 2>&1 || exit 77
tmp=$(mktemp -d); trap 'kill $app 2>/dev/null; rm -rf "$tmp"' EXIT
port=$(python3 tests/free_ports.py)
ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 90 "$ZINC" run tests/data/devtools_styles > "$tmp/app.log" 2>&1 & app=$!
n=0; while [ $n -lt 400 ] && ! grep -q "zinc devtools:" "$tmp/app.log"; do sleep 0.05; n=$((n+1)); done
grep -q "localhost:$port)" "$tmp/app.log" || { echo "the inspector does not listen on $port: $(cat "$tmp/app.log")"; exit 1; }
node ../scripts/cdp-check.mjs "$port" --styles > "$tmp/check.log" 2>&1 || { grep -v "^ok" "$tmp/check.log"; exit 1; }
