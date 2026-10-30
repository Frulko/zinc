#!/bin/sh
# A component file that imports neither model (React's automatic JSX runtime lets a component go without `import React`) is lowered in
# the model of the project's entry: React here, so its rows are React's (it was lowered as Solid and mixed the two). A file that imports
# zinc:ui/solid keeps Solid. On the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.tsx" <<'P'
import { render, useState } from 'zinc:ui/react';
import { Rows } from './rows';
import { out } from './mark';
function App(): i32 { const [n] = useState<number>(2); return <View><Rows n={n} /></View>; }
let f = 0;
render(App, 0xffffff, (dt: number) => { f++; if (f === 3) console.log(out.join(' ')); });
P
cat > "$tmp/mark.ts" <<'P'
export const out: string[] = [];
export function mark(s: string): string { out.push(s); return s; }
P
cat > "$tmp/rows.tsx" <<'P'
import { mark } from './mark';
const lists = new Map<number, string[]>();
lists.set(2, ['a', 'b']);
export function Rows(p: { n: number }): i32 {
  const l = lists.get(p.n);
  return <View>{l === undefined ? <Text>{mark('none')}</Text> : l.map((s: string, i: i32) => <Text key={s}>{mark(s + i + (i > 0 ? l[i - 1] : ''))}</Text>)}</View>;
}
P
want="a0 b1a"
fail=0
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$ZINC" run --interp "$tmp/main.tsx" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "interpreter: want '$want', got '$got'"; fail=1; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$ZINC" run "$tmp/main.tsx" --engine quickjs 2>/dev/null | grep -v '^  \|^zinc run' | tail -1)
[ "$got" = "$want" ] || { echo "QuickJS: want '$want', got '$got'"; fail=1; }
if timeout 300 "$ZINC" build "$tmp/main.tsx" -o "$tmp/p" >/dev/null 2>&1; then
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$tmp/p" 2>&1 | tail -1)
  [ "$got" = "$want" ] || { echo "AOT: want '$want', got '$got'"; fail=1; }
else echo "AOT: build failed"; fail=1; fi
exit $fail
