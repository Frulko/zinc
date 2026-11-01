#!/bin/sh
# A regex `replace` whose replacer function holds a call the checker rewrites (`v.toString(16)`, `Math.max(...)`): the replacer was checked
# twice, and the rewritten call kept pointing at the variables of the first check ("invalid IR after reference counting"). The same line
# on the interpreter, the default engine and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
function uuid(): string {
  return 'xxxx-4xxx-yxxx'.replace(/[xy]/g, (c: string): string => {
    const r = 7;
    const v = c === 'x' ? r : (r & 3) | 8;
    return v.toString(16);
  });
}
console.log(uuid(), 'a-b'.replace(/[ab]/g, (c: string): string => Math.max(1, 2).toString(16) + c));
TS
want='7777-4777-b777 2a-2b'
fail=0
for engine in --interp "" "--engine quickjs"; do
  got=$("$ZINC" run "$tmp/t.ts" $engine 2>&1 | grep -v '^  \|^zinc run')
  [ "$got" = "$want" ] || { echo "replace_fn_rewritten ${engine:-default}: got"; echo "$got"; fail=1; }
done
exit $fail
