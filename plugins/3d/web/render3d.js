// zinc:3d in the browser (ZN-563.03): the native side of plugins/3d/native/render3d.spec.ts on the page's WebGL 2, a port of native/render3d.gl.cpp
// (same shaders, same programs per kind of material, lighting per vertex, per-pixel specular, fog, blending, mipmapped textures). One WebGL 2 context
// on a canvas of its own; a target is a multisampled framebuffer drawn at the page's pixel ratio, blitted at end() into that canvas, then copied into
// the target's own 2D canvas, which present() paints in the screen box (Z.paint.element: canvas and DOM render alike). index.ts runs unchanged.
// ponytail: no worlds (worldOpen answers -1: include/zn/zworld.h is not read here) and no assetOpen (-1: loadModel reads a .zmesh through zinc:assets
// and meshLoad); add them when a web program streams a world.
const Z = globalThis.__zincWeb;
const VCOL = 1, FLAT = 2, UNLIT = 4, DOUBLE = 8, NOFOG = 1 << 16, ALPHA = 1, ADD = 2;
const P_LIT = 1, P_FLAT = 2, P_TEX = 4, P_VCOL = 8, P_SPEC = 16, P_EMIT = 32, P_BLEND = 64, P_FOG = 128;

const SHADE = `
uniform vec3 u_amb, u_ld[4], u_lc[4], u_eye, u_spec;
uniform float u_shin;
vec3 shade(vec3 n, vec3 base) {
  vec3 l = u_amb;
  for (int i = 0; i < 4; i++) l += max(-dot(n, u_ld[i]), 0.0) * u_lc[i];
  return base * min(l, vec3(1.0));
}
vec3 highlight(vec3 n, vec3 p) {
  vec3 v = normalize(u_eye - p), s = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 l = -u_ld[i];
    float k = dot(n, l);
    if (k > 0.0) s += k * 0.25 * (u_shin * 0.5 + 1.0) * pow(max(dot(n, normalize(l + v)), 0.0), u_shin) * u_lc[i];
  }
  return s * u_spec;
}
`;
const VS = `
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_col;
uniform mat4 u_mvp, u_model;
uniform vec3 u_color;
out vec3 v_col;
out vec2 v_uv;
out vec3 v_pos, v_nrm;
#ifdef FOG
out float v_fz;
#endif
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_nrm = (u_model * vec4(a_nrm, 0.0)).xyz;
#ifdef VCOL
  vec3 base = a_col.bgr;
#else
  vec3 base = u_color;
#endif
#if defined(LIT) && !defined(FLAT)
  v_col = shade(normalize(v_nrm), base);
#else
  v_col = base;
#endif
  v_uv = a_uv;
  v_pos = (u_model * vec4(a_pos, 1.0)).xyz;
#ifdef FOG
  v_fz = gl_Position.w;
#endif
}
`;
const FS = `
uniform sampler2D u_tex;
#ifdef EMIT
uniform vec3 u_emit;
#endif
#ifdef BLEND
uniform float u_alpha;
#endif
#ifdef FOG
uniform vec3 u_fogc;
uniform vec2 u_fog;
in float v_fz;
#endif
in vec3 v_col;
in vec2 v_uv;
in vec3 v_pos, v_nrm;
out vec4 o_color;
void main() {
  vec3 c = v_col;
#if defined(LIT) && defined(FLAT)
  vec3 n = normalize(cross(dFdx(v_pos), dFdy(v_pos)));   // y is not flipped here (render3d.gl.cpp flips it, hence its minus)
  if (!gl_FrontFacing) n = -n;
  c = shade(n, c);
#endif
#if defined(LIT) && defined(SPEC)
#ifdef FLAT
  c = min(c + highlight(n, v_pos), vec3(1.0));
#else
  c = min(c + highlight(normalize(v_nrm), v_pos), vec3(1.0));
#endif
#endif
#ifdef EMIT
  c = min(c + u_emit, vec3(1.0));
#endif
#ifdef TEX
  c *= texture(u_tex, v_uv).rgb;
#endif
#ifdef FOG
  c = mix(c, u_fogc, clamp((v_fz - u_fog.x) / (u_fog.y - u_fog.x), 0.0, 1.0));
#endif
#ifdef BLEND
  o_color = vec4(c, u_alpha);
#else
  o_color = vec4(c, 1.0);
#endif
}
`;

