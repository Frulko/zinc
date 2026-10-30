#!/bin/sh
# A union of primitives in a Map's values, read in a closure (`Map<string, string | number>`, forEach): the IR has no type for it yet
# (Z0005, backlog/later.md), and the lowering used to abort with "internal error: a jump of @__g0 passes a missing value" instead of
# saying so. The interpreter and an ahead-of-time build both refuse it with the diagnostic; QuickJS runs it as TypeScript does.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
const line = new Map<string, string | number>();
line.set('n', 1.5);
const fields: string[] = [];
line.forEach((v: string | number, k: string) => { fields.push(k + ':' + (typeof v === 'string' ? (v as string) : String(v as number))); });
console.log(fields.join(','));
TS
fail=0
got=$("$ZINC" run "$tmp/t.ts" --interp 2>&1)
case $got in *"internal error"*) echo "union_refused_no_abort: the lowering aborts: $got"; fail=1 ;; *Z0005*) ;; *) echo "union_refused_no_abort: no Z0005: $got"; fail=1 ;; esac
got=$("$ZINC" build "$tmp/t.ts" -o "$tmp/aot" 2>&1)
case $got in *"internal error"*) echo "union_refused_no_abort: the AOT build aborts: $got"; fail=1 ;; *Z0005*) ;; *) echo "union_refused_no_abort: AOT, no Z0005: $got"; fail=1 ;; esac
got=$("$ZINC" run "$tmp/t.ts" --engine quickjs 2>&1)
[ "$got" = "n:1.5" ] || { echo "union_refused_no_abort quickjs: got $got"; fail=1; }
exit $fail
