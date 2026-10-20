#!/bin/sh
# Hot mode stays out of every other build (ZN-742.01, docs/reports/zinc-next-fast-refresh.md §5): without ZINC_HOT=1 the statements that
# only run with import.meta.hot are removed (the program compiles to the bytes it has without them, the preludes they would bring included),
# no zinc:hot and no per-module init function is in the ZBC, and a built binary carries no HMR symbol or string. With ZINC_HOT=1 the
# machinery is there (so the checks above cannot pass vacuously), the program prints the same, and the stable keys are unique.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/hot" "$tmp/plain"
cat > "$tmp/hot/state.ts" <<'T'
export let count: i32 = 0;
export function bump(): i32 { count++; return count; }
T
cp "$tmp/hot/state.ts" "$tmp/plain/state.ts"
cat > "$tmp/hot/main.ts" <<'T'
import { bump, count } from './state';
const label = 'main';
bump();
console.log(label, count, bump());
if (import.meta.hot) {
  import.meta.hot.accept((): void => { console.log('accepted'); });
  import.meta.hot.dispose((): void => { setTimeout((): void => {}, 1); });   // a timer and a promise: the async prelude, which a non-hot build must not get
  const p = Promise.resolve(1);
}
import.meta.hot?.on('afterUpdate', (mods: string[]): void => { console.log(mods.length); });
console.log('end');
T
grep -v 'import.meta.hot\|setTimeout\|Promise\|^}' "$tmp/hot/main.ts" > "$tmp/plain/main.ts"
export ZINC_DETERMINISTIC=1
unset ZINC_HOT
# 1. elision: the same bytes as the program written without the hot code
"$ZINC" --emit=zbc-bin "$tmp/hot/main.ts" "$tmp/hot.zbc" > "$tmp/e1.log" 2>&1 || { echo "non-hot compile failed: $(head -c 300 "$tmp/e1.log")"; exit 1; }
"$ZINC" --emit=zbc-bin "$tmp/plain/main.ts" "$tmp/plain.zbc" > "$tmp/e2.log" 2>&1 || { echo "plain compile failed: $(head -c 300 "$tmp/e2.log")"; exit 1; }
cmp -s "$tmp/hot.zbc" "$tmp/plain.zbc" || { echo "import.meta.hot blocks change the non-hot ZBC"; fail=1; }
# 2. the machinery: in the hot ZBC of a real app (the desktop-app template), nowhere else
cp -R templates/desktop-app "$tmp/app"
find "$tmp/app" -type f \( -name '*.json' -o -name '*.ts' -o -name '*.tsx' \) -exec perl -pi -e 's/\{\{(name|id)\}\}/hotapp/g' {} +
machinery='@init:|hotModule|beforeUpdate|afterUpdate'
"$ZINC" --emit=zbc "$tmp/app/src/main.tsx" > "$tmp/off.txt" 2>&1 || { echo "desktop-app compile failed: $(head -c 300 "$tmp/off.txt")"; exit 1; }
ZINC_HOT=1 ZN_DUMP_HOT_KEYS="$tmp/keys" "$ZINC" --emit=zbc "$tmp/app/src/main.tsx" > "$tmp/on.txt" 2>&1 || { echo "desktop-app hot compile failed: $(head -c 300 "$tmp/on.txt")"; exit 1; }
grep -Eq "$machinery" "$tmp/off.txt" && { echo "hot machinery in the non-hot ZBC: $(grep -Eo "$machinery" "$tmp/off.txt" | sort -u | tr '\n' ' ')"; fail=1; }
for w in '@init:.*src/main.tsx' '@init:.*src/pages/home.tsx' hotModule beforeUpdate afterUpdate; do
  grep -Eq "$w" "$tmp/on.txt" || { echo "hot ZBC lacks $w"; fail=1; }
done
dups=$(grep -E '^(class|global|function) ' "$tmp/keys" | grep -v '^function ' | sort | uniq -d | head -5)
[ -s "$tmp/keys" ] && [ -z "$dups" ] || { echo "hot keys missing or not unique: $dups"; fail=1; }
grep -q "^global .*src/state.ts::" "$tmp/keys" || { echo "no key for the globals of src/state.ts"; fail=1; }
# keys are stable: a lambda added to one file (it renumbers the lambda classes after it) changes no key of another file
echo 'export const later = (): i32 => 1;' >> "$tmp/app/src/router.ts"
ZINC_HOT=1 ZN_DUMP_HOT_KEYS="$tmp/keys2" "$ZINC" --emit=zbc "$tmp/app/src/main.tsx" > /dev/null 2>&1 || { echo "desktop-app hot recompile failed"; fail=1; }
grep -v 'router.ts' "$tmp/keys" | sort > "$tmp/k1"; grep -v 'router.ts' "$tmp/keys2" | sort > "$tmp/k2"
cmp -s "$tmp/k1" "$tmp/k2" || { echo "keys of unchanged files moved: $(diff "$tmp/k1" "$tmp/k2" | head -4 | tr '\n' ' ')"; fail=1; }
# 3. a hot program runs as the program does: the inits in order, the modules' variables shared
"$ZINC" run --interp "$tmp/plain/main.ts" > "$tmp/plain.out" 2>&1
"$ZINC" run --interp "$tmp/hot/main.ts" > "$tmp/nohot.out" 2>&1
ZINC_HOT=1 "$ZINC" run --interp "$tmp/hot/main.ts" > "$tmp/hot.out" 2>&1
printf 'main 1 2\nend\n' > "$tmp/want"
for o in plain nohot hot; do cmp -s "$tmp/want" "$tmp/$o.out" || { echo "$o run printed: $(tr '\n' '|' < "$tmp/$o.out" | head -c 300)"; fail=1; }; done
# 4. a built binary: no zinc:hot, no init function, no HMR symbol
"$ZINC" build "$tmp/hot/main.ts" -o "$tmp/bin" > "$tmp/build.log" 2>&1 || { echo "zinc build failed: $(head -c 300 "$tmp/build.log")"; exit 1; }
[ "$("$tmp/bin" 2>&1)" = "$(cat "$tmp/want")" ] || { echo "built program printed: $("$tmp/bin" 2>&1 | head -c 200)"; fail=1; }
strings "$tmp/bin" | grep -Eq "zinc:hot|$machinery" && { echo "HMR strings in the built binary: $(strings "$tmp/bin" | grep -Eo "zinc:hot|$machinery" | sort -u | tr '\n' ' ')"; fail=1; }
nm "$tmp/bin" 2>/dev/null | grep -Eq '3dev3hot|zn_hot|HotModule' && { echo "HMR symbols in the built binary"; fail=1; }
exit $fail