let gl = null, cv = null, samples = 0, filter = 3;
const meshes = [], targets = [], progs = [], texs = new Map();
let cur = null, frame = 0, used = null, cull = -1, blendOn = -1, tris = 0;
let nl = 0;
const amb = [0, 0, 0], ld = new Float32Array(12), lc = new Float32Array(12), eye = [0, 0, 0], spec = [0, 0, 0], emit = [0, 0, 0], fogC = [0, 0, 0];
let shin = 1, fogOn = false, fogN = 0, fogF = 1;
const vp = new Float32Array(16), M = new Float32Array(16), MVP = new Float32Array(16);

function ctx() {
  if (gl) return gl;
  Z.require('webgl2', 'zinc:3d draws on WebGL 2');
  cv = document.createElement('canvas');
  gl = cv.getContext('webgl2', { alpha: true, depth: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false });
  if (!gl) throw new Z.ZnUnsupported('webgl2', 'zinc:3d: the browser gave no WebGL 2 context');
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.cullFace(gl.BACK);
  samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES)); if (samples < 2) samples = 0;   // ponytail: the plugin's msaa and filter options at their defaults (no options reach the page)
  return gl;
}
const add = (pool, v) => { let i = pool.indexOf(null); if (i < 0) i = pool.push(v) - 1; else pool[i] = v; return i; };
const rgb = (c) => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];

function shader(kind, defs, body) {
  const s = gl.createShader(kind);
  gl.shaderSource(s, '#version 300 es\nprecision highp float;\n' + defs + SHADE + body);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('zinc:3d: shader:', gl.getShaderInfoLog(s));
  return s;
}
function program(k) {
  if (progs[k]) return progs[k];
  const defs = [[P_FOG, 'FOG'], [P_LIT, 'LIT'], [P_FLAT, 'FLAT'], [P_TEX, 'TEX'], [P_VCOL, 'VCOL'], [P_SPEC, 'SPEC'], [P_EMIT, 'EMIT'], [P_BLEND, 'BLEND']]
    .filter(([b]) => k & b).map(([, n]) => '#define ' + n + '\n').join('');
  const id = gl.createProgram(), vs = shader(gl.VERTEX_SHADER, defs, VS), fs = shader(gl.FRAGMENT_SHADER, defs, FS);
  gl.attachShader(id, vs); gl.attachShader(id, fs); gl.linkProgram(id); gl.deleteShader(vs); gl.deleteShader(fs);
  const p = { id: null, frame: -1 };
  if (!gl.getProgramParameter(id, gl.LINK_STATUS)) { console.error('zinc:3d: program:', gl.getProgramInfoLog(id)); gl.deleteProgram(id); return (progs[k] = p); }
  p.id = id;
  for (const u of ['mvp', 'model', 'color', 'amb', 'ld', 'lc', 'eye', 'spec', 'shin', 'emit', 'alpha', 'fogc', 'fog', 'tex']) p[u] = gl.getUniformLocation(id, 'u_' + u);
  gl.useProgram(id); gl.uniform1i(p.tex, 0); used = id;
  return (progs[k] = p);
}

// one interleaved buffer as render3d.gl.cpp's: position, normal, uv, colour (36 bytes a vertex)
function upload(pos, nrm, uv, col, idx, nv) {
  const buf = new ArrayBuffer(36 * nv), f = new Float32Array(buf), u = new Uint32Array(buf);
  for (let i = 0; i < nv; i++) {
    const o = i * 9;
    f[o] = pos[i * 3]; f[o + 1] = pos[i * 3 + 1]; f[o + 2] = pos[i * 3 + 2];
    f[o + 3] = nrm[i * 3]; f[o + 4] = nrm[i * 3 + 1]; f[o + 5] = nrm[i * 3 + 2];
    if (uv) { f[o + 6] = uv[i * 2]; f[o + 7] = uv[i * 2 + 1]; }
    if (col) u[o + 8] = col[i];
  }
  const g = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), ibo: gl.createBuffer(), ni: idx.length, nv, uv: !!uv, col: !!col, interleaved: true };
  gl.bindVertexArray(g.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  for (let a = 0; a < 4; a++) gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 24); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 36, 32);
  gl.bindVertexArray(null);
  g.f = f;   // kept for meshDeform
  return add(meshes, g);
}

