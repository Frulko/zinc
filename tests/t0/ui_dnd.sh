#!/bin/sh
# zinc:ui/dnd (after Atlassian's Pragmatic drag and drop): a drag past the threshold starts, enters and leaves the drop targets under the
# pointer, skips a target whose canDrop refuses, reports the closest edge on drop, and auto-scrolls a scroll container near its edge.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.ts" <<'P'
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
// a 100 px high scroller holding four 40 px rows (r0..r3), each a drop target with top / bottom edges; r0 is draggable
const root = ui.createNode(ui.VIEW), sc = ui.createNode(ui.SCROLL);
ui.setClass(root, 'flex-col w-full h-full'); ui.setClass(sc, 'flex-col w-[200] h-[100]');
ui.insert(root, sc, -1);
const rows: i32[] = [];
const log: string[] = [];
const EDGE: string[] = ['-', 'top', 'right', '', 'bottom'];
for (let i = 0; i < 4; i++) {
  const r = ui.createNode(ui.VIEW);
  ui.setClass(r, 'h-[40] w-full');
  ui.insert(sc, r, -1); rows.push(r);
  dnd.dropTarget(r, { data: `r${i}`, edges: dnd.EDGES_VERTICAL, canDrop: (d: dnd.DragInfo) => i !== 2,
    onDragEnter: (d: dnd.DragInfo) => { log.push(`enter r${i}`); }, onDragLeave: (d: dnd.DragInfo) => { log.push(`leave r${i}`); } });
}
dnd.draggable(rows[0], { data: 'r0', onDragStart: (d: dnd.DragInfo) => { log.push(`start ${d.data}`); } });
dnd.monitor({ onDrop: (d: dnd.DragInfo) => { log.push(d.targets.length === 0 ? 'drop nothing' : `drop on ${d.targets[0].data} ${EDGE[d.targets[0].edge]}`); } });
dnd.autoScroll(sc);
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) ui.pointerAt(50, 10, true);
  else if (f === 3) ui.pointerAt(50, 20, true);       // past the threshold: start, enter r0
  else if (f === 4) ui.pointerAt(50, 75, true);       // r1 (40..80), closer to its bottom edge
  else if (f === 5) ui.pointerAt(50, 75, false);      // drop on r1 bottom
  else if (f === 7) ui.pointerAt(50, 10, true);
  else if (f === 8) ui.pointerAt(50, 30, true);
  else if (f === 9) ui.pointerAt(50, 95, true);       // in the bottom zone: the scroller scrolls each frame
  else if (f === 30) { log.push(`scrolled ${ui.scrollTop(sc) > 0 ? 'yes' : 'no'}`); ui.pointerAt(50, 95, false); }
  else if (f === 32) console.log(log.join(' | '));
});
P
want='start r0 | enter r0 | leave r0 | enter r1 | drop on r1 bottom | start r0 | enter r0 | leave r0 | enter r3 | scrolled yes | drop on r3 bottom'
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=34 "$ZINC" run "$tmp/p.ts" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "dnd: want '$want'"; echo "     got  '$got'"; exit 1; }
echo "ui dnd: ok"
