// Several windows that talk (ZN-864), without JSX so the three engines run it: the main window and a second one each show a zinc:ui tree;
// zinc:system/window lists, moves and resizes both and closes the second; the windows exchange typed messages through a MessageChannel
// both ways, posted and as requests with replies. tests/t1/multiwin.sh runs it on the interpreter, AOT and QuickJS.
import * as ui from 'zinc:ui';
import * as win from 'zinc:system/window';
import { MessageChannel, MessageEvent } from 'zinc:worker';
import { frame } from 'zinc:gfx';

interface Note { text: string; n: i32 }

function el(tag: i32, cls: string, parent: i32): i32 { const h = ui.createNode(tag); ui.setClass(h, cls); if (parent >= 0) ui.insert(parent, h, -1); return h; }
function label(cls: string, text: string, parent: i32): i32 { const h = el(ui.TEXT, cls, parent); ui.setText(h, text); return h; }

const mainRoot = el(ui.VIEW, '', -1), mainPage = el(ui.VIEW, 'flex-col gap-3 p-6 h-full', mainRoot);
label('text-xl text-white', 'Main', mainPage);
const mainLine = label('text-sm text-slate-300', 'nothing yet', mainPage);
const sideRoot = el(ui.VIEW, '', -1), sidePage = el(ui.VIEW, 'flex-col gap-3 p-4 h-full', sideRoot);
label('text-lg text-slate-900', 'Side', sidePage);
const sideLine = label('text-sm text-slate-700', 'nothing yet', sidePage);

const ch = new MessageChannel<Note, Note>();
const mainPort = ch.port1, sidePort = ch.port2;
mainPort.onmessage = (e: MessageEvent<Note>) => { console.log(`main got '${e.data.text}' ${e.data.n}`); ui.setText(mainLine, `from side: ${e.data.text}`); };
sidePort.onmessage = (e: MessageEvent<Note>) => {
  console.log(`side got '${e.data.text}' ${e.data.n}`);
  ui.setText(sideLine, `from main: ${e.data.text}`);
  sidePort.postMessage({ text: 'thanks', n: e.data.n + 1 });
};
mainPort.handle((m: Note): Note => ({ text: `main counts ${m.text}`, n: m.n * 2 }));
sidePort.handle((m: Note): Note => ({ text: `side counts ${m.text}`, n: m.n + 100 }));

function show(): string {
  const parts: string[] = [];
  for (const w of win.list()) { const b = w.bounds(); parts.push(`${w.id}@${b.x},${b.y} ${b.w}x${b.h}`); }
  return parts.join(' ');
}

let side: win.AppWindow | null = null;
ui.mount(mainRoot, 0x0f172a, (dt: number) => {
  const f = frame();
  const s = side;
  if (s === null) return;
  if (f === 2) {
    console.log(`windows: ${show()}`);
    win.get(0).setPosition(10, 20);
    s.setPosition(400, 40);
    s.setSize(260, 160);
    s.setTitle('Side, resized');
    console.log(`moved: ${show()}`);
  } else if (f === 3) {
    mainPort.postMessage({ text: 'hello', n: 1 });
  } else if (f === 4) {
    sidePort.request({ text: 'apples', n: 21 }).then((r: Note) => { console.log(`side asked, main replied '${r.text}' ${r.n}`); });
    mainPort.request({ text: 'pears', n: 2 }).then((r: Note) => { console.log(`main asked, side replied '${r.text}' ${r.n}`); });
  } else if (f === 9) {
    s.close();
    console.log(`closed the side window: ${show()}, open ${s.isOpen() ? 'yes' : 'no'}`);
  }
});
side = win.get(ui.mountWindow('Side', 240, 140, sideRoot, 0xfffbeb));
console.log(`side window ${side.id}`);
