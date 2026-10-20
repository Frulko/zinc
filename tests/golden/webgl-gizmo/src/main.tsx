// The webgl-cube controls (ZN-205): pointer events of a Surface reach three's OrbitControls and TransformControls; dragging the background moves the camera, dragging the gizmo's X arrow moves the cube.
import * as ui from 'zinc:ui';
import { Script } from 'zinc:script';
import { pixelScale } from 'zinc:gfx';
import { quit } from 'zinc:gfx';
let buttons = 0;
const vm = new Script({ engine: 'quickjs', memoryLimit: 512 << 20, timeLimitMs: 0, importAssets: true });
vm.expose('__log', (s: string) => { console.log(s); });
vm.eval("const f = (...a) => __log(a.join(' ')); globalThis.console = { log: f, info: f, warn: f, error: f, debug: f };");
vm.set('__scale', pixelScale());   // the canvas gets the physical resolution (Retina)
vm.define('three', "export * from 'three.module.js';");
vm.loadAsset('scene.mjs');
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'p-4 w-full h-full bg-slate-900');
const view = ui.createSurface(360 * pixelScale(), 240 * pixelScale()); ui.setClass(view, 'w-[360px] h-[240px]');
ui.insert(root, view, -1);
function pointer(type: string, e: ui.PointerEvent, b: i32): void { vm.call('pointer', [type, e.x, e.y, e.button, b]); }
ui.onPointer(view, ui.PDOWN, (e: ui.PointerEvent) => { buttons = 1 << e.button; pointer('pointerdown', e, buttons); });
ui.onPointer(view, ui.PMOVE, (e: ui.PointerEvent) => { pointer('pointermove', e, buttons); });
ui.onPointer(view, ui.PUP, (e: ui.PointerEvent) => { pointer('pointerup', e, 0); buttons = 0; });
ui.onPointer(view, ui.PWHEEL, (e: ui.PointerEvent) => { vm.call('wheel', [-e.wheel * 100]); });
let f = 0, ax = 0, ay = 0, hit = -1;
ui.mount(root, 0x0f172a, (dt: number) => {
  f++;
  vm.call('frame', [ui.surfaceImage(view), f / 60]);
  ui.repaint();
  if (f === 3) { console.log('camera before', vm.call('cameraPos', [])); ui.pointerAt(16 + 40, 16 + 200, false); ui.pointerAt(16 + 40, 16 + 200, true); ui.pointerAt(16 + 140, 16 + 180, true); ui.pointerAt(16 + 140, 16 + 180, false); }
  if (f === 6) { console.log('camera after an orbit drag', vm.call('cameraPos', [])); }
  if (f === 7) { const c = vm.call('cubeScreen', []) as number[]; ax = c[0]; ay = c[1]; console.log('cube on canvas', Math.round(ax), Math.round(ay)); }
  if (f >= 8 && f < 8 + 40 && hit < 0) {   // slide the pointer right of the cube until the gizmo reports its X arrow under it
    const dx = 6 + (f - 8) * 2;
    ui.pointerAt(16 + ax + dx, 16 + ay, false);
    if (f > 8) { const a = vm.call('hoverAxis', []) as string; if (a === 'X') hit = dx; }
  }
  if (f === 50) {
    console.log('x arrow found', hit >= 0);
    console.log('cube before', vm.call('cubeInfo', []));
    ui.pointerAt(16 + ax + hit, 16 + ay, true);
    ui.pointerAt(16 + ax + hit + 30, 16 + ay, true);
    ui.pointerAt(16 + ax + hit + 60, 16 + ay, true);
    ui.pointerAt(16 + ax + hit + 60, 16 + ay, false);
  }
  if (f === 54) { console.log('cube after a drag on the X arrow', vm.call('cubeInfo', [])); quit(); }
});
