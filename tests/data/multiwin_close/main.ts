// Windows that open where asked and close cleanly (ZN-1032), without JSX so the three engines run it: open({x, y}) places a scene window; a
// zinc:ui window closed and reopened on the same root leaves no stale Surface; onClosed runs once per window; the scene window keeps its pixels
// while its scene does not change; closing the main window with onClosed(quit) ends the program while other windows are open (Electron's
// mainWindow.on('closed', () => app.quit())). tests/t0/multiwin_close.sh.
import * as ui from 'zinc:ui';
import * as win from 'zinc:system/window';
import { frame, quit, closeWindow } from 'zinc:gfx';

function el(tag: i32, cls: string, parent: i32): i32 { const h = ui.createNode(tag); ui.setClass(h, cls); if (parent >= 0) ui.insert(parent, h, -1); return h; }
const mainRoot = el(ui.VIEW, 'p-4', -1);
ui.setText(el(ui.TEXT, 'text-white', mainRoot), 'Main');
const toolsRoot = el(ui.VIEW, 'p-2', -1);
ui.setText(el(ui.TEXT, 'text-slate-900', toolsRoot), 'Tools');

const scene = win.open({ title: 'Scene', width: 120, height: 80, x: 300, y: 50 });
scene.setScene({ background: 0x203040, shapes: [{ kind: 'rect', x: 10, y: 10, w: 40, h: 30, r: 0, color: 0xffcc00, text: '' }] });
const b = scene.bounds();
console.log(`scene at ${b.x},${b.y} ${b.w}x${b.h}`);
win.open({ title: 'Ticker', width: 40, height: 40 }, (dt: number) => { if (frame() === 40) console.log('still running at frame 40'); });

function openTools(): win.AppWindow {
  const t = win.get(ui.mountWindow('Tools', 100, 60, toolsRoot, 0xfffbeb));
  const id = t.id;
  t.onClosed(() => { console.log(`tools ${id} closed`); });
  return t;
}
let tools = openTools();
ui.mount(mainRoot, 0x0f172a, (dt: number) => {
  const f = frame();
  if (f === 2) { console.log(`mounted ${ui.mountedWindows().length}`); tools.close(); }
  else if (f === 4) { console.log(`after close: mounted ${ui.mountedWindows().length}`); tools = openTools(); }
  else if (f === 5) { console.log(`reopened: mounted ${ui.mountedWindows().length}`); tools.close(); }
  else if (f === 7) {
    console.log(`after the second close: mounted ${ui.mountedWindows().length}, windows ${win.list().length}`);
    win.get(0).onClosed(() => { console.log('main closed: quit'); quit(); });
    closeWindow(0);
  }
});
