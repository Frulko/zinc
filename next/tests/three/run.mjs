// The zinc side of tools/three-compare: the scene of scenes.mjs on the QuickJS engine, the frame printed as `RGBA <hex>` (rows bottom to top, like readPixels).
import { installShims, SIZE, hex } from './harness.mjs';
import * as scenes from './scenes.mjs';
import { glb } from './glb.mjs';
export async function run(name) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  installShims(canvas);
  const THREE = await import('three');
  const gl0 = canvas.getContext('webgl2');
  let calls = 0;   // the call rate of one frame, init included (recorded in docs/reports/three-on-zinc.md)
  for (let p = Object.getPrototypeOf(gl0); p && p !== Object.prototype; p = Object.getPrototypeOf(p))
    for (const k of Object.getOwnPropertyNames(p)) if (typeof p[k] === 'function' && k !== 'constructor' && !Object.prototype.hasOwnProperty.call(gl0, k)) { const f = p[k]; gl0[k] = function (...a) { calls++; return f.apply(this, a); }; }
  const s = await scenes[name](THREE, canvas, { import: (n) => import(n), glb });
  const before = calls;
  s.render();
  console.log('CALLS ' + calls + ' render ' + (calls - before));
  const gl = canvas.getContext('webgl2');
  const px = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px);
  console.log('RGBA ' + hex(px));
}
