#!/bin/sh
# `{list.map(row)}` with a NAMED function that returns JSX mounts the nodes it makes, as the inline arrow does; it used to be printed as
# text, so the page showed the node ids as numbers. The lowering is checked on the plain code the file becomes, and the program runs
# on the interpreter, the default engine and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.tsx" <<'P'
import { render } from 'zinc:ui/react';
const out: string[] = [];
function mark(s: string): string { out.push(s); return s; }
const row = (s: string) => <Text key={s}>{mark('r' + s)}</Text>;
function row2(s: string, i: i32): i32 { return <Text key={s}>{mark('q' + s + i)}</Text>; }
const items = ['a', 'b'];
function App(): i32 { return <View>{items.map(row)}{items.map(row2)}</View>; }
let f = 0;
render(App, 0xffffff, (dt: number) => { f++; if (f === 3) console.log(out.join(' ')); });
P
fail=0
dump=$(ZN_DUMP_JSX=p.tsx ZINC_HEADLESS=1 ZINC_FRAMES=2 timeout 60 "$ZINC" run --interp "$tmp/p.tsx" 2>&1)
for want in 'of items.map(row)) _append' 'of items.map(row2)) _append'; do
  case "$dump" in *"$want"*) ;; *) echo "lowering: missing '$want'"; fail=1 ;; esac
done
want="ra rb qa0 qb1"
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$ZINC" run --interp "$tmp/p.tsx" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "interpreter: want '$want', got '$got'"; fail=1; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$ZINC" run "$tmp/p.tsx" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "default engine: want '$want', got '$got'"; fail=1; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$ZINC" run "$tmp/p.tsx" --engine quickjs 2>/dev/null | grep -v '^  \|^zinc run' | tail -1)
[ "$got" = "$want" ] || { echo "QuickJS: want '$want', got '$got'"; fail=1; }
exit $fail
