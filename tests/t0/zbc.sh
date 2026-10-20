#!/bin/sh
# ZBC: fib, mandelbrot and the programs below emit the golden disassembly (verified before printing); the binary file round-trips through
# `zinc zbc` (decode + verify) to the same text; corrupted files are rejected; the verifier/format unit test passes.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for k in fib mandelbrot; do
  src=../tests/bench/kernels/$k.ts
  "$ZINC" --emit=zbc "$src" 2>&1 | diff -q - tests/golden/zbc/$k.zbc.txt >/dev/null || { echo "zbc golden differs: $k"; fail=1; }
  "$ZINC" --emit=zbc-bin "$src" "$tmp/$k.zbc" || { echo "cannot write $k.zbc"; fail=1; continue; }
  "$ZINC" zbc --dump "$tmp/$k.zbc" 2>&1 | diff -q - tests/golden/zbc/$k.zbc.txt >/dev/null || { echo "binary round trip differs: $k"; fail=1; }
  head -c 40 "$tmp/$k.zbc" > "$tmp/trunc.zbc"
  "$ZINC" zbc --check "$tmp/trunc.zbc" >/dev/null 2>&1 && { echo "truncated file accepted: $k"; fail=1; }
done
for k in inherit interfaces devirt statics param_props abstract many_props generics tuples unions closures closures2 rt_strings rt_arrays rt_collections enums_switch records exceptions; do
  "$ZINC" --emit=zbc tests/golden/run/$k.ts 2>&1 | diff -q - tests/golden/zbc/$k.zbc.txt >/dev/null || { echo "zbc golden differs: $k"; fail=1; }
  "$ZINC" --emit=zbc-bin tests/golden/run/$k.ts "$tmp/$k.zbc" && "$ZINC" zbc --dump "$tmp/$k.zbc" 2>&1 | diff -q - tests/golden/zbc/$k.zbc.txt >/dev/null || { echo "binary round trip differs: $k"; fail=1; }
done
# fixed point (ZN-121): fx12 lowers to ZBC and runs with the prototype's rounding (Q20.12: 1/3 is 0.333251953125)
printf '// zinc-profile: ps1\nconst a = 1.5;\nconst b = 1 / 3;\nconsole.log(a, b, b * 3, a / b);\n' > "$tmp/fx.ts"
"$ZINC" --emit=zbc-bin "$tmp/fx.ts" "$tmp/fx.zbc" >/dev/null 2>&1 && "$ZINC" zbc --dump "$tmp/fx.zbc" 2>&1 | grep -q "MulFx12" || { echo "fx12 does not lower to the fixed-point ops"; fail=1; }
[ "$("$ZINC" run "$tmp/fx.ts" 2>&1)" = "1.5 0.333251953125 0.999755859375 4.5009765625" ] || { echo "fx12 arithmetic differs from the prototype's Fx<12>"; fail=1; }
"$(dirname "$ZINC")/zbc_test" || fail=1
exit $fail
