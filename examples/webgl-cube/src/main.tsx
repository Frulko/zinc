// webgl-cube: real three.js (r186) in a zinc:script context with WebGL 2, shown as a Surface inside a zinc:ui page next to ordinary controls.
import * as ui from 'zinc:ui';
import { Script } from 'zinc:script';

let t = 0, n = 0, speed = 1;
const vm = new Script({ engine: 'quickjs', memoryLimit: 512 << 20, timeLimitMs: 0, importAssets: true });
vm.expose('__log', (s: string) => { console.log(s); });
vm.eval("const f = (...a) => __log(a.join(' ')); globalThis.console = { log: f, info: f, warn: f, error: f, debug: f };");
vm.loadAsset('scene.mjs');
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-3 p-4 w-full h-full bg-slate-900');
const title = ui.createNode(ui.TEXT); ui.setClass(title, 'text-lg font-bold text-white'); ui.setText(title, 'three.js on zinc: WebGL 2 in a UI page');
const view = ui.createSurface(360, 240); ui.setClass(view, 'w-[360px] h-[240px] rounded-lg');
const info = ui.createNode(ui.TEXT); ui.setClass(info, 'text-sm text-slate-300'); ui.setText(info, 'starting');
const bar = ui.createNode(ui.VIEW); ui.setClass(bar, 'flex-row gap-2');
function button(label: string, f: () => void): void {
  const b = ui.createNode(ui.BUTTON); ui.setClass(b, 'px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 ring-indigo-300 focus-visible:ring-2');
  const t = ui.createNode(ui.TEXT); ui.setClass(t, 'text-sm text-white'); ui.setText(t, label);
  ui.insert(b, t, -1); ui.listen(b, f); ui.insert(bar, b, -1);
}
button('Slower', () => { speed = Math.max(0, speed - 0.5); });
button('Faster', () => { speed = speed + 0.5; });
button('Pause', () => { speed = 0; });
ui.insert(root, title, -1); ui.insert(root, view, -1); ui.insert(root, bar, -1); ui.insert(root, info, -1);
ui.mount(root, 0x0f172a, (dt: number) => {
  t += dt * speed; n++;
  vm.call('frame', [ui.surfaceImage(view), t]);
  if (n % 15 === 0) ui.setText(info, `frame ${n}, speed ${speed}, ${Math.round(1 / Math.max(dt, 0.001))} fps`);
});
