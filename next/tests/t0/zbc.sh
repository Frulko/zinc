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
printf 'const a: fx12 = 1.5;\nconsole.log(a);\n' > "$tmp/fx.ts"
"$ZINC" --emit=zbc "$tmp/fx.ts" >/dev/null 2>"$tmp/err" && { echo "fixed-point numbers should be reported as unsupported"; fail=1; }
grep -q "not supported yet" "$tmp/err" || { echo "missing unsupported message for fx12"; fail=1; }
"$(dirname "$ZINC")/zbc_test" || fail=1
exit $fail
