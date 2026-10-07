#!/bin/sh
# M2/M3 conformance: the conformance programs listed below (a growing part of corpus/M3-set.txt) are byte-identical to the output frozen from the old toolchain
# (corpus/conformance/tour.out), and examples/lang (the same tour split in modules, with section headings) prints the golden
# output, which differs from tour.out only by headings and line splits (checked when the golden was made).
cd "$(dirname "$0")/../.." || exit 2
fail=0
# The frozen output of a program that ends with an uncaught exception has a last line `[exit 101] panic: Uncaught ...`.
run() {
  out=$("$ZINC" run "$1" 2>"${TMPDIR:-/tmp}/zn-conf.$$"); code=$?
  [ -n "$out" ] && printf '%s\n' "$out"
  if [ $code -ne 0 ]; then printf '[exit %s] %s\n' "$code" "$(cat "${TMPDIR:-/tmp}/zn-conf.$$")"; else cat "${TMPDIR:-/tmp}/zn-conf.$$"; fi
  rm -f "${TMPDIR:-/tmp}/zn-conf.$$"
}
for b in tour errors async array_search string_number_edges conversions clock literal_member_arrays features generic_static regressions regressions2 dyn dyn_literals dyn_unknown literal_errors; do
  run ../tests/conformance/$b.ts | diff -q - corpus/conformance/$b.out >/dev/null || { echo "$b output differs from the frozen corpus"; fail=1; }
done
"$ZINC" run ../examples/lang/src/main.ts 2>&1 | diff -q - tests/golden/lang/lang.out >/dev/null || { echo "examples/lang output differs from its golden"; fail=1; }
"$ZINC" run ../tests/conformance/sys_process.ts </dev/null 2>&1 | diff -q - ../tests/conformance/sys_process.out >/dev/null || { echo "sys_process output differs from the old simulator (ZN-084)"; fail=1; }
exit $fail
