#!/bin/sh
# A JSON.parse typed by an interface is a checked copy of the declared fields (docs/guide/02-language.md, "Dyn"): the properties the JSON
# has beyond them are dropped, at every depth, and a spread copies only the declared ones; the same on the interpreter, the AOT build and QuickJS
# (its transform wraps the JSON.parse in a checked copy, ZN-1009).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
interface P { a: string; b?: i32; }
interface Q { p: P; list: P[]; }
const x: P = JSON.parse('{"a":"1","c":"extra","b":2}');
const y = { ...x };
const q: Q = JSON.parse('{"p":{"a":"2","path":"/etc"},"list":[{"a":"3","z":true}],"more":1}');
console.log(JSON.stringify(x), JSON.stringify(y), JSON.stringify(q));
TS
want='{"a":"1","b":2} {"a":"1","b":2} {"p":{"a":"2"},"list":[{"a":"3"}]}'
fail=0
out=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/t.ts" --interp 2>"$tmp/err")
[ "$out" = "$want" ] || { echo "json_typed_shape (interp): $out $(tail -3 "$tmp/err" | tr '\n' ' ')"; fail=1; }
out=$(ZINC_HEADLESS=1 "$ZINC" run --engine quickjs "$tmp/t.ts" 2>"$tmp/err")
[ "$out" = "$want" ] || { echo "json_typed_shape (quickjs): $out $(tail -3 "$tmp/err" | tr '\n' ' ')"; fail=1; }
"$ZINC" build "$tmp/t.ts" -o "$tmp/t.bin" >"$tmp/build" 2>&1 || { echo "json_typed_shape: zinc build failed: $(tail -3 "$tmp/build" | tr '\n' ' ')"; fail=1; }
[ -x "$tmp/t.bin" ] && { out=$("$tmp/t.bin" 2>&1); [ "$out" = "$want" ] || { echo "json_typed_shape (aot): $out"; fail=1; }; }
[ $fail = 0 ] && echo "json_typed_shape: ok"
exit $fail
