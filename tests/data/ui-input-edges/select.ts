// The pointer rests below a field it selects in: the selection keeps growing on a timer.
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
const f = ui.createNode(ui.TEXTAREA);
ui.setClass(f, 'w-[200px] h-[60px]');
let t = '';
for (let i = 0; i < 40; i++) t += 'line ' + i + '\n';
ui.setValue(f, t);
ui.insert(root, f, -1);
let fr = 0, c0: i32 = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  const b = ui.screenBox(f);
  if (fr === 2) { ui.pointerAt(b[0] + 10, b[1] + 10, true); ui.pointerAt(b[0] + 10, b[1] + 90, true); c0 = ui.caretOf(f); }
  if (fr === 30) { console.log('select ' + (ui.caretOf(f) > c0 + 20 ? 'grows' : 'stuck ' + c0 + ' ' + ui.caretOf(f))); ui.pointerAt(b[0] + 10, b[1] + 90, false); }
});
