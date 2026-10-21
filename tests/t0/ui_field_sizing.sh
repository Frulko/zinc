#!/bin/sh
# A textarea with rows={0} is as tall as its content (CSS field-sizing: content), the block editor's paragraphs (examples/carnet): it grows with
# new lines and with a line that wraps at its width, pushes what is below it in the same frame, and shrinks back when emptied.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.ts" <<'P'
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW), ta = ui.createNode(ui.TEXTAREA), below = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col w-full'); ui.setClass(ta, 'w-[200] p-0 border-0'); ui.setClass(below, 'h-[10]');
ui.setNumber(ta, 'rows', 0);
ui.insert(root, ta, -1); ui.insert(root, below, -1);
let f = 0;
const out: string[] = [];
function h(n: i32): number { return Math.round(ui.screenBox(n)[3]); }
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { out.push(`${h(ta)}`); ui.setValue(ta, 'one\ntwo\nthree'); }
  else if (f === 4) { out.push(`${h(ta)}`); ui.focusNode(ta); ui.select(ta, 13, 13); ui.typeText(-1, ' and a long line that wraps over the width of the field'); }
  else if (f === 6) { out.push(`${h(ta) > 60 ? 'wrapped' : 'not-wrapped'} ${Math.round(ui.screenBox(below)[1]) === h(ta) ? 'pushed' : 'overlaps'}`); ui.setValue(ta, ''); }
  else if (f === 8) { out.push(`${h(ta)}`); console.log(out.join(' ')); }
});
P
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=10 "$ZINC" run "$tmp/p.ts" 2>&1 | tail -1)
[ "$got" = "20 60 wrapped pushed 20" ] || { echo "rows={0}: want '20 60 wrapped pushed 20', got '$got'"; exit 1; }
echo "ui field sizing: ok"
