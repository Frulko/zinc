// A kernel shaped like p5 1.x's WEBGL path for one box() (D110): 45 uniforms looked up by name, compared with the cached value and copied,
// 8 matrix copies, a push and a pop of a state object of 40 fields; 144 boxes a frame. Not p5: the same kind of code, with no DOM and no GL.
// build/zinc run bench/qjs/p5shape.js                      (QuickJS)
// jsc bench/qjs/p5shape.js, jsc --useJIT=false ...          (the shell in JavaScriptCore.framework/Versions/Current/Helpers)
// node bench/qjs/p5shape.js, node --jitless ...             (V8)
// bench/qjs/jsc-host.c                                     (the system JavaScriptCore embedded, with and without the JIT entitlement)
const gl = { uniform1f() {}, uniform3fv() {}, uniformMatrix4fv() {}, drawElements() {} };
const names = [];
for (let i = 0; i < 45; i++) names.push('uUniform' + i);
class Shader {
  constructor() { this.uniforms = {}; for (let i = 0; i < 45; i++) this.uniforms[names[i]] = { location: i, type: i % 3, _cachedData: undefined }; }
  _arraysEqual(a, b) { if (a.length !== b.length) return false; return a.every((v, k) => v === b[k]); }
  setUniform(name, data) {
    const u = this.uniforms[name];
    if (!u) return this;
    if (u._cachedData !== undefined && (Array.isArray(data) || data instanceof Float32Array ? this._arraysEqual(u._cachedData, data) : u._cachedData === data)) return this;
    u._cachedData = typeof data === 'number' ? data : data.slice(0);
    if (u.type === 0) gl.uniform1f(u.location, data); else if (u.type === 1) gl.uniform3fv(u.location, data); else gl.uniformMatrix4fv(u.location, false, data);
    return this;
  }
}
class Matrix {
  constructor() { this.mat4 = new Float32Array(16); for (let i = 0; i < 16; i += 5) this.mat4[i] = 1; }
  copy() { const m = new Matrix(); for (let i = 0; i < 16; i++) m.mat4[i] = this.mat4[i]; return m; }
  translate(x, y, z) { const m = this.mat4; m[12] += m[0] * x + m[4] * y + m[8] * z; m[13] += m[1] * x + m[5] * y + m[9] * z; m[14] += m[2] * x + m[6] * y + m[10] * z; return this; }
}
const shader = new Shader(), stack = [];
let state = {};
for (let i = 0; i < 40; i++) state['field' + i] = i % 4 === 0 ? [i, i, i, 1] : i;
let model = new Matrix(), sum = 0;
function frame(f) {
  for (let b = 0; b < 144; b++) {
    stack.push([Object.assign({}, state), model]); model = model.copy();          // push()
    model.translate(b, f, b * 0.5);
    const wave = Math.sin(b * 0.8 - f * 0.06), color = [0.5 + 0.5 * wave, 0.7, 1, 1];
    for (let i = 0; i < 45; i++) {
      const t = i % 3;
      shader.setUniform(names[i], t === 0 ? (i < 9 ? wave + i : i) : t === 1 ? (i < 12 ? [color[0], color[1], color[2]] : [0, 0, 1]) : (i < 15 ? model.mat4 : model.copy().mat4));
    }
    for (let k = 0; k < 6; k++) sum += model.copy().mat4[12];
    gl.drawElements(4, 36, 5123, 0);
    const top = stack.pop(); state = top[0]; model = top[1];                       // pop()
  }
}
for (let f = 0; f < 60; f++) frame(f);   // warm
const now = typeof performance !== "undefined" && performance.now ? () => performance.now() : () => Date.now();
const N = 600, t0 = now();
for (let f = 0; f < N; f++) frame(f);
const r = ((now() - t0) / N).toFixed(3) + ' ms per frame (checksum ' + sum.toFixed(1) + ')';
if (typeof console !== "undefined") console.log(r); else if (typeof print !== "undefined") print(r);
r;
