#!/bin/sh
# Web platform globals (ZN-095): the WPT URL data through `new URL` (896 parser cases, 278 setter cases: all must pass, as in the prototype), and a program that names no web
# global links nothing of lib/std/web.ts (no URL, Event or Headers class in its bytecode).
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" run tests/golden/host/wpt_url.ts -- tests/data/wpt 2>&1)
printf '%s\n' "$out" | grep -qx "urltestdata 896/896" && printf '%s\n' "$out" | grep -qx "setters_tests 278/278" || { echo "WPT URL data: $out" | head -6; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'console.log(1 + 2);\n' > "$tmp/plain.ts"
"$ZINC" --emit=zbc "$tmp/plain.ts" > "$tmp/plain.zbc.txt" 2>&1
grep -qE "URL|EventTarget|Headers|TextEncoder" "$tmp/plain.zbc.txt" && { echo "a program without web globals links web.ts"; exit 1; }
printf 'console.log(new URL("http://a.b/c").pathname);\n' > "$tmp/uses.ts"
"$ZINC" --emit=zbc "$tmp/uses.ts" 2>&1 | grep -q "URL" || { echo "a program with URL does not link it"; exit 1; }
exit 0
