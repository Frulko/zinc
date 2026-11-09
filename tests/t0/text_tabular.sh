#!/bin/sh
# Tabular figures (ZN-1062): zinc:gfx tabularFont takes Inter's tnum figures through the shaping tier, so a clock keeps its width, on the
# interpreter and QuickJS, in the glyph tables and in shaped text (a character the font lacks). It needs the tnum feature kept in the
# embedded TrueType file (src/res/res.cpp subsetTtf).
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1
fail=0
prog=tests/data/text_tabular/main.ts
timeout 60 "$ZINC" run --interp $prog 2>/dev/null | diff -u tests/data/text_tabular/main.out - || { echo "text_tabular: interpreter differs"; fail=1; }
timeout 60 "$ZINC" run $prog --engine quickjs 2>/dev/null | diff -u tests/data/text_tabular/main.out - || { echo "text_tabular: QuickJS differs"; fail=1; }
exit $fail
