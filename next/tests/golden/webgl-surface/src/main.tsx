// A WebGL canvas inside a zinc:ui page (ZN-205): a script draws a triangle with gl.*, gl.zincPresent copies it into a Surface node, the node scrolls and clips with its page.
import * as ui from 'zinc:ui';
import { Script } from 'zinc:script';
import { quit } from 'zinc:gfx';
const SCRIPT = `
const canvas = document.createElement('canvas');
canvas.width = 64; canvas.height = 64;
const gl = canvas.getContext('webgl');
function shader(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; }
const p = gl.createProgram();
gl.attachShader(p, shader(gl.VERTEX_SHADER, 'attribute vec2 pos; void main() { gl_Position = vec4(pos, 0.0, 1.0); }'));
gl.attachShader(p, shader(gl.FRAGMENT_SHADER, 'precision mediump float; void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'));
gl.bindAttribLocation(p, 0, 'pos'); gl.linkProgram(p); gl.useProgram(p);
const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.8, -0.8, 0.8, -0.8, 0, 0.8]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
function draw(image) { gl.clearColor(0, 0, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3); return gl.zincPresent(image); }
`;
const vm = new Script({ engine: 'quickjs' });
vm.eval(SCRIPT);
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'w-full h-full bg-white');
const list = ui.createNode(ui.SCROLL);
ui.setClass(list, 'w-full h-[100px] flex-col gap-2 p-2');
const pad = ui.createNode(ui.VIEW);
ui.setClass(pad, 'h-[60px] w-full bg-slate-200');
const surface = ui.createSurface(64, 64);
ui.setClass(surface, 'w-16 h-16');
ui.insert(list, pad, -1); ui.insert(list, surface, -1);
ui.insert(root, list, -1);
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 1) console.log('present', vm.call('draw', [ui.surfaceImage(surface)]));
  if (f === 3) { ui.scrollTo(list, 0, 40); }
  if (f >= 5) quit();
});
