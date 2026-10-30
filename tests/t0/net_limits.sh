#!/bin/sh
# zinc:net server limits and streams (ZN-892): keep-alive and pipelining, 431, 413, connections per address, slowloris (408), the keep-alive
# timeout, the request rate (429), a streamed request body and a streamed reply with back-pressure. The interpreter, QuickJS and AOT.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "no python3"; exit 77; }
tmp=$(mktemp -d)
trap 'kill $srv 2>/dev/null; rm -rf "$tmp"' EXIT
"$ZINC" build tests/golden/host/net_limits.ts -o "$tmp/aot" >"$tmp/build.log" 2>&1 || { echo "AOT build failed: $(tail -3 "$tmp/build.log")"; exit 1; }
base=18960
for engine in interp quickjs aot; do
  a=$base; b=$((base + 1)); c=$((base + 2)); base=$((base + 3))
  case $engine in
    interp) "$ZINC" run tests/golden/host/net_limits.ts -- $a $b $c > "$tmp/srv" 2>&1 & ;;
    quickjs) "$ZINC" run tests/golden/host/net_limits.ts --engine quickjs -- $a $b $c > "$tmp/srv" 2>&1 & ;;
    aot) "$tmp/aot" $a $b $c > "$tmp/srv" 2>&1 & ;;
  esac
  srv=$!
  for _ in $(seq 50); do grep -q ready "$tmp/srv" 2>/dev/null && break; sleep 0.1; done
  timeout 60 python3 tests/t0/net_limits.py $a $b $c > "$tmp/out" 2>&1
  kill $srv 2>/dev/null; wait $srv 2>/dev/null
  diff "$tmp/out" tests/golden/host/net_limits.out > "$tmp/diff" || { echo "zinc:net limits on $engine differ from tests/golden/host/net_limits.out:"; head -20 "$tmp/diff"; echo "server: $(head -5 "$tmp/srv")"; exit 1; }
done
