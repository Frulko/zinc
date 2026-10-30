#!/bin/sh
# zinc:net serveAsync (tests/golden/host/net_slow_reply.ts): a handler that answers after 11 s, past the server's 10 s idle limit, still sends
# its reply (it used to be cut with a 408), on the interpreter and QuickJS. About 12 s each.
cd "$(dirname "$0")/../.." || exit 2
fail=0
out=$(timeout 40 "$ZINC" run tests/golden/host/net_slow_reply.ts 2>/dev/null); [ "$out" = "$(cat tests/golden/host/net_slow_reply.out)" ] || { echo "interpreter: $out"; fail=1; }
out=$(timeout 40 "$ZINC" run tests/golden/host/net_slow_reply.ts --engine quickjs 2>/dev/null); [ "$out" = "$(cat tests/golden/host/net_slow_reply.out)" ] || { echo "QuickJS: $out"; fail=1; }
exit $fail
