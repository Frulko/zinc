// The native host contract (D210, ZN-1069, tests/t0/ui_native_host.sh): a stub host installed with ui.setHost prints each buffer zinc:ui hands it.
// The first commit mounts the whole tree; then a text, a colour and a move; a removal and a recycled handle in one frame; a removal alone.
// With ZINC_RENDER=drawn the same program installs nothing and is drawn.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const installed = ui.setHost((changes: string) => { console.log(`commit ${ui.hostCommitCount()}:`); console.log(changes); });
console.log(`native ${ui.nativeRender()} installed ${installed} active ${ui.hostActive()}`);
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col w-[200px] h-[100px] p-[8px] gap-[4px]');
const title = ui.createText('Hello');
ui.setClass(title, 'h-[20px] text-[14px]');
const box = ui.createNode(ui.VIEW);
ui.setClass(box, 'w-[50px] h-[30px] bg-[#ff0000] rounded-[6px]');
const note = ui.createText('a\\b\nc');
ui.setClass(note, 'h-[10px]');
ui.insert(root, title, -1);
ui.insert(root, box, -1);
ui.insert(root, note, -1);
let frame = 0, extra = -1;
ui.mount(root, 0xffffff, (_dt: number) => {
  frame++;
  if (frame === 3) {
    console.log('-- update: a text, a colour, a move');
    ui.setText(title, 'Hi');
    ui.setClass(box, 'w-[50px] h-[30px] bg-[#0000ff] rounded-[6px]');
    ui.moveChild(root, note, 0);
  }
  if (frame === 5) {
    console.log('-- removal, and a new node on the handle it freed');
    ui.remove(root, box);
    extra = ui.createText('new');
    ui.setClass(extra, 'h-[10px]');
    ui.insert(root, extra, -1);
    console.log(`handle reused ${extra === box}`);
  }
  if (frame === 7) { console.log('-- removal'); ui.remove(root, extra); }
  if (frame === 9) { console.log(`done: ${ui.hostCommitCount()} commits`); quit(); }
});
