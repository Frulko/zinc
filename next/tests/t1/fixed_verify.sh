#!/bin/sh
# Fixed point audit (ZN-121.04): with ZINC_VERIFY_FIXED=1 the IR verifier refuses an f64 arithmetic or comparison in the program's own functions when its operands only come from
# conversions and constants (`number` arithmetic that escaped the lowering). The conformance programs listed here are clean; the others legitimately count in f64 (Date.now() math,
# Number.isNaN, a native module's double) and are not audited yet.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# A constant multiplication can legitimately fold away; keep a runtime operand in an audited function.
cat > "$tmp/neg.ts" <<'T'
// zinc-profile: ps1
import * as sys from 'zinc:sys';
function f(input: i32): number {
  if (input < 0) return f(-input); // Keep this audited function from being inlined into the module initializers.
  const a: f64 = input as f64;
  const b: f64 = a * 1.5;
  return b as number;
}
console.log(f(Number(sys.env('ZN_FIXED_INPUT')) as i32));
T
out=$(ZINC_VERIFY_FIXED=1 ZN_FIXED_INPUT=2 "$ZINC" run "$tmp/neg.ts" 2>&1); rc=$?
[ "$rc" -ne 0 ] && printf '%s\n' "$out" | grep -q "mul on f64 in a fixed-point profile" || { echo "a dynamic f64 multiplication is not refused after optimization"; fail=1; }
out=$(ZINC_VERIFY_FIXED=1 ZN_NO_OPT=1 ZN_FIXED_INPUT=2 "$ZINC" run "$tmp/neg.ts" 2>&1); rc=$?
[ "$rc" -ne 0 ] && printf '%s\n' "$out" | grep -q "mul on f64 in a fixed-point profile" || { echo "a dynamic f64 multiplication is not refused before optimization"; fail=1; }
[ "$(ZN_FIXED_INPUT=2 "$ZINC" run "$tmp/neg.ts" 2>&1)" = "3" ] || { echo "the audit is not opt-in"; fail=1; }
for n in tour features generic_static hardening literal_member_arrays path pinball_physics regressions shapes signals modules; do
  ZINC_VERIFY_FIXED=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run --profile ps1 ../tests/conformance/$n.ts 2>&1 | grep -q "in a fixed-point profile" && { echo "$n: f64 arithmetic in the lowered fixed-point IR"; fail=1; }
done
exit $fail
