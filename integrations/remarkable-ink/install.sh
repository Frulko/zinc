#!/bin/sh
# Installs the ink lane (dist/zinc-ink.so) into XOVI's extensions.d, on the tablet. Never restarts xochitl: the lane loads at
# the next `xovi/start` (one load test, then read the journal: docs/targets/remarkable-paper-pro.md, "Safety rules").
# Refuses when another extension hooks a symbol the lane overrides: XOVI exits xochitl at every start on a double hook, which
# is a restart storm by construction (remarkable-bridge-design.md §4.2).
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
EXT=${XOVI_EXTENSIONS:-/home/root/xovi/extensions.d}
SO=$HERE/dist/zinc-ink.so
fail() { echo "zinc-ink: $*" >&2; exit 1; }
[ -f "$SO" ] || fail "no $SO (build it with build.sh)"
[ -d "$EXT" ] || fail "no XOVI at $EXT"
[ -f "$EXT/framebuffer-spy.so" ] || fail "framebuffer-spy is not installed in $EXT (the lane reads xochitl's buffer through it)"
for sym in $(sed -n 's/^override[[:space:]]*\([^[:space:];]*\).*/\1/p' "$HERE/bridge.xovi"); do
  for other in "$EXT"/*.so; do
    [ "$(basename "$other")" = zinc-ink.so ] && continue
    if grep -q "override\$$sym" "$other"; then fail "$(basename "$other") already hooks $sym; XOVI would stop xochitl at every start"; fi
  done
done
cp "$SO" "$EXT/zinc-ink.so"
echo "zinc-ink: installed in $EXT; it loads at the next xovi/start (once per boot at most if xochitl ever dies while it is armed)"
