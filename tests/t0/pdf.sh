#!/bin/sh
# zinc:pdf (plugins/pdf, PDFium): the fixture's page count and size, a render's pixels (hash pinned for PDFium chromium/8100 on macOS
# arm64), two pages differ, an ink annotation is drawn and kept in a saved copy, PDFium's reasons for a missing file and a non-PDF.
cd "$(dirname "$0")/../.." || exit 2
plugins/pdf/vendor/fetch >/dev/null 2>&1 || { echo "SKIP: PDFium is not fetched and cannot be (plugins/pdf/vendor/fetch)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp plugins/pdf/tests/sample.pdf plugins/pdf/tests/pdf.ts "$tmp/"
got=$(PDF_TEST_DIR="$tmp" "$ZINC" run plugins/pdf/tests/pdf.ts 2>&1 | grep -v '^  \|^zinc')
want='pages 3 size 400x500
same image yes, pages differ yes
page 1 0c4e7377bd4d9700
repeatable yes
ink drawn yes
copy pages 3, ink kept yes
missing: the file cannot be opened
not a pdf: the file is not a PDF, or it is damaged'
[ "$(uname -s)-$(uname -m)" = Darwin-arm64 ] || { got=$(echo "$got" | grep -v '^page 1 '); want=$(echo "$want" | grep -v '^page 1 '); }
[ "$got" = "$want" ] || { printf 'zinc:pdf output differs:\n%s\n' "$got"; exit 1; }
grep -aq '/Subtype */Ink' "$tmp/annotated.pdf" && grep -aq '/InkList' "$tmp/annotated.pdf" || { echo "the saved copy has no ink annotation"; exit 1; }