function meshCreate(pos, nrm, uv, col, idx) {
  ctx();
  const nv = (pos.length / 3) | 0, ni = ((idx.length / 3) | 0) * 3;
  if (nv <= 0 || nv > 65535) return -1;
  const ix = new Uint16Array(ni);
  for (let i = 0; i < ni; i++) { const k = idx[i]; ix[i] = k >= 0 && k < nv ? k : 0; }
  const n = new Float32Array(nv * 3);
  if (nrm.length >= nv * 3) for (let i = 0; i < nv * 3; i++) n[i] = nrm[i];
  else for (let t = 0; t < ni; t += 3) {   // smooth normals: area-weighted face normals, as render3d.host.cpp
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ax = pos[b] - pos[a], ay = pos[b + 1] - pos[a + 1], az = pos[b + 2] - pos[a + 2], bx = pos[c] - pos[a], by = pos[c + 1] - pos[a + 1], bz = pos[c + 2] - pos[a + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (const o of [a, b, c]) { n[o] += nx; n[o + 1] += ny; n[o + 2] += nz; }
  }
  for (let i = 0; i < nv * 3; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]); if (l > 0) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } }
  return upload(pos, n, uv.length >= nv * 2 ? uv : null, col.length >= nv ? col : null, ix, nv);
}

// a .zmesh part (include/zn/zmesh.h): header nv, ni, flags (24 bytes), then positions, normals, uvs (flag 1), colours (flag 2), u16 indices
function meshLoad(data, at) {
  ctx();
  const n = data.length;
  if (at < 0 || (at & 3) || at + 24 > n) return -1;
  const b = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const dv = new DataView(b.buffer, b.byteOffset + at), nv = dv.getUint32(0, true), ni = dv.getUint32(4, true), flags = dv.getUint32(8, true);
  const vb = nv * (24 + (flags & 1 ? 8 : 0) + (flags & 2 ? 4 : 0));
  if (nv === 0 || nv > 65535 || ni % 3 || at + 24 + vb + ni * 2 > n) return -1;
  const f32 = (o, k) => { const r = new Float32Array(k); for (let i = 0; i < k; i++) r[i] = dv.getFloat32(24 + o + i * 4, true); return r; };
  let o = 0;
  const pos = f32(o, nv * 3); o += 12 * nv;
  const nrm = f32(o, nv * 3); o += 12 * nv;
  const uv = flags & 1 ? f32(o, nv * 2) : null; if (uv) o += 8 * nv;
  let col = null;
  if (flags & 2) { col = new Uint32Array(nv); for (let i = 0; i < nv; i++) col[i] = dv.getUint32(24 + o + i * 4, true); o += 4 * nv; }
  const ix = new Uint16Array(ni);
  for (let i = 0; i < ni; i++) { ix[i] = dv.getUint16(24 + o + i * 2, true); if (ix[i] >= nv) return -1; }
  return upload(pos, nrm, uv, col, ix, nv);
}

function meshDestroy(id) {
  const g = meshes[id];
  if (!g) return;
  gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vbo); gl.deleteBuffer(g.ibo);
  meshes[id] = null;
}
function meshDeform(id, pos, nrm) {
  const g = meshes[id];
  if (!g || pos.length !== g.nv * 3 || nrm.length !== g.nv * 3) return false;
  for (let i = 0; i < g.nv * 3; i++) if (!Number.isFinite(pos[i]) || !Number.isFinite(nrm[i])) return false;
  for (let i = 0; i < g.nv; i++) for (let j = 0; j < 3; j++) { g.f[i * 9 + j] = pos[i * 3 + j]; g.f[i * 9 + 3 + j] = nrm[i * 3 + j]; }
  gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, g.f);
  return true;
}

function release(t) {
  gl.deleteFramebuffer(t.fbo); gl.deleteRenderbuffer(t.color); gl.deleteRenderbuffer(t.depth);
  if (cur === t) cur = null;
}
function target(id, w, h) {
  ctx();
  const k = Math.min(2, globalThis.devicePixelRatio || 1);   // the page's pixels (gfx answers pixelScale() 1 on the web), at most 2
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  let t = targets[id];
  if (t && t.w === w && t.h === h) return id;
  if (t) release(t); else { t = { out: document.createElement('canvas') }; id = add(targets, t); }
  t.w = w; t.h = h; t.out.width = w; t.out.height = h;
  t.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
  const rb = (fmt) => { const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h); return r; };
  t.color = rb(gl.RGBA8); t.depth = rb(gl.DEPTH_COMPONENT24);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, t.color);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depth);
  return id;
}
function targetDestroy(id) { const t = targets[id]; if (t) { release(t); targets[id] = null; } }

