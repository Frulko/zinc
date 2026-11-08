// A left press while a right press holds the capture: each button gets its own onPointerUp.
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-row');
const a = ui.createNode(ui.VIEW), b = ui.createNode(ui.VIEW);
ui.setClass(a, 'w-[100px] h-[100px]'); ui.setClass(b, 'w-[100px] h-[100px]');
ui.insert(root, a, -1); ui.insert(root, b, -1);
const log: string[] = [];
function watch(h: i32, name: string): void {
  ui.onPointer(h, ui.PDOWN, (e: ui.PointerEvent) => { log.push('down' + name + e.button); });
  ui.onPointer(h, ui.PUP, (e: ui.PointerEvent) => { log.push('up' + name + e.button); });
}
watch(a, 'a'); watch(b, 'b');
let fr = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  if (fr !== 2) return;
  ui.pointerAt(50, 50, true, 2);     // right on a
  ui.pointerAt(150, 50, true, 0);    // left on b
  ui.pointerAt(150, 50, false, 0);   // left up: b's
  ui.pointerAt(150, 50, false, 2);   // right up: a's
  ui.pointerAt(50, 50, true, 0); ui.pointerAt(150, 50, true, 2); ui.pointerAt(50, 50, false, 0); ui.pointerAt(150, 50, false, 2);   // left first, right's own
  console.log('capture ' + log.join(','));
});
