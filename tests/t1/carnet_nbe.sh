#!/bin/sh
# examples/carnet-nbe, headless: the session of examples/carnet and a new note (tests/data/carnet-nbe/session.input) on Carnet's own packages (@nbe/core,
# @nbe/markdown, @nbe/collab, linked by examples/carnet-nbe/link.sh). Checked: the note saved by @nbe/markdown to its file in the vault
# (tests/golden/carnet-nbe/welcome.md: the split, the slash menu's heading, the list and to-do shortcuts, "> " a toggle as in Carnet, the
# front matter kept), a [[wikilink]] typed in a new note made with Cmd+N and renamed by its title (tests/golden/carnet-nbe/ideas.md),
# and a second run left alone, its relay served on a free local port, paints nothing after its first frame (paint p99 0.00 over 300).
# Skipped (77) when the packages are not linked. KEEP=dir keeps the run's output and vault. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
app=examples/carnet-nbe
[ -d "$app/node_modules/@nbe/core/src" ] || { echo "Carnet's packages are not linked (examples/carnet-nbe/link.sh)"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$(pwd)/tests/golden/carnet-nbe
input=$(pwd)/tests/data/carnet-nbe/session.input
tmp=$(mktemp -d)
trap '[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp -R "$tmp"/*.out "$tmp"/vault "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1280x820 CARNET_NAME=Ada CARNET_VAULT="$tmp/vault" \
  CARNET_PORT=$((20000 + ($$ + 419) % 20000)) CARNET_LISTEN=127.0.0.1
fail=0
(cd "$app" && CARNET_OFFLINE=1 ZINC_FRAMES=200 ZINC_INPUT="$input" timeout 60 "$Z" run . > "$tmp/session.out" 2>&1) || { echo "carnet-nbe: the session failed: $(tail -5 "$tmp/session.out")"; exit 1; }
for pair in "Welcome to Carnet.md:welcome.md" "Ideas.md:ideas.md"; do
  note=${pair%%:*} want=$gold/${pair#*:}
  [ -n "$UPDATE" ] && cp "$tmp/vault/$note" "$want"
  cmp -s "$tmp/vault/$note" "$want" || { echo "carnet-nbe: $note differs: $(diff "$tmp/vault/$note" "$want" 2>&1 | head -6 | tr '\n' ' ')"; fail=1; }
done
rm -rf "$tmp/vault"
(cd "$app" && ZINC_FRAMES=300 ZINC_PROFILE=1 timeout 60 "$Z" run . > "$tmp/idle.out" 2>&1)
grep -q 'zinc profile: paint p50=0.00 p99=0.00 ' "$tmp/idle.out" || { echo "carnet-nbe: frames are painted while idle: $(grep 'profile: paint' "$tmp/idle.out" || tail -3 "$tmp/idle.out")"; fail=1; }
[ $fail -eq 0 ] && echo "carnet-nbe: ok"
exit $fail
