import * as ui from 'zinc:ui';
import { width } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW), before = ui.createNode(ui.INPUT), desktop = ui.createNode(ui.VIEW), mobile = ui.createNode(ui.VIEW), end = ui.createNode(ui.INPUT);
const wideButton = ui.createNode(ui.INPUT), narrowButton = ui.createNode(ui.INPUT);
ui.setClass(root, 'flex-col w-full h-full');
for (const h of [before, wideButton, narrowButton, end]) { ui.setClass(h, 'w-10 h-10'); ui.setFocusable(h, true); }
ui.setClass(desktop, 'hidden md:flex w-20 h-20'); ui.setClass(mobile, 'flex md:hidden w-20 h-20');
ui.insert(desktop, wideButton, -1); ui.insert(mobile, narrowButton, -1);
for (const h of [before, desktop, mobile, end]) ui.insert(root, h, -1);
function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
// Class writes rebuild the same node; direction utilities do not change display.
const probe = ui.createNode(ui.VIEW);
for (const cls of ['hidden flex', 'hidden flex flex-col', 'hidden flex-row flex']) { ui.setClass(probe, cls); check(ui.getNumber(probe, 'hidden') === 0, cls); }
for (const cls of ['flex hidden', 'hidden flex-row', 'hidden flex-col']) { ui.setClass(probe, cls); check(ui.getNumber(probe, 'hidden') === 1, cls); }
ui.setClass(probe, 'hidden'); ui.setClass(probe, 'flex'); check(ui.getNumber(probe, 'hidden') === 0, 'class update reveal');
ui.setClass(probe, 'hidden'); check(ui.getNumber(probe, 'hidden') === 1, 'class update hide'); ui.destroy(probe);
let previous: i32 = -1, changes = 0;
ui.setAfterPaint(() => {
  const wide = width() >= 768;
  check(ui.getNumber(desktop, 'hidden') === (wide ? 0 : 1), 'desktop display');
  check(ui.getNumber(mobile, 'hidden') === (wide ? 1 : 0), 'mobile display');
  const visible = wide ? desktop : mobile, box = ui.screenBox(visible);
  check(box[2] === 80 && box[3] === 80, 'visible region layout');
  check(ui.screenBox(end)[1] === 120, 'hidden region takes no space');
  ui.focusNode(before); ui.sendKey('Tab'); check(ui.focused() === (wide ? wideButton : narrowButton), 'tab includes only visible subtree');
  ui.sendKey('Tab'); check(ui.focused() === end, 'hidden subtree skipped');
  if (previous !== width()) { previous = width(); changes++; console.log('display width', width(), 'desktop', wide); }
  if (changes === 4) { console.log('responsive display: ok'); ui.setAfterPaint(null); }
});
ui.mount(root, 0xffffff, null);
