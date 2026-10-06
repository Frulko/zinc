#!/bin/sh
# M2/M3 conformance: the `tour`, `errors` and `async` conformance programs are byte-identical to the output frozen from the old toolchain
# (corpus/conformance/tour.out), and examples/lang (the same tour split in modules, with section headings) prints the golden
# output, which differs from tour.out only by headings and line splits (checked when the golden was made).
cd "$(dirname "$0")/../.." || exit 2
fail=0
"$ZINC" run ../tests/conformance/tour.ts 2>&1 | diff -q - corpus/conformance/tour.out >/dev/null || { echo "tour output differs from the frozen corpus"; fail=1; }
"$ZINC" run ../tests/conformance/errors.ts 2>&1 | diff -q - corpus/conformance/errors.out >/dev/null || { echo "errors output differs from the frozen corpus"; fail=1; }
"$ZINC" run ../tests/conformance/async.ts 2>&1 | diff -q - corpus/conformance/async.out >/dev/null || { echo "async output differs from the frozen corpus"; fail=1; }
"$ZINC" run ../examples/lang/src/main.ts 2>&1 | diff -q - tests/golden/lang/lang.out >/dev/null || { echo "examples/lang output differs from its golden"; fail=1; }
exit $fail
