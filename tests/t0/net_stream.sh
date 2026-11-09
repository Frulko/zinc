#!/bin/sh
# zinc:net bodies streamed from disk (ZN-1028, tests/golden/host/net_stream.ts): a RequestInit.bodyFile upload read as the socket takes it,
# its 413 from a server with a small maxBodyBytes (the limit named in the body), a Reply.file by sendfile(2); on the interpreter, QuickJS
# and the compiled program, against tests/golden/host/net_stream.out.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export NET_STREAM_DIR=$tmp
fail=0
timeout 60 "$ZINC" run tests/golden/host/net_stream.ts 2>/dev/null | diff - tests/golden/host/net_stream.out >"$tmp/d" || { echo "interpreter: $(head -5 "$tmp/d")"; fail=1; }
timeout 60 "$ZINC" run tests/golden/host/net_stream.ts --engine quickjs 2>/dev/null | diff - tests/golden/host/net_stream.out >"$tmp/d" || { echo "QuickJS: $(head -5 "$tmp/d")"; fail=1; }
if "$ZINC" build tests/golden/host/net_stream.ts -o "$tmp/app" >"$tmp/log" 2>&1; then
  timeout 60 "$tmp/app" 2>/dev/null | diff - tests/golden/host/net_stream.out >"$tmp/d" || { echo "compiled: $(head -5 "$tmp/d")"; fail=1; }
else echo "the program does not build: $(tail -c 300 "$tmp/log")"; fail=1; fi
exit $fail
