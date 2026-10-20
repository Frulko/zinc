#!/bin/sh
# Reference counting (ZN-018): every program of the corpus ends with no live object (`zinc mem --check-leaks`, ZN-046), except the ones that
# build reference cycles on purpose (features.ts of the M3 set: its `@weak` parent link is accepted and ignored, so the pair leaks); the destruction order is the frozen one (ZN_TRACE_FREE): an object's fields in reverse
# order, an array's elements first to last, a Map's entries first to last, a local at its last use.
cd "$(dirname "$0")/../.." || exit 2
fail=0
cyclic="closures.ts inspect_cycles.ts closure_names.ts"   # closures.ts: a button whose callback captures the button; closure_names.ts: closures that hold a cell holding themselves (a named function expression, a local recursive arrow)
for f in tests/golden/run/*.ts $(for b in $(cat corpus/M3-set.txt); do [ "$b" = features ] || echo ../tests/conformance/$b.ts; done) ../examples/lang/src/main.ts tests/golden/modules/modules.ts \
    ../tests/bench/kernels/fib.ts ../tests/bench/kernels/mandelbrot.ts ../tests/bench/kernels/nbody.ts ../tests/bench/kernels/spectralnorm.ts \
    ../tests/bench/kernels/strings.ts ../tests/bench/kernels/mapset.ts ../tests/bench/kernels/sort.ts; do
  case " $cyclic " in *" $(basename "$f") "*) continue ;; esac
  "$ZINC" mem "$f" --check-leaks >/dev/null 2>"${TMPDIR:-/tmp}/zn-leak.$$"; rc=$?
  # exit 101 is an uncaught exception that some programs end with on purpose; a leak is reported on stderr either way
  if { [ $rc -ne 0 ] && [ $rc -ne 101 ]; } || grep -q "leaked" "${TMPDIR:-/tmp}/zn-leak.$$"; then echo "leak or failure: $f: $(head -c 120 "${TMPDIR:-/tmp}/zn-leak.$$")"; fail=1; fi
done
rm -f "${TMPDIR:-/tmp}/zn-leak.$$"
ZN_TRACE_FREE=1 "$ZINC" run tests/golden/rc/order.ts 2>&1 >/dev/null | diff -q - tests/golden/rc/order.trace >/dev/null || { echo "destruction order differs from tests/golden/rc/order.trace"; fail=1; }
exit $fail
