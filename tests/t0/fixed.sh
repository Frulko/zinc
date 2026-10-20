#!/bin/sh
# Fixed point (ZN-121.02): every op of zn/ops.h (mul, div, conversions, sqrt, sin, cos for fx12 and fx16) equals a port of the prototype's Fx<F>.
BUILD=${BUILD:-build}
[ -x "$BUILD/fx_test" ] || { echo "skipped: fx_test is not built"; exit 77; }
"$BUILD/fx_test" | grep -q 'all checks passed' || { "$BUILD/fx_test"; exit 1; }
