#!/bin/sh
# Typed numbers agree on QuickJS (ZN-796): the golden typed_numbers program (i32/u32 wraps, narrow stores, f32 rounding, truncating integer
# stores, Math.imul) prints on --engine quickjs what the interpreter printed.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_STEPS=0 ZINC_HEADLESS=1 "$ZINC" run --engine quickjs tests/golden/run/typed_numbers.ts > "$tmp/out" 2>"$tmp/err"
if diff -u tests/golden/run/typed_numbers.out "$tmp/out" > "$tmp/diff"; then echo "qjs_numbers: ok"; exit 0; fi
echo "qjs_numbers: QuickJS differs from the interpreter"; cat "$tmp/diff"; tail -3 "$tmp/err"
exit 1
