// The AppKit host (D210, ZN-1070, tests/t0/ui_appkit.sh): zinc:appkit shows this tree with real NSViews, headless (a window never shown) and dumps them.
// A view, a text, an image, a scroll view with rows, a field, a secure field, a text area and a Pressable that holds a text (a view of its own, as it
// takes the focus; the layout-only row is flattened). Then the events: a press goes through the views to zinc:ui (onClick), typing and Enter in the
// field come back as onInput, onChange and onSubmit, scrolling as onScroll; then an update, and a removal with a recycled handle.
import * as ui from 'zinc:ui';
import * as appkit from 'zinc:appkit';
import { quit } from 'zinc:gfx';

console.log(`shown ${appkit.hostShown()}`);
function make(tag: i32, cls: string, parent: i32): i32 { const h = ui.createNode(tag); ui.setClass(h, cls); if (parent >= 0) ui.insert(parent, h, -1); return h; }
function text(s: string, cls: string, parent: i32): i32 { const h = ui.createText(s); ui.setClass(h, cls); ui.insert(parent, h, -1); return h; }
const root = make(ui.VIEW, 'flex-col w-[320px] h-[240px] p-[8px] gap-[4px] bg-[#f0f0f0]', -1);
const title = text('Hello', 'h-[20px] text-[14px] font-bold', root);
const row = make(ui.VIEW, 'flex-row gap-[4px] h-[30px]', root);   // layout only: flattened
const box = make(ui.VIEW, 'w-[50px] h-[30px] bg-[#ff0000] rounded-[6px] border-[2px] border-[#0000ff]', row);
const pic = make(ui.IMAGE, 'w-[30px] h-[30px]', row);
ui.setImage(pic, 'dot.png');
const press = make(ui.VIEW, 'w-[80px] h-[30px] justify-center', row);   // a Pressable: a view (it takes the focus), its press goes through to zinc:ui
ui.listen(press, () => { console.log('pressed'); });
text('Press', 'h-[18px] text-[#336699]', press);
const field = make(ui.INPUT, 'h-[24px]', root);
ui.setPlaceholder(field, 'Name');
ui.onText(field, false, (v: string) => { console.log(`input ${v}`); });
ui.onText(field, true, (v: string) => { console.log(`change ${v}`); });
ui.onSubmit(root, () => { console.log('submit'); });
const secret = make(ui.INPUT, 'h-[24px]', root);
ui.setNumber(secret, 'password', 1);
ui.setValue(secret, 'pw');
const area = make(ui.TEXTAREA, 'h-[40px]', root);
ui.setValue(area, 'two\nlines');
const list = make(ui.SCROLL, 'h-[40px]', root);
for (let i = 0; i < 4; i++) text(`row ${i}`, 'h-[20px]', list);
ui.onScroll(list, (e: ui.ResponderEvent, _g: ui.GestureState) => { console.log(`scroll ${e.nativeEvent.contentOffset.y}`); });

let frame = 0, extra = -1;
ui.mount(root, 0xffffff, (_dt: number) => {
  frame++;
  if (frame === 2) { console.log('-- mounted'); console.log(appkit.dump()); }
  if (frame === 3) {
    console.log(`hit press ${appkit.hit(150, 50)} hit field ${appkit.hit(100, 80) === field}`);
    ui.pointerAt(150, 50, true);
  }
  if (frame === 4) { ui.pointerAt(150, 50, false); console.log(`typed ${appkit.drive(field, 0, 'hi')}`); }
  if (frame === 5) { console.log(`focus on field ${ui.focused() === field}`); console.log(`enter ${appkit.drive(field, 1)}`); }
  if (frame === 6) console.log(`scrolled ${appkit.drive(list, 2, '', 0, 30)}`);
  if (frame === 8) {
    console.log('-- update: a text, a colour, a removal, a new node on the freed handle');
    ui.setText(title, 'Hi');
    ui.setClass(box, 'w-[50px] h-[30px] bg-[#00ff00] rounded-[6px]');
    ui.remove(row, pic);
    extra = ui.createText('new');
    ui.setClass(extra, 'h-[18px]');
    ui.insert(row, extra, -1);
    console.log(`handle reused ${extra === pic}`);
  }
  if (frame === 10) { console.log(appkit.dump()); quit(); }
});
