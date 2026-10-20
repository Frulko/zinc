// Runtime shaders of zinc:gfx on the web (D124, docs/targets/web.md): shaderProgram / drawShader / shaderAvailable over one shared WebGL context. A program is the GLSL ES 1.00
// fragment main() the engine takes behind a fixed head (v_uv, u_size, u_p[8]); WebGL accepts that language as it is. drawShader renders the box at 1 / scale of the
// physical resolution, copies it into a gfx image of the box and draws that image through the ordinary image row, so it keeps its place in the paint order (what was drawn
// before stays under it, what follows is over it), the clip, the transform and the layer fade, in canvas and DOM mode alike.
// This file only loads in an app that calls one of these rows (the export puts it into native.js); it replaces the "no shaders" answers of runtime.js.
const Z = globalThis.__zincWeb, G = globalThis;
const HEAD = 'precision mediump float;\nvarying vec2 v_uv;\nuniform vec2 u_size;\nuniform vec4 u_p[8];\n';
const VS = 'attribute vec2 a_pos;\nvarying vec2 v_uv;\nvoid main() { v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); gl_Position = vec4(a_pos, 0.0, 1.0); }\n';
const progs = [];
const images = new Map();
let gl = null, cv = null, tried = false, buf = null, vs = null;
function context() {
  if (gl || tried) return gl;
  tried = true;
  cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }) || cv.getContext('webgl2', { antialias: false, depth: false });
  if (!gl) return null;
  buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VS);
  gl.compileShader(vs);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); for (const p of progs) p.prog = null; });
  cv.addEventListener('webglcontextrestored', () => { buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, VS); gl.compileShader(vs); });
  return gl;
}
function build(p) {
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, HEAD + p.src);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error('shader: ' + gl.getShaderInfoLog(fs)); p.failed = true; return; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('shader: ' + gl.getProgramInfoLog(prog)); p.failed = true; return; }
  p.prog = prog; p.uSize = gl.getUniformLocation(prog, 'u_size'); p.uP = gl.getUniformLocation(prog, 'u_p');
}
const R = {
  gfxShaderProgram: (src, scale) => { progs.push({ src: String(src), scale: Math.max(1, Math.min(8, scale | 0 || 1)), prog: null, failed: false }); return progs.length - 1; },
  gfxShaderAvailable: () => (context() && !gl.isContextLost() ? 1 : 0),
  gfxDrawShader: (id, x, y, w, h, u) => {
    const p = progs[id];
    if (!p || p.failed || !context() || gl.isContextLost() || w <= 0 || h <= 0) return;
    if (!p.prog) { build(p); if (!p.prog) return; }
    const dpr = Math.max(1, Math.min(3, G.devicePixelRatio || 1));
    const pw = Math.max(1, Math.round((w * dpr) / p.scale)), ph = Math.max(1, Math.round((h * dpr) / p.scale));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    gl.viewport(0, 0, pw, ph);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(p.prog);
    const v = new Float32Array(32);
    for (let i = 0; i < 32 && i < u.length; i++) v[i] = u[i];
    if (p.uSize) gl.uniform2f(p.uSize, w * dpr, h * dpr);
    if (p.uP) gl.uniform4fv(p.uP, v);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const key = id + '|' + x + '|' + y + '|' + w + '|' + h;
    let img = images.get(key);
    if (img === undefined) { img = G.__host_gfxCreateImage(pw, ph); images.set(key, img); if (images.size > 64) { const k = images.keys().next().value; G.__host_gfxDestroyImage(images.get(k)); images.delete(k); } }
    const c = Z.images.canvas(img);
    if (c === null) return;
    if (c.width !== pw || c.height !== ph) Z.images.resize(img, pw, ph);
    const g = c.getContext('2d');
    g.clearRect(0, 0, pw, ph);
    g.drawImage(cv, 0, 0);
    Z.images.touch(img);
    G.__host_gfxDrawImage(img, x, y, w, h, 255, 0);
  },
};
for (const [n, f] of Object.entries(R)) G['__host_' + n] = f;