function mul(o, a, b) {   // column-major o = a * b
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
}
const mat = (m) => { const o = new Float32Array(16); for (let i = 0; i < 16; i++) o[i] = i < m.length ? m[i] : i % 5 === 0 ? 1 : 0; return o; };

function begin(id, clear, view, proj, near, far, ortho) {
  cur = targets[id] || null;
  if (!cur) return;
  tris = 0; nl = 0; amb[0] = amb[1] = amb[2] = 0; ld.fill(0); lc.fill(0);
  frame++;
  gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fbo);
  gl.viewport(0, 0, cur.w, cur.h);
  if (blendOn > 0) { gl.disable(gl.BLEND); gl.depthMask(true); gl.colorMask(true, true, true, true); }
  gl.clearColor((clear >> 16 & 255) / 255, (clear >> 8 & 255) / 255, (clear & 255) / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const P = new Float32Array(16), V = mat(view), asp = cur.w / cur.h;
  if (ortho) { P[0] = 2 / (proj * asp); P[5] = 2 / proj; P[10] = -2 / (far - near); P[14] = -(far + near) / (far - near); P[15] = 1; }
  else { const k = 1 / Math.tan(proj * 0.5); P[0] = k / asp; P[5] = k; P[10] = (far + near) / (near - far); P[11] = -1; P[14] = 2 * far * near / (near - far); }
  mul(vp, P, V);
  for (let i = 0; i < 3; i++) eye[i] = -(V[i * 4] * V[12] + V[i * 4 + 1] * V[13] + V[i * 4 + 2] * V[14]);
  spec[0] = spec[1] = spec[2] = 0; emit[0] = emit[1] = emit[2] = 0; fogOn = false;
  blendOn = -1;
}

function texture(id, f) {   // a gfx image as a texture, uploaded again when its canvas changed
  const c = Z.images.canvas(id);
  if (!c || !c.width || !c.height) return false;
  const key = Z.images.rev(id) + ':' + c.width + 'x' + c.height;
  let t = texs.get(id);
  if (!t) {
    t = { id: gl.createTexture(), key: '', filter: 0, mips: false };
    texs.set(id, t);
    gl.bindTexture(gl.TEXTURE_2D, t.id);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  } else gl.bindTexture(gl.TEXTURE_2D, t.id);
  if (t.key !== key) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    t.key = key; t.mips = false; t.filter = 0;
  }
  if (f === 3 && !t.mips) { gl.generateMipmap(gl.TEXTURE_2D); t.mips = true; }
  if (t.filter !== f) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f === 1 ? gl.NEAREST : f === 2 ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f === 1 ? gl.NEAREST : gl.LINEAR);
    t.filter = f;
  }
  return true;
}

