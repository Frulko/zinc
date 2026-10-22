#!/bin/sh
# The default pressed feedback (tests/golden/ui-press, scripted mouse, keyboard and finger): a View with onClick dims while held and comes back after the
# release, dragging off lifts the dim and presses nothing, a disabled one does not respond, Enter dims the focused one, activeOpacity and an
# active:opacity-70 class replace the default, ui.setPressFeedback(false) turns it off. The pixels of the held frame show the dim painted.
cd "$(dirname "$0")/../.." || exit 2
g=$PWD/tests/golden/ui-press
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
out=$(ZINC_INPUT=$g/script ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=210 ZINC_SIZE=300x400 ZINC_SCALE=1 ZINC_SHOT="$tmp/p.png" ZINC_SHOT_FRAMES=12,30 "$ZINC" run "$g" 2>&1 | grep -v '^zinc run\|^  ')
[ "$out" = "$(cat "$g/main.out")" ] || { echo "ui press: $(echo "$out" | diff - "$g/main.out" | head -8)"; exit 1; }
python3 - "$tmp" <<'EOF' || exit 1
import sys, importlib.machinery, importlib.util
spec = importlib.util.spec_from_loader('pngdiff', importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff'))
png = importlib.util.module_from_spec(spec); spec.loader.exec_module(png)
def at(p, x, y):
    w, h, bpp, px = png.dec(p); i = (y * w + x) * bpp
    return tuple(px[i:i + 3])
held, rest = at(f'{sys.argv[1]}/p-12.png', 150, 50), at(f'{sys.argv[1]}/p-30.png', 150, 50)
# #3366cc at 0.6 over white is about (133, 163, 224)
if rest != (0x33, 0x66, 0xcc) or not all(abs(a - b) <= 3 for a, b in zip(held, (133, 163, 224))):
    print(f'ui press: the held button is {held}, at rest {rest}'); sys.exit(1)
EOF
echo "ui press: ok"
