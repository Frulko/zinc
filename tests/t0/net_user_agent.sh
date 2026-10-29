#!/bin/sh
# zinc:net fetch's User-Agent (tests/golden/host/net_user_agent.ts): the program's own is sent alone, zinc/0.1 when it gives none; a server on
# the interpreter answers with what it got, asked by the interpreter and QuickJS. Port 18845.
cd "$(dirname "$0")/../.." || exit 2
pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null' EXIT
want='MyApp/1.0 ( https://example.org ) | zinc/0.1'
NET_UA_SERVE=1 timeout 120 "$ZINC" run --interp tests/golden/host/net_user_agent.ts >/dev/null 2>&1 &
pid=$!
for i in $(seq 1 100); do curl -s -o /dev/null http://127.0.0.1:18845/ && break; sleep 0.2; done
fail=0
check() { out=$("$@" 2>/dev/null | tail -1); [ "$out" = "$want" ] || { echo "$*: $out, want $want"; fail=1; }; }
check timeout 30 "$ZINC" run --interp tests/golden/host/net_user_agent.ts
check timeout 30 "$ZINC" run tests/golden/host/net_user_agent.ts --engine quickjs
kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
exit $fail
