#!/bin/sh
# zinc:ui/kit's Quiet theme (ZN-1078.02, docs/design.md): its shapes and colours (an 18 px card on white, a 36 px button), the accent switch
# recolours mounted nodes in light and dark, and springs land without overshoot and become a cut under reduced motion.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src"
echo '{ "name": "quiet", "entry": "src/main.tsx" }' > "$tmp/zinc.json"
cat > "$tmp/src/main.tsx" <<'P'
import * as ui from 'zinc:ui';
import { createNodeRef, render } from 'zinc:ui/solid';
import { Card, Button, theme, useQuietTheme, setThemeAccent, setTheme, DARK, themeColor, springValues, SPRING_SMOOTH } from 'zinc:ui/kit';
import { lookName } from 'zinc:ui/platform';
useQuietTheme();
const col = createNodeRef(), solid = createNodeRef();
let f = 0;
const out: string[] = [];
const hex = (n: number): string => (n as i32).toString(16);
function App(): i32 {
  return <View ref={col} className="flex-col p-4 gap-3 w-full">
    <Card className="h-10" />
    <Button label="Save" />
    <View ref={solid} className={`h-4 bg-${theme().primary}`} />
  </View>;
}
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) {
    const card = ui.childAt(ui.childAt(col.node, 0), 0), button = ui.childAt(ui.childAt(col.node, 1), 0);   // each component sits in a boundary node
    out.push(lookName(), hex(ui.getNumber(card, 'backgroundColor')), '' + ui.getNumber(card, 'borderRadius'), '' + Math.round(ui.screenBox(button)[3]), hex(ui.getNumber(solid.node, 'backgroundColor')));
    setThemeAccent('blue');
  }
  if (f === 3) { out.push(hex(ui.getNumber(solid.node, 'backgroundColor'))); setTheme(DARK); }
  if (f === 4) {
    out.push(hex(ui.getNumber(solid.node, 'backgroundColor')), hex(themeColor('card')));
    const v = springValues(0, 100, SPRING_SMOOTH);
    let top = 0;
    for (const x of v) top = Math.max(top, x);
    out.push(v.length > 5 && v[v.length - 1] === 100 && top <= 100 ? 'lands' : 'overshoots');
    ui.systemSignal('reducemotion 1');
    out.push('' + springValues(0, 100, SPRING_SMOOTH).length);
    console.log(out.join(' '));
  }
});
P
want='quiet ffffff 18 36 1d1d1d 562ef 3b82f6 181818 lands 1'
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=6 ZINC_SCALE=1 "$ZINC" run "$tmp" 2>&1 | grep -v '^ \|^zinc:' | tail -1)
[ "$got" = "$want" ] || { echo "kit quiet: want '$want', got '$got'"; exit 1; }
echo "kit quiet: ok"
