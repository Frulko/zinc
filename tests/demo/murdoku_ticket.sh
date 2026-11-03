#!/bin/sh
# Murdoku on paper. The receipt: an 8-column plan fits 576 dots, the ESC/POS encoding sets a bit for a black dot and declares each band. The sheet: two lossless A4 pages at 300 dpi.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
ZINC="$ZINC" python3 examples/murdoku/authoring/print_ticket.py --seed 47514 --level 0 --preview "$tmp/t.png" --out "$tmp/t.bin" > "$tmp/out" 2>/dev/null
grep -q ' mm of paper' "$tmp/out"
python3 - "$tmp" <<'P'
import sys
from PIL import Image
sys.path.insert(0, 'examples/murdoku/authoring')
from print_ticket import escpos, trim, WIDTH, CANVAS_HEIGHT, BAND
t = Image.open(sys.argv[1] + '/t.png')
assert t.width == WIDTH and 600 < t.height < CANVAS_HEIGHT, t.size
image = Image.new('1', (WIDTH, BAND + 1), 1); image.putpixel((0, 0), 0)
d = escpos(image)
assert d[:2] == b'\x1b@' and d[-3:] == b'\x1dV\x01'
assert d[2:10] == b'\x1dv0\x00\x48\x00\x80\x00' and d[10] == 0x80 and d[11] == 0
second = 10 + 72 * BAND
assert d[second:second + 8] == b'\x1dv0\x00\x48\x00\x01\x00'
assert trim(image).height == 9
P
ZINC="$ZINC" python3 examples/murdoku/authoring/print_sheet.py "$tmp/s.pdf" --seed 47514 --level 0 --mono > /dev/null 2>&1
grep -aq '/Count 2' "$tmp/s.pdf"
grep -aq '841.92' "$tmp/s.pdf"
grep -aq '/Width 2480 /Height 3508' "$tmp/s.pdf"
! grep -aq 'DCTDecode' "$tmp/s.pdf"
echo ok
