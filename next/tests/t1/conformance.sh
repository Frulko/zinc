#!/bin/sh
# M2/M3 conformance: the conformance programs listed below (a growing part of corpus/M3-set.txt) are byte-identical to the output frozen from the old toolchain
# (corpus/conformance/tour.out), and examples/lang (the same tour split in modules, with section headings) prints the golden
# output, which differs from tour.out only by headings and line splits (checked when the golden was made).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for b in tour errors async array_search string_number_edges conversions clock literal_member_arrays features generic_static regressions regressions2; do
  "$ZINC" run ../tests/conformance/$b.ts 2>&1 | diff -q - corpus/conformance/$b.out >/dev/null || { echo "$b output differs from the frozen corpus"; fail=1; }
done
"$ZINC" run ../examples/lang/src/main.ts 2>&1 | diff -q - tests/golden/lang/lang.out >/dev/null || { echo "examples/lang output differs from its golden"; fail=1; }
exit $fail
