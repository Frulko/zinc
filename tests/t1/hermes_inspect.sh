#!/bin/sh
# Chrome DevTools on --engine hermes (ZN-773.08): tests/v8_inspect_check.mjs plays DevTools against zinc run --engine hermes --inspect-brk=0, as for
# V8 (discovery, the source map inline, the pause at start, a debugger statement, evaluate on its frame, a breakpoint, a step, console.log, the
# end), through Hermes's CDP agent. Skips (77) without node or without libzn_engine_hermes beside zinc (tools/hermes-pack).
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null 2>&1 || exit 77
[ -f "$(dirname "$ZINC")/libzn_engine_hermes.dylib" ] || exit 77
out=$(timeout 90 node tests/v8_inspect_check.mjs "$ZINC" tests/data/v8_inspect/main.js hermes 2>&1) || { echo "$out" | grep -v "^ok"; exit 1; }
