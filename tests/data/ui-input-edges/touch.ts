// The pointer finger lifts first, the other stays down: the next press and second finger pinch again (ZN-997).
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
const s = ui.createNode(ui.VIEW);
ui.setClass(s, 'w-[300px] h-[300px]');
ui.insert(root, s, -1);
const log: string[] = [];
ui.onPointer(s, ui.PPINCH, (e: ui.PointerEvent) => { log.push('pinch' + e.phase); });
let fr = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  if (fr !== 2) return;
  ui.touchAt(1, 50, 100, 0); ui.touchAt(2, 150, 100, 0); ui.touchAt(2, 180, 100, 1);
  ui.touchAt(1, 50, 100, 2);    // the pointer finger lifts first; finger 2 stays down
  ui.touchAt(2, 190, 100, 1);   // a move of the forgotten finger: nothing
  ui.touchAt(3, 60, 200, 0); ui.touchAt(4, 160, 200, 0); ui.touchAt(4, 200, 200, 1);   // a new pinch
  ui.touchAt(4, 200, 200, 2); ui.touchAt(3, 60, 200, 2); ui.touchAt(2, 190, 100, 2);
  console.log('touch ' + log.join(','));
});
