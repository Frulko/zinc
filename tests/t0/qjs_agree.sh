#!/bin/sh
# QuickJS agrees with the interpreter and AOT (ZN-1009): one program on the three engines, the same output. JSON.parse into an interface is
# D179's checked copy (extras dropped, a missing or wrong field a TypeError), Map.get of a missing key is undefined. Then the host events reach
# a QuickJS program: assets.onReload (zinc dev's asset socket, fed on stdin through ZINC_DEV_FD) and a zinc:sys signal.
# (i32 arithmetic on QuickJS is ZN-796.)
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/types.ts" <<'TS'
export interface Item { id: i32; name: string; tags: string[]; note?: string; parent: Item | null }
TS
cat > "$tmp/t.ts" <<'TS'
import { Item } from './types';
interface P { x: number; y: number; n: i32 }
function one(src: string): void {
  try { const p: P = JSON.parse(src); console.log('ok', JSON.stringify(p)); }
  catch (e) { console.log('threw', e instanceof TypeError, (e as Error).message); }
}
one('{"x":1,"y":2,"n":3.5,"extra":3}');
one('{"x":1,"n":3}');
one('{"x":"a","y":2,"n":3}');
one('[1]');
const items: Item[] = JSON.parse('[{"id":1,"name":"a","tags":["t"],"z":0,"parent":{"id":2,"name":"b","tags":[],"note":"n","parent":null}}]');
console.log(JSON.stringify(items), items[0].note);
const v = JSON.parse('{"x":5,"y":6,"n":1,"z":0}') as P;
console.log(JSON.stringify(v));
const m = new Map<string, number>();
m.set('a', 1);
console.log(m.get('b'), m.get('a'), m.get('b') === undefined);
TS
fail=0
want=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/t.ts" --interp 2>"$tmp/err")
echo "$want" | grep -q "^threw true cannot convert Dyn (undefined) to number$" || { echo "qjs_agree: the interpreter's output changed: $want $(tail -3 "$tmp/err")"; fail=1; }
out=$(ZINC_HEADLESS=1 "$ZINC" run --engine quickjs "$tmp/t.ts" 2>"$tmp/err")
[ "$out" = "$want" ] || { echo "qjs_agree (quickjs): $(printf '%s\n' "$want" > "$tmp/w"; printf '%s\n' "$out" | diff "$tmp/w" - | tr '\n' ' ') $(tail -2 "$tmp/err" | tr '\n' ' ')"; fail=1; }
if "$ZINC" build "$tmp/t.ts" -o "$tmp/t.bin" >"$tmp/build" 2>&1; then
  out=$("$tmp/t.bin" 2>&1)
  [ "$out" = "$want" ] || { echo "qjs_agree (aot): $out"; fail=1; }
else echo "qjs_agree: zinc build failed: $(tail -3 "$tmp/build" | tr '\n' ' ')"; fail=1; fi
# host events on QuickJS
cat > "$tmp/reload.ts" <<'TS'
import * as assets from 'zinc:assets';
import * as sys from 'zinc:sys';
assets.onReload('note.txt', (name: string) => { console.log('reloaded ' + name); sys.exit(0); });
let n = 0;
const tick = (): void => { if (++n > 400) { console.log('no reload'); sys.exit(1); } setTimeout(tick, 5); };
tick();
TS
printf 'asset 0 5 note.txt\nhelloend\n' > "$tmp/dev.in"
out=$(ZINC_DEV_FD=0 ZINC_HEADLESS=1 "$ZINC" run --engine quickjs "$tmp/reload.ts" < "$tmp/dev.in" 2>/dev/null)
[ "$out" = "reloaded note.txt" ] || { echo "qjs_agree: assets.onReload does not fire on quickjs: $out"; fail=1; }
printf "import * as sys from 'zinc:sys';\nsys.onSignal('SIGUSR1', () => { console.log('got SIGUSR1'); sys.exit(0); });\nsetTimeout(() => { sys.kill(sys.pid(), 'SIGUSR1'); }, 10);\n" > "$tmp/sig.ts"
ZINC_HEADLESS=1 "$ZINC" run --engine quickjs "$tmp/sig.ts" 2>/dev/null | grep -q '^got SIGUSR1$' || { echo "qjs_agree: sys.onSignal does not fire on quickjs"; fail=1; }
[ $fail = 0 ] && echo "qjs_agree: ok"
exit $fail
