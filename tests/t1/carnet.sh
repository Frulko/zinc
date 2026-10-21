#!/bin/sh
# examples/carnet, headless: a scripted session (tests/data/carnet/session.input) clicks
# into the first block of the welcome page, splits it, picks Heading 1 from the slash menu filtered by "head", types a bulleted list,
# a to-do and a quote through their Markdown shortcuts and leaves an empty list item with Enter. Checked: the frames of the menu
# open, of the heading and of the end (tests/golden/carnet/hashes.txt: frame and hash), the page saved as Markdown
# (tests/golden/carnet/01-welcome.md), all offline (the sidebar shows the relay's port), and a second run left alone, its relay served
# on a free local port, paints nothing after its first frame (paint p99 0.00 over 300).
# KEEP=dir keeps the run's output and vault. UPDATE=1 rewrites the goldens.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$(pwd)/tests/golden/carnet
tmp=$(mktemp -d)
trap '[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp -R "$tmp"/*.out "$tmp"/vault "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
cp -R examples/carnet "$tmp/app" && rm -rf "$tmp/app/vault" "$tmp/app/build"
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1280x820 CARNET_NAME=Ada CARNET_VAULT="$tmp/vault" \
  CARNET_PORT=$((20000 + ($$ + 311) % 20000)) CARNET_LISTEN=127.0.0.1
fail=0
# the page is written 0.8 s after its last change (frame 51): 130 frames see it saved
(cd "$tmp/app" && CARNET_OFFLINE=1 ZINC_FRAMES=130 ZINC_INPUT="$(cd "$gold/../../data/carnet" && pwd)/session.input" ZINC_FRAMEHASH=all \
  timeout 60 "$Z" run . > "$tmp/session.out" 2>&1) || { echo "carnet: the session failed: $(tail -5 "$tmp/session.out")"; exit 1; }
for f in 23 28 129; do grep "framehash $f " "$tmp/session.out" | awk '{print $3, $5}'; done > "$tmp/hashes.txt"
if [ -n "$UPDATE" ]; then cp "$tmp/hashes.txt" "$gold/hashes.txt"; cp "$tmp/vault/01-welcome.md" "$gold/01-welcome.md"; fi
cmp -s "$tmp/hashes.txt" "$gold/hashes.txt" || { echo "carnet: frames $(tr '\n' ' ' < "$tmp/hashes.txt"), recorded $(tr '\n' ' ' < "$gold/hashes.txt")"; fail=1; }
cmp -s "$tmp/vault/01-welcome.md" "$gold/01-welcome.md" || { echo "carnet: the page saved differs: $(diff "$tmp/vault/01-welcome.md" "$gold/01-welcome.md" | head -6 | tr '\n' ' ')"; fail=1; }
(cd "$tmp/app" && ZINC_FRAMES=300 ZINC_PROFILE=1 timeout 60 "$Z" run . > "$tmp/idle.out" 2>&1)
grep -q 'zinc profile: paint p50=0.00 p99=0.00 ' "$tmp/idle.out" || { echo "carnet: frames are painted while idle: $(grep 'profile: paint' "$tmp/idle.out")"; fail=1; }
[ $fail -eq 0 ] && echo "carnet: ok"
exit $fail
