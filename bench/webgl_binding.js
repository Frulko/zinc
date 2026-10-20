// ZN-567: the cost of WebGL binding calls on QuickJS (zinc run bench/webgl_binding.js --engine quickjs): typed arrays given to uniform4fv and
// bufferSubData, the per-draw checks of drawArrays, and drawElements of the same 60k-index range again and again. ns (us) per call, best of 5.
const canvas = document.createElement('canvas');
canvas.width = 64; canvas.height = 64;
const gl = canvas.getContext('webgl', { antialias: false });
const shader = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
const prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, 'attribute vec2 p; attribute vec3 n; attribute vec2 uv; uniform mat4 m; varying vec3 v; void main() { v = n + vec3(uv, 0.0); gl_Position = m * vec4(p, 0.0, 1.0); }'));
gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, 'precision mediump float; uniform vec4 c; varying vec3 v; void main() { gl_FragColor = c + vec4(v, 0.0); }'));
gl.linkProgram(prog); gl.useProgram(prog);
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(7 * 3), gl.DYNAMIC_DRAW);
for (const [name, size, off] of [['p', 2, 0], ['n', 3, 8], ['uv', 2, 20]]) { const at = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, size, gl.FLOAT, false, 28, off); }
const idx = new Uint16Array(60000); for (let i = 0; i < idx.length; i++) idx[i] = i % 3;
const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
const c = gl.getUniformLocation(prog, 'c'), m = gl.getUniformLocation(prog, 'm');
gl.uniformMatrix4fv(m, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
const v4 = new Float32Array([1, 0.5, 0.25, 1]), data = new Float32Array(8), raw = new ArrayBuffer(32);
function time(n, f) {   // best of 5 runs, ns per call
  let best = Infinity;
  for (let r = 0; r < 5; r++) { const t = performance.now(); for (let i = 0; i < n; i++) f(); gl.finish(); best = Math.min(best, (performance.now() - t) * 1e6 / n); }
  return best;
}
const out = {
  'uniform4f': time(100000, () => gl.uniform4f(c, 1, 0.5, 0.25, 1)),
  'uniform4fv(Float32Array)': time(100000, () => gl.uniform4fv(c, v4)),
  'bufferSubData(ArrayBuffer)': time(100000, () => gl.bufferSubData(gl.ARRAY_BUFFER, 0, raw)),
  'bufferSubData(Float32Array)': time(100000, () => gl.bufferSubData(gl.ARRAY_BUFFER, 0, data)),
  'drawArrays': time(50000, () => gl.drawArrays(gl.TRIANGLES, 0, 3)),
  'drawElements 60k': time(2000, () => gl.drawElements(gl.TRIANGLES, 60000, gl.UNSIGNED_SHORT, 0)),
};
for (const k in out) console.log(k.padEnd(28) + (out[k] >= 10000 ? (out[k] / 1000).toFixed(1) + ' us' : out[k].toFixed(0) + ' ns'));
if (gl.getError()) console.log('GL error');
