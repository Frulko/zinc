#!/bin/sh
# Reference counting (ZN-018): every program of the corpus ends with no live object (ZN_LEAK_CHECK), except the ones that
# build reference cycles on purpose; the destruction order is the frozen one (ZN_TRACE_FREE): an object's fields in reverse
# order, an array's elements first to last, a Map's entries first to last, a local at its last use.
cd "$(dirname "$0")/../.." || exit 2
fail=0
cyclic="closures.ts inspect_cycles.ts async.ts generators.ts"   # closures.ts: a button whose callback captures the button; async.ts, generators.ts: the lambdas of a rewritten loop name themselves
for f in tests/golden/run/*.ts ../tests/conformance/tour.ts ../tests/conformance/errors.ts ../examples/lang/src/main.ts tests/golden/modules/modules.ts \
    ../tests/bench/kernels/fib.ts ../tests/bench/kernels/mandelbrot.ts ../tests/bench/kernels/nbody.ts ../tests/bench/kernels/spectralnorm.ts \
    ../tests/bench/kernels/strings.ts ../tests/bench/kernels/mapset.ts ../tests/bench/kernels/sort.ts; do
  case " $cyclic " in *" $(basename "$f") "*) continue ;; esac
  ZN_LEAK_CHECK=1 "$ZINC" run "$f" >/dev/null 2>"${TMPDIR:-/tmp}/zn-leak.$$" || { echo "leak or failure: $f: $(head -c 120 "${TMPDIR:-/tmp}/zn-leak.$$")"; fail=1; }
done
rm -f "${TMPDIR:-/tmp}/zn-leak.$$"
ZN_TRACE_FREE=1 "$ZINC" run tests/golden/rc/order.ts 2>&1 >/dev/null | diff -q - tests/golden/rc/order.trace >/dev/null || { echo "destruction order differs from tests/golden/rc/order.trace"; fail=1; }
exit $fail
