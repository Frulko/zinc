#!/bin/sh
# Installs zinc-canvas (default) or the zinc-ink lane into XOVI's extensions.d, on the tablet. Never restarts xochitl: the extension
# loads at the next `xovi/start` (one load test, then read the journal: docs/targets/remarkable-paper-pro.md, "Safety rules").
#   sh install.sh [canvas|lane]
# canvas: copies dist/zinc-canvas.so and records this tablet's xochitl (SHA-256, model) in exthome/zinc-canvas/verified, the list
#         zinc-canvas checks at every start; after an OS update the hash differs and it stays off until this is run again.
# lane:   copies dist/zinc-ink.so (needs framebuffer-spy).
# Both answer on /run/zinc-ink.sock, so one at a time. Refuses when another extension hooks a symbol the extension overrides: XOVI exits
# xochitl at every start on a double hook, which is a restart storm by construction (remarkable-bridge-design.md §4.2).
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
EXT=${XOVI_EXTENSIONS:-/home/root/xovi/extensions.d}
WHAT=${1:-canvas}
fail() { echo "zinc-$WHAT: $*" >&2; exit 1; }
case $WHAT in
  canvas) SO=zinc-canvas.so XOVI=canvas.xovi OTHER=zinc-ink.so ;;
  lane) SO=zinc-ink.so XOVI=bridge.xovi OTHER=zinc-canvas.so ;;
  *) echo "usage: install.sh [canvas|lane]" >&2; exit 2 ;;
esac
[ -f "$HERE/dist/$SO" ] || fail "no $HERE/dist/$SO (build it with build.sh)"
[ -d "$EXT" ] || fail "no XOVI at $EXT"
[ -f "$EXT/$OTHER" ] && fail "$OTHER is installed and answers on the same socket; remove it first (rm $EXT/$OTHER)"
[ $WHAT = lane ] && [ ! -f "$EXT/framebuffer-spy.so" ] && fail "framebuffer-spy is not installed in $EXT (the lane reads xochitl's buffer through it)"
for sym in $(sed -n 's/^override[[:space:]]*\([^[:space:];]*\).*/\1/p' "$HERE/$XOVI"); do
  for other in "$EXT"/*.so; do
    [ "$(basename "$other")" = "$SO" ] && continue
    if grep -q "override\$$sym" "$other"; then fail "$(basename "$other") already hooks $sym; XOVI would stop xochitl at every start"; fi
  done
done
if [ $WHAT = canvas ]; then
  XO=${XOCHITL:-/usr/bin/xochitl}
  MACHINE=${ZINC_RMPP_MACHINE:-$(tr -d '\0' < /sys/devices/soc0/machine)}
  OS=$(sed -n 's/^IMG_VERSION="*\([^"]*\)"*$/\1/p' /etc/os-release 2>/dev/null || true)
  SUM=$(sha256sum "$XO" | cut -c1-64)
  HOME_DIR=${XOVI_EXTHOME:-$(dirname "$EXT")/exthome}/zinc-canvas
  mkdir -p "$HOME_DIR"
  grep -qx "$SUM $MACHINE" "$HOME_DIR/verified" 2>/dev/null || echo "$SUM $MACHINE" >> "$HOME_DIR/verified"
  echo "zinc-canvas: xochitl $SUM ($MACHINE, OS ${OS:-unknown}) recorded in $HOME_DIR/verified"
fi
cp "$HERE/dist/$SO" "$EXT/$SO"
echo "zinc-$WHAT: installed in $EXT; it loads at the next xovi/start (once per boot at most if xochitl ever dies while it is armed)"
