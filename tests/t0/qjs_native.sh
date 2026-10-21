#!/bin/sh
# Native modules on the QuickJS engine (ZN-583.02, src/qjs/native_js.cpp): requireNative of 'zinc:native' calls the exports of a registered
# module with the arguments and the result converted by their signature letters (scalars, a string, byte arrays in and out), so the program
# of tests/t0/native_call.sh prints the same frozen output; callbacks (called during the call, or posted from a thread and run by the loop) and
# promise results print what the typed engines print (native_callbacks.ts); a missing module names itself.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" run tests/golden/run/native_call.ts --engine quickjs 2>&1 | diff -q - tests/golden/run/native_call.out >/dev/null || { echo "qjs_native: native_call.ts differs on QuickJS"; fail=1; }
"$ZINC" run tests/golden/run/native_callbacks.ts --engine quickjs 2>/dev/null | diff -q - tests/golden/run/native_callbacks.out >/dev/null \
  || { echo "qjs_native: native_callbacks.ts differs on QuickJS (callbacks during a call and from a thread, promises settled from a thread)"; fail=1; }
for e in jsc v8 hermes; do   # the engine modules bind the same native_js.cpp over their Node-API, with the same native turn in their loop (src/engine/driver.cpp)
  [ -f "$(dirname "$ZINC")/libzn_engine_$e.dylib" ] || continue
  "$ZINC" run tests/golden/run/native_callbacks.ts --engine $e 2>/dev/null | diff -q - tests/golden/run/native_callbacks.out >/dev/null \
    || { echo "qjs_native: native_callbacks.ts differs on $e"; fail=1; }
done
cat > "$tmp/typed.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { sum(b: u8[]): i32; reverse(b: u8[]): u8[]; nope(): void }
const n = requireNative<Spec>('Fixture');
const r = n.reverse(new Uint8Array([9, 8, 7]));   // a typed array of the element type goes in as it is; an array result is one
console.log(n.sum(new Uint8Array([1, 2, 3])), r instanceof Uint8Array, r[0], r[2], typeof n.nope);
TS
[ "$("$ZINC" run "$tmp/typed.ts" --engine quickjs 2>&1)" = "6 true 7 9 undefined" ] || { echo "qjs_native: typed arrays do not cross as bytes, or a missing export is not undefined"; fail=1; }
printf "import { requireNative } from 'zinc:native';\nrequireNative('NoSuchModule').f();\n" > "$tmp/none.js"
"$ZINC" run "$tmp/none.js" --engine quickjs 2>&1 | grep -q "ReferenceError: native module 'NoSuchModule'" || { echo "qjs_native: a module nobody provides is not named"; fail=1; }
exit $fail
