#!/bin/sh
# zinc:ui/kit's Input and Textarea (ZN-799): shadcn's shape (an Input 36 px high, a Textarea taller), typing reaches onInput, a disabled field
# takes no focus. A zinc.json whose app.window has no app.id runs (a first project names a window size, not a bundle id).
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src"
echo '{ "name": "first", "entry": "src/main.tsx", "app": { "window": { "width": 400, "height": 300 } } }' > "$tmp/zinc.json"
cat > "$tmp/src/main.tsx" <<'P'
import * as ui from 'zinc:ui';
import { Input, Textarea } from 'zinc:ui/kit';
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
const [name, setName] = createSignal('');
const [note, setNote] = createSignal('');
const col = createNodeRef();
let f = 0;
function App(): i32 {
  return <View ref={col} className="flex-col p-4 gap-3 w-full">
    <Input value={() => name()} onInput={setName} placeholder="Name" />
    <Textarea value={() => note()} onInput={setNote} />
    <Input placeholder="Off" disabled={true} onInput={setName} />
  </View>;
}
function findField(h: i32): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if (n.tag === ui.INPUT || n.tag === ui.TEXTAREA) return h;
  for (const child of n.children) { const found = findField(child); if (found >= 0) return found; }
  return -1;
}
render(App, 0xffffff, (dt: number) => {
  f++;
  const field = (i: i32): i32 => findField(ui.childAt(col.node, i));
  const a = field(0), b = field(1), c = field(2);
  if (f === 2) { ui.focusNode(a); ui.typeText(-1, 'Ada'); ui.focusNode(b); ui.typeText(-1, 'hi'); ui.focusNode(c); }
  if (f === 4) console.log(`${Math.round(ui.screenBox(a)[3])} ${ui.screenBox(b)[3] > 50 ? 'tall' : 'short'} ${name()} ${note()} ${ui.focused() === c ? 'disabled-focused' : 'kept'}`);
});
P
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=6 ZINC_SCALE=1 "$ZINC" run "$tmp" 2>&1 | grep -v '^ \|^zinc:' | tail -1)
[ "$got" = "36 tall Ada hi kept" ] || { echo "kit input: want '36 tall Ada hi kept', got '$got'"; exit 1; }
echo "kit input: ok"
