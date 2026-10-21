#!/bin/sh
# Chrome DevTools on --engine v8 (ZN-773.05): tests/v8_inspect_check.mjs plays DevTools against zinc run --inspect-brk=0 (discovery, the source map
# inline, the pause at start, a debugger statement, evaluate on its frame, console.log, the end). Skips (77) without node or without
# libzn_engine_v8 beside zinc (tools/v8-pack).
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null 2>&1 || exit 77
[ -f "$(dirname "$ZINC")/libzn_engine_v8.dylib" ] || [ -f "$(dirname "$ZINC")/libzn_engine_v8.so" ] || exit 77
out=$(timeout 90 node tests/v8_inspect_check.mjs "$ZINC" tests/data/v8_inspect/main.js 2>&1) || { echo "$out" | grep -v "^ok"; exit 1; }
