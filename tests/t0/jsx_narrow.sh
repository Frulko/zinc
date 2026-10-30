#!/bin/sh
# A conditional in JSX keeps what its condition narrows in each branch, as the ternary written does (`p.children !== undefined ?
# p.children() : ...`, `p.render === undefined ? ... : p.render()`): it was refused with Z0105 or Z0107 in a .tsx file, as the
# branches run in functions of their own. On the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.tsx" <<'P'
import { render, createSignal } from 'zinc:ui/solid';
const [on, setOn] = createSignal<boolean>(true);
const out: string[] = [];
function mark(s: string): string { out.push(s); return s; }
function Bar(p: { id: string; children?: () => i32 }): i32 { return <View>{p.children !== undefined ? p.children() : <Text>{mark('none ' + p.id)}</Text>}</View>; }
function Tag(p: { id: string; render?: () => i32 }): i32 { return <View>{p.render === undefined ? <Text>{mark('- ' + p.id)}</Text> : p.render()}</View>; }
function App(): i32 { return <View><Bar id="a"><Text>{mark('kid')}</Text></Bar><Bar id="b" />{on() ? <Tag id="c" render={() => <Text>{mark('X')}</Text>} /> : <Tag id="d" />}</View>; }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) setOn(false);
  else if (f === 4) console.log(out.join(' '));
});
P
want="kid none b X - d"
fail=0
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=6 timeout 60 "$ZINC" run --interp "$tmp/p.tsx" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "interpreter: want '$want', got '$got'"; fail=1; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=6 timeout 60 "$ZINC" run "$tmp/p.tsx" --engine quickjs 2>/dev/null | grep -v '^  \|^zinc run' | tail -1)
[ "$got" = "$want" ] || { echo "QuickJS: want '$want', got '$got'"; fail=1; }
if timeout 300 "$ZINC" build "$tmp/p.tsx" -o "$tmp/p" >/dev/null 2>&1; then
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=6 timeout 60 "$tmp/p" 2>&1 | tail -1)
  [ "$got" = "$want" ] || { echo "AOT: want '$want', got '$got'"; fail=1; }
else echo "zinc build failed"; fail=1; fi
exit $fail
