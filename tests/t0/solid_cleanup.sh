#!/bin/sh
# onCleanup in a component rendered by a list row (`{items().map(...)}`) or by a component call runs when the row goes away, as in Solid:
# it registers on the owner, which a row's render has, not on the running effect, which it has not (it was dropped, so examples/carnet
# kept the handles of freed text fields and crashed on the next page). A cleanup runs untracked, as in Solid: one that reads and sets a
# signal (examples/carnet-nbe: the focused block cleared when its row goes) does not make the list's effect run again, in the middle of
# its own run (it built the next page twice and kept the freed one).
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.tsx" <<'P'
import { render, createSignal, onCleanup } from 'zinc:ui/solid';
const [items, setItems] = createSignal<string[]>(['a', 'b', 'c']);
const [shown, setShown] = createSignal<boolean>(true);
const [picked, setPicked] = createSignal<string>('b');
const out: string[] = [];
let runs = 0;
function Row(props: { s: string }): i32 { onCleanup(() => { out.push('-' + props.s); if (picked() === props.s) setPicked(''); }); return <Text>{props.s}</Text>; }
function Box(): i32 { onCleanup(() => out.push('-box')); return <View><Text>box</Text></View>; }
function App(): i32 {
  return <View>{items().map((s: string) => { runs++; return <Row s={s} />; })}{shown() && <Box />}</View>;
}
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) setItems(['a', 'c']);
  else if (f === 3) setItems([]);
  else if (f === 4) setShown(false);
  else if (f === 5) { setPicked('c'); console.log(out.join(' ') + ' ' + runs); }
});
P
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=7 "$ZINC" run "$tmp/p.tsx" 2>&1 | tail -1)
[ "$got" = "-b -a -c -box 3" ] || { echo "solid cleanup: want '-b -a -c -box 3', got '$got'"; exit 1; }
echo "solid cleanup: ok"
