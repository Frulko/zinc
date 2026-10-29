#!/bin/sh
# zinc:net Reply.file (tests/golden/host/net_file.ts): a 3 MiB file in blocks, byte ranges (206, suffix, open-ended), 416, 404 and an
# async handler, on the interpreter, QuickJS and the compiled program, against tests/golden/host/net_file.out.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export NET_FILE_DIR=$tmp
fail=0
timeout 60 "$ZINC" run tests/golden/host/net_file.ts 2>/dev/null | diff - tests/golden/host/net_file.out >"$tmp/d" || { echo "interpreter: $(head -5 "$tmp/d")"; fail=1; }
timeout 60 "$ZINC" run tests/golden/host/net_file.ts --engine quickjs 2>/dev/null | diff - tests/golden/host/net_file.out >"$tmp/d" || { echo "QuickJS: $(head -5 "$tmp/d")"; fail=1; }
if "$ZINC" build tests/golden/host/net_file.ts -o "$tmp/app" >"$tmp/log" 2>&1; then
  timeout 60 "$tmp/app" 2>/dev/null | diff - tests/golden/host/net_file.out >"$tmp/d" || { echo "compiled: $(head -5 "$tmp/d")"; fail=1; }
else echo "the program does not build: $(tail -c 300 "$tmp/log")"; fail=1; fi
exit $fail
