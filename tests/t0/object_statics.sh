#!/bin/sh
# Object.assign, freeze, fromEntries, getOwnPropertyNames and defineProperty on typed records and on any values (ZN-161.01): the
# lines Node prints (tests/golden/run/object_statics.out) on the interpreter, AOT and QuickJS; and the diagnostics of what a typed
# object cannot do.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for engine in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 "$ZINC" run tests/golden/run/object_statics.ts $engine > "$tmp/out" 2> "$tmp/err"
  if ! cmp -s tests/golden/run/object_statics.out "$tmp/out"; then
    echo "object_statics ($engine): $(diff tests/golden/run/object_statics.out "$tmp/out" | sed -n 2,3p | tr '\n' ' ') $(grep -v '^  ' "$tmp/err" | tail -3 | tr '\n' ' ')"
    fail=1
  fi
done
cat > "$tmp/bad.ts" <<'TS'
interface P { x: number; y: number }
const p: P = { x: 1, y: 2 };
Object.assign(p, { z: 3 });
Object.defineProperty(p, 'x', { value: 2, enumerable: false });
Object.defineProperty(p, 'w', { value: 2 });
Object.defineProperty(p, 'x', { get: () => 1 });
TS
"$ZINC" check "$tmp/bad.ts" > "$tmp/out" 2>&1
for want in "'z', which 'P' does not declare" "non-writable or non-enumerable field" "a property 'P' does not declare" "an accessor in Object.defineProperty"; do
  grep -q "$want" "$tmp/out" || { echo "object_statics: no diagnostic \"$want\": $(head -c 600 "$tmp/out" | tr '\n' ' ')"; fail=1; }
done
[ $fail = 0 ] && echo "object_statics: ok"
exit $fail
