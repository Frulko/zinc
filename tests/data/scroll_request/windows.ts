import * as ui from 'zinc:ui';
import { onFrame, frame, closeWindow, quit } from 'zinc:gfx';
import { equal, ok } from 'zinc:assert';
const root = ui.createNode(ui.VIEW), scroller = ui.createNode(ui.SCROLL), content = ui.createNode(ui.VIEW);
ui.setClass(scroller, 'w-[100] h-[100] overflow-auto');
ui.setNumber(content, 'width', 500); ui.setNumber(content, 'height', 500);
ui.insert(scroller, content, -1); ui.insert(root, scroller, -1);
const window = ui.mountWindow('Pending scroll ownership', 200, 180, root, 0xffffff);
ok(window >= 0, 'headless logical window created');
let hiddenLayouts: i32 = 0;
// No UI tree is mounted in the main window: its callback cannot cause the other surface to lay itself out accidentally.
onFrame((dt: number) => {
  const f = frame();
  if (f === 2) ui.scrollTo(scroller, 160, 170);
  if (f === 4) {
    equal(ui.scrollLeft(scroller), 160, 'foreign-surface x'); equal(ui.scrollTop(scroller), 170, 'foreign-surface y');
    ui.setNumber(scroller, 'hidden', 1); ui.scrollTo(scroller, 250, 260);
  }
  if (f === 6) hiddenLayouts = ui.layoutCount();
  if (f === 8) {
    equal(ui.layoutCount(), hiddenLayouts, 'hidden pending request stays idle');
    ui.setNumber(scroller, 'hidden', 0); ui.scrollTo(scroller, 270, 280);
  }
  if (f === 10) {
    equal(ui.scrollLeft(scroller), 270); equal(ui.scrollTop(scroller), 280);
    closeWindow(window); console.log('scroll windows: pass'); quit();
  }
});
