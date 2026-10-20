// Pipelined gl.zincPresent (ZN-411): presents in frames 1, 2 and 3 (red, green, blue), none in 4 and 5, one in 6 (yellow). Asynchronous,
// frame N shows the canvas of frame N - 1, and a canvas presented once and left (frames 3 and 6) shows at the next frame's end;
// tests/t1/webgl_present.sh compares the frame hashes with the synchronous presents.
import * as ui from 'zinc:ui';
import { Script } from 'zinc:script';
import { quit } from 'zinc:gfx';
const vm = new Script({ engine: 'quickjs' });
vm.eval(`
const canvas = document.createElement('canvas');
canvas.width = 32; canvas.height = 32;
const gl = canvas.getContext('webgl');
function draw(image, r, g, b) { gl.clearColor(r, g, b, 1); gl.clear(gl.COLOR_BUFFER_BIT); return gl.zincPresent(image); }
`);
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'w-full h-full bg-white');
const surface = ui.createSurface(32, 32);
ui.setClass(surface, 'w-8 h-8');
ui.insert(root, surface, -1);
const colors: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [], [], [1, 1, 0]];
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  const c: number[] = f <= colors.length ? colors[f - 1] : [];
  if (c.length === 3) vm.call('draw', [ui.surfaceImage(surface), c[0], c[1], c[2]]);
  ui.repaint();
  if (f >= 8) quit();
});
