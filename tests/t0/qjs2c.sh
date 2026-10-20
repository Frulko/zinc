#!/bin/sh
# tools/qjs2c (ZN-599 spike, D55) still reads the interpreter loop of the vendored quickjs.c: the three functions of a sprite dump compile to
# C with their opcode bodies (OP_CMP expanded, atoms through the function's table, jumps as direct gotos). Compiling the result is the
# spike's own job (docs/reports/zinc-next-qjs2c.md), not this test's.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
out=$(tools/qjs2c --dump tests/data/qjs2c-sprite.jsonl -o "$tmp/gen.c" 2>&1)
fail=0
[ "$out" = "qjs2c: 3 functions compiled, 0 skipped" ] || { echo "qjs2c: $out"; fail=1; }
grep -q "js_relational_slow(ctx, sp, opcode)" "$tmp/gen.c" || { echo "OP_CMP not expanded"; fail=1; }
grep -q "ZN_ATOM(get_u32(pc))" "$tmp/gen.c" || { echo "atom operands not read through the table"; fail=1; }
grep -Eq "^#define ZN_NEXT switch \(pc - \(uint8_t \*\)zn_bc\) \{ case [0-9]+: goto L_[0-9]+; case [0-9]+: goto L_[0-9]+;" "$tmp/gen.c" || { echo "no two-way jump"; fail=1; }
grep -q "BREAK\|goto exception\|dispatch_table" "$tmp/gen.c" && { echo "interpreter control flow left in the copied bodies"; fail=1; }
[ $fail -eq 0 ] && echo "qjs2c: ok"
exit $fail
