#!/bin/sh
# Layer motions: a modal's scrim fades in place while its content moves (tests/golden/ui-modal-motion, a transparent React Native Modal with
# animationType="slide"). Every frame is captured; the pixels show the scrim's alpha rising at the top of the screen while the sheet's top edge comes
# up from the bottom, the scrim the same above the sheet wherever the sheet has not reached (it never slides), the reverse on close, and quick
# toggles ending fully open or fully gone.
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/ui-modal-motion
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
out=$(MOTION_OUT=$tmp ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=160 ZINC_SIZE=200x400 ZINC_SCALE=1 "$ZINC" run $g 2>&1)
[ "$out" = "$(cat $g/main.out)" ] || { echo "ui modal motion: $(echo "$out" | diff - $g/main.out | head -6)"; exit 1; }
python3 - "$tmp" <<'EOF' || exit 1
import sys, importlib.machinery, importlib.util
spec = importlib.util.spec_from_loader('pngdiff', importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff'))
png = importlib.util.module_from_spec(spec); spec.loader.exec_module(png)
d = sys.argv[1]
def frame(n):
    w, h, bpp, px = png.dec(f'{d}/f-{n}.png')
    return w, h, bpp, px
def at(fr, x, y):
    w, h, bpp, px = fr; i = (y * w + x) * bpp
    return tuple(px[i:i + 3])
def sheet_top(fr):
    w, h = fr[0], fr[1]
    for y in range(h):
        r, g, b = at(fr, 100, y)
        if abs(r - 0x33) < 6 and abs(g - 0x66) < 6 and abs(b - 0xcc) < 6: return y
    return h
fail = []
def phase(name, a, b, opening):
    dims, tops = [], []
    for n in range(a, b + 1):
        fr = frame(n); top = sheet_top(fr)
        dims.append(at(fr, 100, 10)[0]); tops.append(top)
        if top > 190 and at(fr, 100, 10) != at(fr, 100, 185): fail.append(f'{name} frame {n}: the scrim is not the same above the sheet ({at(fr, 100, 10)} vs {at(fr, 100, 185)}): it moved')
    mono = all(x >= y for x, y in zip(dims, dims[1:])) if opening else all(x <= y for x, y in zip(dims, dims[1:]))
    if not mono: fail.append(f'{name}: the scrim does not fade one way: {dims}')
    if len(set(dims)) < 5: fail.append(f'{name}: the scrim jumps instead of fading: {sorted(set(dims))}')
    lo, hi = (dims[0], dims[-1]) if opening else (dims[-1], dims[0])
    if lo < 250 or not 120 <= hi <= 135: fail.append(f'{name}: the scrim goes from {dims[0]} to {dims[-1]}')
    tmono = all(x >= y for x, y in zip(tops, tops[1:])) if opening else all(x <= y for x, y in zip(tops, tops[1:]))
    if not tmono: fail.append(f'{name}: the sheet does not move one way: {tops}')
    if not any(200 < t < 400 for t in tops): fail.append(f'{name}: the sheet never shows half way: {tops}')
    if (tops[-1] if opening else tops[0]) != 200 or (tops[0] if opening else tops[-1]) != 400: fail.append(f'{name}: the sheet goes from {tops[0]} to {tops[-1]}')
phase('opening', 4, 40, True)
phase('closing', 41, 70, False)
end_open, end_closed = frame(110), frame(150)
if sheet_top(end_open) != 200 or not 120 <= at(end_open, 100, 10)[0] <= 135: fail.append(f'quick toggles ending open: sheet at {sheet_top(end_open)}, scrim {at(end_open, 100, 10)}')
if sheet_top(end_closed) != 400 or at(end_closed, 100, 10) != (255, 255, 255): fail.append(f'quick toggles ending closed: sheet at {sheet_top(end_closed)}, scrim {at(end_closed, 100, 10)}')
for m in fail: print(m)
sys.exit(1 if fail else 0)
EOF
echo "ui modal motion: ok"
