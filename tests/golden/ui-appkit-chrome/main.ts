// The AppKit window chrome (ZN-1071, tests/t0/ui_appkit_chrome.sh): zinc:appkit's Window, Toolbar (a symbol item and a custom item holding a field),
// SplitView and Sidebar shown by the AppKit host, headless (a titled window never shown), and dumped. Then the keyboard: Tab in a field is left to
// zinc:ui (the field editor does not move the focus itself), Tab and Shift-Tab move the first responder through the fields and a focusable view, keys
// reach the focused node; a toolbar item's press comes back as onPress; dragging the divider re-lays out the sidebar's and the content's subtrees, held
// between the sidebar's minWidth and maxWidth. ZINC_RENDER=drawn runs the same program drawn: the components' fallback, no host.
import * as ui from 'zinc:ui';
import * as appkit from 'zinc:appkit';
import { Window, Toolbar, ToolbarItem, SplitView, Sidebar } from 'zinc:appkit';
import { quit } from 'zinc:gfx';

console.log(`shown ${appkit.hostShown()}`);
function make(tag: i32, cls: string, parent: i32): i32 { const h = ui.createNode(tag); ui.setClass(h, cls); if (parent >= 0) ui.insert(parent, h, -1); return h; }
function text(s: string, cls: string, parent: i32): i32 { const h = ui.createText(s); ui.setClass(h, cls); if (parent >= 0) ui.insert(parent, h, -1); return h; }
function frag(a: i32, b: i32): i32 { const f = ui.createNode(ui.FRAGMENT); ui.insert(f, a, -1); ui.insert(f, b, -1); return f; }

const search = make(ui.INPUT, 'w-[120px] h-[22px]', -1);
ui.setPlaceholder(search, 'Search');
const add = ToolbarItem({ label: 'Add', symbol: 'plus', onPress: () => { console.log('add pressed'); } });
const find = ToolbarItem({ label: 'Search', children: () => search });
const bar = Toolbar({ children: () => frag(add, find) });

const folders = text('Folders', 'h-[20px]', -1);
const side = Sidebar({ width: 100, minWidth: 80, maxWidth: 160, children: () => folders });
const content = make(ui.VIEW, 'flex-1 flex-col p-[8px] gap-[4px]', -1);
const name = make(ui.INPUT, 'h-[24px]', content);
const mail = make(ui.INPUT, 'h-[24px]', content);
const go = make(ui.VIEW, 'h-[24px] bg-[#3366cc] rounded-[6px]', content);
ui.listen(go, () => { console.log('go pressed'); });
ui.onKeyDown(mail, (e: ui.KeyEvent) => { console.log(`mail key ${e.key}`); });
const split = SplitView({ className: 'flex-1', children: () => frag(side, content) });
const root = Window({ title: 'Library', toolbarStyle: 'unified', children: () => frag(bar, split) });

function box(h: i32): string { const b = ui.screenBox(h); return `${b[0]},${b[1]} ${b[2]}x${b[3]}`; }
let frame = 0;
ui.mount(root, 0xffffff, (_dt: number) => {
  frame++;
  if (frame === 2) {
    if (!appkit.hostShown()) { console.log(`drawn: toolbar ${box(bar)} sidebar ${box(side)} content ${box(content)} item ${box(add)}`); quit(); return; }
    console.log('-- mounted'); console.log(appkit.dump());
  }
  if (frame === 3) console.log(`typed ${appkit.drive(name, 0, 'Ann')}`);
  if (frame === 4) {
    console.log(`focus on name ${ui.focused() === name}`);
    console.log(`field editor tab ${appkit.drive(name, 3, 'insertTab:')}`);
  }
  if (frame === 5) {
    console.log(`still on name ${ui.focused() === name}`);
    ui.keyDown(-1, 'Tab');   // as SDL reports it while the field edits
  }
  if (frame === 6) { console.log(`tab to mail ${ui.focused() === mail}`); ui.keyDown(-1, 'x'); }
  if (frame === 7) ui.keyDown(-1, 'Tab');
  if (frame === 8) {
    console.log(`tab to go ${ui.focused() === go}`);
    console.log('-- focus on the view'); console.log(appkit.dump());
    ui.keyDown(-1, 'Enter');
  }
  if (frame === 9) ui.keyDown(-1, 'Tab', ui.SHIFT);
  if (frame === 10) { console.log(`shift-tab to mail ${ui.focused() === mail}`); console.log(`toolbar press ${appkit.drive(add, 5)}`); }
  if (frame === 11) console.log(`divider ${appkit.drive(split, 4, '', 140)}`);
  if (frame === 13) { console.log('-- divider at 140'); console.log(appkit.dump()); console.log(`divider ${appkit.drive(split, 4, '', 300)}`); }
  if (frame === 15) { console.log(`held at max: sidebar ${box(side)} content ${box(content)}`); quit(); }
});
