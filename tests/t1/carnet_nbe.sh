#!/bin/sh
# examples/carnet-nbe, headless: the session of examples/carnet (tests/data/carnet/session.input) on Carnet's own packages (@nbe/core,
# @nbe/markdown, @nbe/collab, linked by examples/carnet-nbe/link.sh). Checked: the page saved by @nbe/markdown
# (tests/golden/carnet-nbe/01-welcome.md: the split, the slash menu's heading, the list and to-do shortcuts, "> " a toggle as in Carnet),
# and a second run left alone, its relay served on a free local port, paints nothing after its first frame (paint p99 0.00 over 300).
# Skipped (77) when the packages are not linked. KEEP=dir keeps the run's output and vault. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
app=examples/carnet-nbe
[ -d "$app/node_modules/@nbe/core/src" ] || { echo "Carnet's packages are not linked (examples/carnet-nbe/link.sh)"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$(pwd)/tests/golden/carnet-nbe
input=$(pwd)/tests/data/carnet/session.input
tmp=$(mktemp -d)
trap '[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp -R "$tmp"/*.out "$tmp"/vault "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1280x820 CARNET_NAME=Ada CARNET_VAULT="$tmp/vault" \
  CARNET_PORT=$((20000 + ($$ + 419) % 20000)) CARNET_LISTEN=127.0.0.1
fail=0
(cd "$app" && CARNET_OFFLINE=1 ZINC_FRAMES=130 ZINC_INPUT="$input" timeout 60 "$Z" run . > "$tmp/session.out" 2>&1) || { echo "carnet-nbe: the session failed: $(tail -5 "$tmp/session.out")"; exit 1; }
[ -n "$UPDATE" ] && cp "$tmp/vault/01-welcome.md" "$gold/01-welcome.md"
cmp -s "$tmp/vault/01-welcome.md" "$gold/01-welcome.md" || { echo "carnet-nbe: the page saved differs: $(diff "$tmp/vault/01-welcome.md" "$gold/01-welcome.md" | head -6 | tr '\n' ' ')"; fail=1; }
rm -rf "$tmp/vault"
(cd "$app" && ZINC_FRAMES=300 ZINC_PROFILE=1 timeout 60 "$Z" run . > "$tmp/idle.out" 2>&1)
grep -q 'zinc profile: paint p50=0.00 p99=0.00 ' "$tmp/idle.out" || { echo "carnet-nbe: frames are painted while idle: $(grep 'profile: paint' "$tmp/idle.out" || tail -3 "$tmp/idle.out")"; fail=1; }
[ $fail -eq 0 ] && echo "carnet-nbe: ok"
exit $fail
