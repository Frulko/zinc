// The scene of examples/webgl-studio: the glTF truck loads, markers follow the objects, a pick below a marker finds the object, select attaches the gizmo, look() switches shadows, shader and wireframe.
import * as ui from 'zinc:ui';
import { Script } from 'zinc:script';
import { pixelScale, quit } from 'zinc:gfx';
const vm = new Script({ engine: 'quickjs', memoryLimit: 768 << 20, timeLimitMs: 0, importAssets: true });
vm.expose('__log', (s: string) => { console.log(s); });
vm.eval("const f = (...a) => __log(a.join(' ')); globalThis.console = { log: f, info: f, warn: f, error: f, debug: f };");
vm.set('__scale', pixelScale());
vm.define('three', "export * from 'three.module.js';");
vm.loadAsset('scene.mjs');
const root = ui.createNode(ui.VIEW);
const view = ui.createSurface(480 * pixelScale(), 360 * pixelScale()); ui.setClass(view, 'w-[480px] h-[360px]');
ui.insert(root, view, -1);
let f = 0;
ui.mount(root, 0x0f172a, (dt: number) => {
  f++;
  vm.call('frame', [ui.surfaceImage(view), f / 60]);
  ui.repaint();
  if (f === 4) {
    const m = JSON.parse(vm.call('markers', []) as string) as [string, number, number, number][];
    console.log('markers', m.map((e) => e[0] + ':' + e[3]).join(' '));
    for (const e of m) console.log('pick below the marker of', e[0], '->', vm.call('pick', [e[1], e[2] + 36]) || 'nothing');
    console.log('pick the sky ->', vm.call('pick', [240, 4]) || 'nothing');
    console.log('select', vm.call('select', ['Cube']), '|', vm.call('info', []));
    console.log('select nothing ->', JSON.stringify(vm.call('select', [''])));
    vm.call('look', [90, 3, 1.2, false, true, false, true]);
    vm.call('frame', [ui.surfaceImage(view), 1]);
    console.log('look applied');
    quit();
  }
});
