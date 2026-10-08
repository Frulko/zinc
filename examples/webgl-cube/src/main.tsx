// webgl-cube: real three.js (r186) with its OrbitControls and TransformControls (the gizmo) in a zinc:script context with WebGL 2, shown as a Surface in a zinc:ui page.
// Drag the background to orbit, the wheel zooms, the cube carries a translate / rotate / scale gizmo (the buttons switch it).
import * as ui from 'zinc:ui';
import { Script } from 'zinc:script';
import { pixelScale } from 'zinc:gfx';

let t = 0, n = 0, speed = 1, buttons = 0;
const vm = new Script({ engine: 'quickjs', memoryLimit: 512 << 20, timeLimitMs: 0, importAssets: true });
vm.expose('__log', (s: string) => { console.log(s); });
vm.eval("const f = (...a) => __log(a.join(' ')); globalThis.console = { log: f, info: f, warn: f, error: f, debug: f };");
vm.set('__scale', pixelScale());   // the canvas gets the physical resolution (Retina)
vm.define('three', "export * from 'three.module.js';");   // the controls import 'three': the module that scene.mjs imports as ./three.module.js
vm.loadAsset('scene.mjs');

const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-3 p-4 w-full h-full bg-slate-900');
const title = ui.createNode(ui.TEXT); ui.setClass(title, 'text-lg font-bold text-white'); ui.setText(title, 'three.js on zinc: orbit controls and a transform gizmo');
const view = ui.createSurface(360 * pixelScale(), 240 * pixelScale()); ui.setClass(view, 'w-[360px] h-[240px] rounded-lg');
const info = ui.createNode(ui.TEXT); ui.setClass(info, 'text-sm text-slate-300'); ui.setText(info, 'drag to orbit, wheel to zoom, drag the gizmo to move the cube');

function pointer(type: string, e: ui.PointerEvent, b: i32): void { vm.call('pointer', [type, e.x, e.y, e.button, b]); }
ui.onPointer(view, ui.PDOWN, (e: ui.PointerEvent) => { buttons = 1 << e.button; pointer('pointerdown', e, buttons); });
ui.onPointer(view, ui.PMOVE, (e: ui.PointerEvent) => { pointer('pointermove', e, buttons); });
ui.onPointer(view, ui.PUP, (e: ui.PointerEvent) => { pointer('pointerup', e, 0); buttons = 0; });
ui.onPointer(view, ui.PWHEEL, (e: ui.PointerEvent) => { vm.call('wheel', [-e.wheel * 100]); });

const bar = ui.createNode(ui.VIEW); ui.setClass(bar, 'flex-row gap-2');
function button(label: string, f: () => void): void {
  const b = ui.createNode(ui.BUTTON); ui.setClass(b, 'px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 focus-visible:ring-2 ring-indigo-300');
  const tx = ui.createNode(ui.TEXT); ui.setClass(tx, 'text-sm text-white'); ui.setText(tx, label);
  ui.insert(b, tx, -1); ui.listen(b, f); ui.insert(bar, b, -1);
}
button('Move', () => { vm.call('setMode', ['translate']); });
button('Rotate', () => { vm.call('setMode', ['rotate']); });
button('Scale', () => { vm.call('setMode', ['scale']); });
button('Reset', () => { vm.call('resetCamera', []); vm.call('resetCube', []); });
button(speed > 0 ? 'Ring: spin' : 'Ring: stop', () => { speed = speed > 0 ? 0 : 1; });
ui.insert(root, title, -1); ui.insert(root, view, -1); ui.insert(root, bar, -1); ui.insert(root, info, -1);

ui.mount(root, 0x0f172a, (dt: number) => {
  t += dt * speed; n++;
  vm.call('frame', [ui.surfaceImage(view), t]);
  ui.repaint();   // a surface changes behind the UI's back: ask for the repaint (an idle page keeps its last frame)
  if (n % 15 === 0) ui.setText(info, `${vm.call('cubeInfo', [])}  ${Math.round(1 / Math.max(dt, 0.001))} fps`);
});
