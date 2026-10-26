#!/bin/sh
# Zinc PDF (app/pdf, ZN-844) headless, driven by ZINC_PDF_SCRIPT (the buttons' and gestures' actions) over the zinc:pdf fixture: the library
# lists it, open, next/prev, a pen stroke on page 2 saved beside the document in page points (checked against the view's scale and origin),
# Export writes <name>.annotated.pdf with an ink annotation that PDFium opens again; a second run comes back on page 2 with the stroke,
# the Marker's eraser removes it, undo brings it back. While the pen writes, a frame is the baked page + ink and only the live stroke's
# segments (zinc:ink drawOver), not every stroke again: one sample a frame over three finished strokes. ZINC_SHOT of the second run
# (WEB_SHOTS-style: PDF_SHOTS=<dir> keeps it).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "SKIP: needs python3"; exit 77; }
plugins/pdf/vendor/fetch >/dev/null 2>&1 || { echo "SKIP: PDFium is not fetched and cannot be (plugins/pdf/vendor/fetch)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/docs"
cp plugins/pdf/tests/sample.pdf "$tmp/docs/"
export ZINC_PDF_DOCS="$tmp/docs" ZINC_STORAGE="$tmp/storage.kv"
fail=0
app() {
  ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_PDF_SCRIPT="$1" timeout 90 "$ZINC" run app/pdf >"$tmp/app.log" 2>&1 || { echo "the reader failed ($1):"; tail -15 "$tmp/app.log"; fail=1; }
}
expect() { grep -qF "$1" "$tmp/app.log" || { echo "expected '$1' in:"; grep '^pdf:' "$tmp/app.log"; fail=1; }; }

app "open sample.pdf; next; next; next; prev; draw 300 400 900 600; save; export"
expect 'pdf: 1 document in '
expect 'pdf: Opened sample.pdf · 3 pages · page 1 · 0 strokes.'
expect 'pdf: Page 3 / 3.'
expect 'pdf: Last page.'
expect 'pdf: Page 2 / 3.'
expect 'pdf: Ink saved, page 2 (1 strokes).'
expect 'pdf: Exported sample.annotated.pdf (1 strokes), beside the document.'
# the stroke is in page points: view pixel v is origin + v / scale
view=$(sed -n 's/^pdf: view [0-9x]* at \([0-9.]*\) px\/pt, origin \([-0-9.]*\) \([-0-9.]*\)$/\1 \2 \3/p' "$tmp/app.log")
python3 -c '
import json, sys
s, ox, oy = map(float, sys.argv[2].split())
p = json.load(open(sys.argv[1]))["strokes"][0]["points"]
xs, ys = p[0::3], p[1::3]
for got, want in ((min(xs), ox + 300 / s), (max(xs), ox + 900 / s), (min(ys), oy + 400 / s), (max(ys), oy + 600 / s)):
    assert abs(got - want) < 0.15, (got, want, s, ox, oy)
assert 0 <= min(xs) and max(xs) <= 400 and 0 <= min(ys) and max(ys) <= 500
' "$tmp/docs/sample.pdf.ink/p2.json" "$view" || { echo "the ink of page 2 (view: $view)"; fail=1; }
[ ! -e "$tmp/docs/sample.pdf.ink/p1.json" ] || { echo "page 1 got ink"; fail=1; }
grep -aq '/Subtype */Ink' "$tmp/docs/sample.annotated.pdf" 2>/dev/null && grep -aq '/InkList' "$tmp/docs/sample.annotated.pdf" || { echo "the export has no ink annotation"; fail=1; }

# again: the export opens, then the document comes back on page 2 with its stroke; the eraser takes it off, undo puts it back
ZINC_SHOT="$tmp/shot.png" app "open sample.annotated.pdf; open sample.pdf; erase 600 500; save; undo; save"
expect 'pdf: 2 documents in '
expect 'pdf: Opened sample.annotated.pdf · 3 pages · page 1 · 0 strokes.'
expect 'pdf: Opened sample.pdf · 3 pages · page 2 · 1 strokes.'
expect 'pdf: Ink saved, page 2 (0 strokes).'
expect 'pdf: Ink saved, page 2 (1 strokes).'
[ -s "$tmp/shot.png" ] || { echo "no shot of the reader"; fail=1; }

# the writing tools (zinc:ink, InkPalette): a highlighter stroke on page 3 is saved with its tool and exported translucent (/CA), a pencil one opaque
app "open sample.pdf; page 3; tool highlighter; color fbf719; draw 100 100 900 100; tool pencil; color 000000; draw 100 300 900 300; save; undo; redo; save; export"
expect 'pdf: Ink saved, page 3 (2 strokes).'
expect 'pdf: Exported sample.annotated.pdf (3 strokes), beside the document.'
grep -q '"tool":"highlighter"' "$tmp/docs/sample.pdf.ink/p3.json" && grep -q '"tool":"pencil"' "$tmp/docs/sample.pdf.ink/p3.json" || { echo "p3.json lost the tools: $(head -c 300 "$tmp/docs/sample.pdf.ink/p3.json")"; fail=1; }
grep -aq '/CA *0*\.35' "$tmp/docs/sample.annotated.pdf" || { echo "the highlighter is not translucent in the export (/CA 0.35)"; fail=1; }

# writing: clip, image, unclip and the live stroke's 21 segments; drawing every stroke again was 88
app "open sample.pdf; page 3; draw 100 100 900 300; draw 100 300 900 500; draw 100 500 900 700; write 100 800 900 900"
n=$(sed -n 's/^pdf: \([0-9]*\) draw commands at most a frame while writing$/\1/p' "$tmp/app.log")
[ -n "$n" ] && [ "$n" -le 30 ] || { echo "a frame while writing drew $n commands (at most 30)"; fail=1; }
[ -n "$PDF_SHOTS" ] && cp "$tmp/shot.png" "$tmp/docs/sample.annotated.pdf" "$PDF_SHOTS/" 2>/dev/null
[ $fail -eq 0 ] && echo "pdf reader: ok"
exit $fail