function draw(id, model, color, tex, flags) {
  const g = meshes[id];
  if (!g || !cur) return;
  M.set(mat(model)); mul(MVP, vp, M);
  const f = (flags >> 4) & 3, bl = (flags >> 6) & 3;
  gl.activeTexture(gl.TEXTURE0);
  const textured = tex >= 0 && g.uv && texture(tex, f || filter);
  const specOn = spec[0] > 0 || spec[1] > 0 || spec[2] > 0, emitOn = emit[0] > 0 || emit[1] > 0 || emit[2] > 0;
  const k = (flags & UNLIT ? 0 : P_LIT | (specOn ? P_SPEC : 0)) | (flags & FLAT ? P_FLAT : 0) | (textured ? P_TEX : 0) | ((flags & VCOL) && g.col ? P_VCOL : 0) |
    (emitOn ? P_EMIT : 0) | (bl === ALPHA || bl === ADD ? P_BLEND : 0) | (fogOn && !(flags & NOFOG) ? P_FOG : 0);
  const p = program(k);
  if (!p.id) return;
  if (used !== p.id) { gl.useProgram(p.id); used = p.id; }
  if (p.frame !== frame && (k & P_LIT)) { gl.uniform3fv(p.amb, amb); gl.uniform3fv(p.ld, ld); gl.uniform3fv(p.lc, lc); if (k & P_SPEC) gl.uniform3fv(p.eye, eye); p.frame = frame; }
  if (k & P_SPEC) { gl.uniform3fv(p.spec, spec); gl.uniform1f(p.shin, shin); gl.uniform3fv(p.eye, eye); }
  gl.uniformMatrix4fv(p.mvp, false, MVP); gl.uniformMatrix4fv(p.model, false, M);
  gl.uniform3fv(p.color, rgb(color));
  if (k & P_EMIT) gl.uniform3f(p.emit, emit[0] / 255, emit[1] / 255, emit[2] / 255);
  if (bl !== blendOn) {
    if (bl === ALPHA || bl === ADD) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, bl === ADD ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.colorMask(true, true, true, false); }
    else { gl.disable(gl.BLEND); gl.depthMask(true); gl.colorMask(true, true, true, true); }
    blendOn = bl;
  }
  if (k & P_FOG) { gl.uniform3f(p.fogc, fogC[0] / 255, fogC[1] / 255, fogC[2] / 255); gl.uniform2f(p.fog, fogN, fogF); }
  if (k & P_BLEND) gl.uniform1f(p.alpha, ((flags >> 8) & 255) / 255);
  const c = flags & DOUBLE ? 0 : 1;
  if (c !== cull) { if (c) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE); cull = c; }
  gl.bindVertexArray(g.vao);
  gl.drawElements(gl.TRIANGLES, g.ni, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
  tris += g.ni / 3;
}

function end() {
  const t = cur;
  if (!t) return 0;
  cur = null;
  if (cv.width !== t.w || cv.height !== t.h) { cv.width = t.w; cv.height = t.h; }
  // resolved into the canvas, same size: an RGBA canvas, as a multisampled blit needs the same format on both sides (alpha stays 1: blended draws leave it)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const g = t.out.getContext('2d');
  g.drawImage(cv, 0, 0);   // in the same task as the draw: the drawing buffer is still there
  return tris;
}

Z.registerNative('Render3D', {
  meshCreate, meshLoad, meshDestroy, meshDeform,
  assetOpen: () => -1, assetByte: () => 0, assetMesh: () => -1, assetClose() {},
  target, targetDestroy, begin,
  ambient(c) { amb[0] = (c >> 16 & 255) / 255; amb[1] = (c >> 8 & 255) / 255; amb[2] = (c & 255) / 255; },
  light(dx, dy, dz, c) {
    const l = Math.hypot(dx, dy, dz);
    if (nl >= 4 || !(l > 0)) return;
    ld[nl * 3] = dx / l; ld[nl * 3 + 1] = dy / l; ld[nl * 3 + 2] = dz / l;
    lc.set(rgb(c), nl * 3); nl++;
  },
  specular(c, s) { spec.splice(0, 3, ...rgb(c)); shin = s >= 1 ? Math.min(s, 2048) : 1; },
  emissive(c) { emit[0] = c >> 16 & 255; emit[1] = c >> 8 & 255; emit[2] = c & 255; },
  fog(c, near, far) { fogC[0] = c >> 16 & 255; fogC[1] = c >> 8 & 255; fogC[2] = c & 255; fogN = near; fogF = far > near ? far : near + 1e-3; fogOn = true; },
  draw,
  transform(world, parent, p, q, s) {   // world = parent x T(p) x R(q) x S(s), column major (render3d.host.cpp)
    if (world.length < 16 || parent.length < 16 || p.length < 3 || q.length < 4 || s.length < 3) return;
    const [x, y, z, w] = q, [sx, sy, sz] = s;
    const L = [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, p[0], p[1], p[2], 1];
    const P = parent.slice(0, 16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) world[c * 4 + r] = P[r] * L[c * 4] + P[4 + r] * L[c * 4 + 1] + P[8 + r] * L[c * 4 + 2] + P[12 + r] * L[c * 4 + 3];
  },
  gpu: () => true,
  end,
  present(id, x, y, w, h) { const t = targets[id]; if (t) Z.paint.element(t.out, x, y, w, h, { fit: 'cover' }); },
  worldOpen: () => -1, worldChunkCount: () => 0, worldClose() {}, worldLoad: () => -1, worldFree() {}, worldNight() {}, worldShadows() {},
  worldSelect(world, view, eyes, prm, out) { for (let i = 0; i < out.length; i++) out[i] = 0; }, worldDraw() {},
}, ['webgl2']);
