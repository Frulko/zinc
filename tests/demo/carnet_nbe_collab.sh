#!/bin/sh
# examples/carnet-nbe, two people on @nbe/collab: window A serves the relay on a free local port, window B joins it, waits for the pages
# (the input starts at frame 600) and types a block (tests/data/carnet-nbe/join.input). Checked: A writes B's block to its own vault,
# and B's vault has it too. Skipped (77) when Carnet's packages are not linked. KEEP=dir keeps the logs and vaults.
cd "$(dirname "$0")/../.." || exit 2
app=examples/carnet-nbe
[ -d "$app/node_modules/@nbe/core/src" ] || { echo "Carnet's packages are not linked (examples/carnet-nbe/link.sh)"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); a=; b=
trap 'kill $a $b 2>/dev/null; wait 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp -R "$tmp"/*.out "$tmp"/va "$tmp"/vb "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1280x820 ZINC_FRAMES=100000000 CARNET_PORT=$((20000 + ($$ + 857) % 20000))
(cd "$app" && CARNET_NAME=Ada CARNET_VAULT="$tmp/va" exec "$Z" run . > "$tmp/a.out" 2>&1) & a=$!
for i in $(seq 50); do nc -z 127.0.0.1 $CARNET_PORT 2>/dev/null && break; sleep 0.2; done
input=$(pwd)/tests/data/carnet-nbe/join.input
(cd "$app" && CARNET_NAME=Grace CARNET_VAULT="$tmp/vb" ZINC_INPUT="$input" exec "$Z" run . > "$tmp/b.out" 2>&1) & b=$!
want='Typed by Grace in the other window.'
for i in $(seq 100); do grep -qF "$want" "$tmp/va/01-welcome.md" 2>/dev/null && grep -qF "$want" "$tmp/vb/01-welcome.md" 2>/dev/null && break; sleep 0.2; done
fail=0
grep -qF "$want" "$tmp/va/01-welcome.md" 2>/dev/null || { echo "carnet-nbe collab: A did not save B's block: $(tail -3 "$tmp/a.out" "$tmp/b.out" | tr '\n' ' ')"; fail=1; }
grep -qF "$want" "$tmp/vb/01-welcome.md" 2>/dev/null || { echo "carnet-nbe collab: B did not save its own block"; fail=1; }
[ $fail -eq 0 ] && echo "carnet-nbe collab: ok"
exit $fail
