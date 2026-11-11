// The interpreter and the program in a worker (ZN-135): zinc:gfx draws on an OffscreenCanvas, the page's frame ticks and input arrive in a SharedArrayBuffer (Int32Array):
// [0] frame tick counter, [1] pointer x * 16, [2] pointer y * 16, [3] pointer down, [4] button bit mask (Btn: Up Down Left Right A B X Y L R Start Select), [5] quit.
// SharedArrayBuffer needs cross-origin isolation (COOP/COEP). The fallback frame loop blocks in gfxPoll (Atomics.wait) until the next tick.
// With JSPI (D242, ZN-774.30), zn.gfx is a WebAssembly.Suspending import: gfxPoll resolves on the next animation frame,
// asset loads and image decoding resolve when ready, and zn_run is called through WebAssembly.promising; the page posts the input
// ({ input: { x, y, down, bits } }, { quit: true }) as messages, which arrive while the program waits. `frames` stops the program after n frames.
// No cross-origin isolation then; Chrome and Edge 137+ (WebAssembly.Suspending).
import { wasiImports } from './wasi.mjs';
import { BrowserAssets, Group, Request } from './assets.mjs';
import { TextureDecoder } from './transcoder.mjs';
import { NativeABI, NativeRPC } from './native.mjs';
const nativeRPC = new NativeRPC(message => self.postMessage(message));

const ARG = 24;   // sizeof(HostArg): double d @0, int64 i @8, void* p @16, uint32 n @20
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

// ZRS1 is shared with src/host/resources.cpp: glyph records are 28 bytes on disk, then coverage; images are RGBA.
// Browser exports keep the fonts here and deliver images through asset packs; custom resource blobs may contain both.
function bakedResources(buf) {
  const fonts = [], images = [];
  if (!buf) return { fonts, images };
  const v = new DataView(buf); let p = 0;
  const take = n => { if (!Number.isSafeInteger(n) || n < 0 || n > buf.byteLength - p) throw new Error('truncated ZRS1 resource'); const b = new Uint8Array(buf, p, n); p += n; return b; };
  const u32 = () => { const b = take(4); return new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true); };
  const str = () => new TextDecoder().decode(take(u32()));
  const count = max => { const n = u32(); if (n > max) throw new Error('invalid ZRS1 count'); return n; };
  if (new TextDecoder().decode(take(4)) !== 'ZRS1') throw new Error('invalid ZRS1 resource');
  for (let n = count(512); n > 0; n--) {
    const f = { name: str(), px: u32(), ascent: u32() | 0, descent: u32() | 0, lineGap: u32() | 0, glyphs: new Map() };
    const ng = count(Math.floor((buf.byteLength - p) / 28));
    for (let j = 0; j < ng; j++) {
      const g = { cp: u32(), x: u32() << 16 >> 16, y: u32() << 16 >> 16, w: u32() & 65535, h: u32() & 65535, adv: u32() | 0, off: u32() };
      f.glyphs.set(g.cp, g);
    }
    f.bitmap = take(u32());
    for (const g of f.glyphs.values()) if (g.off > f.bitmap.length || g.w * g.h > f.bitmap.length - g.off) throw new Error('invalid ZRS1 glyph');
    fonts.push(f);
  }
  for (let n = count(128); n > 0; n--) {
    const name = str(), w = u32(), h = u32(), k = Math.max(1, u32()), pixels = take(w * h * 4);
    if (w > 16384 || h > 16384 || w * h > 16777216) throw new Error('invalid ZRS1 image');
    const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    if (w && h) c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0);
    images.push({ name, canvas: c, k, w: Math.trunc((w + (k >> 1)) / k), h: Math.trunc((h + (k >> 1)) / k) });
  }
  for (let n = count(16); n > 0; n--) { str(); take(u32()); }
  return { fonts, images };
}
function bakedFont(fonts, name, px) {
  px = !(px >= 1) ? 1 : Math.min(512, Math.trunc(px + 0.5));
  let f = fonts.findIndex(f => f.name === name && f.px === px);
  if (f >= 0) return f;
  const stem = name.replace(/(?:~[it])+$/, ''), marks = name.slice(stem.length);
  const normalized = stem.slice(stem.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '') + marks;
  f = fonts.findIndex(f => f.name === normalized && f.px === px);
  if (f >= 0) return f;
  let distance = Infinity;
  fonts.forEach((font, i) => { if (font.name === normalized && Math.abs(font.px - px) < distance) { distance = Math.abs(font.px - px); f = i; } });
  return f;
}
// shortcut: baked glyphs only; runtime font sizes and missing glyphs need the native TTF/shaping exports.
function textGlyphs(f, text, tracking, draw = () => {}) {
  if (!f) return 0;
  let pen = 0;
  const track = Math.trunc(Math.fround(Math.fround(tracking) * 64));
  for (const c of text) {
    const cp = c.codePointAt(0);
    const g = f.glyphs.get(cp) || (/^[\u00ad\u034f\u061c\u115f-\u1160\u17b4-\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]$/u.test(c) ? null : f.glyphs.get(63));
    if (g) { draw(g, pen); pen += g.adv + track; }
  }
  return pen / 64;
}

function drawBakedText(ctx, font, x, y, text, color, alpha, tracking) {
  const f = font;
  if (!f) return;
  ctx.save(); ctx.globalAlpha = Math.min(255, Math.max(0, alpha)) / 255;
  textGlyphs(f, text, tracking, (g, pen) => {
    if (!g.w || !g.h) return;
    const key = color >>> 0;
    if (g.color !== key) {
      g.canvas = new OffscreenCanvas(g.w, g.h); g.color = key;
      const pixels = new Uint8ClampedArray(g.w * g.h * 4);
      for (let j = 0; j < g.w * g.h; j++) { pixels[j * 4] = key >> 16 & 255; pixels[j * 4 + 1] = key >> 8 & 255; pixels[j * 4 + 2] = key & 255; pixels[j * 4 + 3] = f.bitmap[g.off + j]; }
      g.canvas.getContext('2d').putImageData(new ImageData(pixels, g.w, g.h), 0, 0);
    }
    ctx.drawImage(g.canvas, Math.floor((Math.floor(x * 64) + pen + 32) / 64) + g.x, Math.floor(y + 0.5) + f.ascent + g.y);
  });
  ctx.restore();
}


// The input of the JSPI path, written by the page's messages: [0] unused, then the same slots as the SharedArrayBuffer
const input = new Int32Array(6);
let started = false;
self.onmessage = async (e) => {
  if (e.data.nativeReply) { nativeRPC.reply(e.data.nativeReply); return; }
  if (started) { const m = e.data; if (m.input) { input[1] = m.input.x * 16; input[2] = m.input.y * 16; input[3] = m.input.down; input[4] = m.input.bits; } if (m.quit) input[5] = 1; return; }
  started = true;
  try { await start(e); } catch (err) { nativeRPC.close(); self.postMessage({ error: String(err && err.stack || err) }); }
};
async function start(e) {
  const { wasm, zbc, res, canvas, sab, manifest, natives = [], base = new URL('.', self.location.href).href, frames: maxFrames = 0 } = e.data;
  const jspi = typeof WebAssembly.Suspending === 'function' || !sab || !!manifest?.packs?.length;
  if (jspi && typeof WebAssembly.Suspending !== 'function') throw new Error('wasm images and asset packs need WebAssembly JSPI (Chrome/Edge 137 or newer)');
  const { fonts, images } = bakedResources(res);
  const textures = new TextureDecoder(new URL('ktx2.wasm', base).href);
  let ctx = canvas.getContext('2d');
  let W = canvas.width, H = canvas.height;
  const page = { ctx, w: W, h: H };
  const Target = Object.freeze({ Page: 0, Image: 1 });
  let target = Target.Page, targetId = -1, clipDepth = 0;
  const transform = { matrix: null, tx: 0, ty: 0 };
  let clips = [];
  function applyTransform() {
    const m = transform.matrix || [1, 0, 0, 1, 0, 0];
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4] + m[0] * transform.tx + m[2] * transform.ty, m[5] + m[1] * transform.tx + m[3] * transform.ty);
  }
  function applyClip(c) {
    ctx.save(); ctx.resetTransform(); ctx.beginPath(); ctx.roundRect(...c); ctx.clip(); applyTransform();
  }
  function clipBox(a) {
    const m = transform.matrix;
    if (!m) return [a[0] + transform.tx, a[1] + transform.ty, a[2], a[3], Math.max(0, a[4])];
    const points = [[a[0], a[1]], [a[0] + a[2], a[1]], [a[0], a[1] + a[3]], [a[0] + a[2], a[1] + a[3]]].map(([x,y]) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]);
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys), 0];
  }
  const sizeOK = (w, h) => Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 16384 && h <= 16384 && w * h <= 16777216;
  function newImage(w, h) {
    if (!sizeOK(w, h) || images.length >= 0x7fffffff) return -1;
    try {
      const c = new OffscreenCanvas(w, h), id = images.length;
      images.push({ canvas: c, k: 1, w, h, dynamic: true }); return id;
    } catch { return -1; }
  }
  function updateImage(id, bytes) {
    const im = images[id];
    if (!im?.dynamic || bytes.length < im.w * im.h * 4) return;
    im.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(bytes.slice(0, im.w * im.h * 4)), im.w, im.h), 0, 0);
  }
  function switchTarget(next, id = -1) {
    if (next === Target.Image) {
      const im = images[id];
      if (target !== Target.Page || !im?.dynamic) return;
      page.clipDepth = clipDepth; clipDepth = 0; page.clips = clips; clips = [];
      const transform = ctx.getTransform();
      target = next; targetId = id; ctx = im.canvas.getContext('2d'); W = im.w; H = im.h; ctx.save(); ctx.setTransform(transform);
    } else {
      if (target !== Target.Image) return;
      while (clipDepth > 0) { ctx.restore(); clipDepth--; }
      ctx.restore();
      clipDepth = page.clipDepth || 0; clips = page.clips || []; target = next; targetId = -1; ctx = page.ctx; W = page.w; H = page.h; applyTransform();
    }
  }
  async function decodeImage(bytes) {
    if (!jspi || !bytes.length || bytes.length > 67108864) return -1;
    const p = ex.zn_alloc(bytes.length);
    if (!p) return -1;
    try {
      new Uint8Array(memory.buffer, p, bytes.length).set(bytes);
      if (!ex.zn_image_size_ok(p, bytes.length)) return -1;
    } finally { ex.zn_free(p); }
    let bitmap, id = -1;
    try {
      bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'none' });
      id = newImage(bitmap.width, bitmap.height);
      if (id >= 0) images[id].canvas.getContext('2d').drawImage(bitmap, 0, 0);
      return id;
    } catch { if (id >= 0) images[id] = null; return -1; }
    finally { bitmap?.close(); }
  }
  const shared = sab ? new Int32Array(sab) : input;
  const nextFrame = () => new Promise((r) => (self.requestAnimationFrame ? self.requestAnimationFrame(() => r()) : setTimeout(r, 16)));
  const module = wasm instanceof WebAssembly.Module ? wasm : await WebAssembly.compile(wasm);
  let memory, assets, returnBuffer = 0, fsBytes = new Uint8Array(), fsError = '', fsFailure = false, listed = [];
  let lastTick = 0, prevBits = 0, frames = 0, ex;
  const dv = () => new DataView(memory.buffer);
  const cstr = (p) => { const b = new Uint8Array(memory.buffer); let q = p; while (b[q]) q++; return new TextDecoder().decode(b.subarray(p, q)); };
  const rows = [];   // id -> { name, params, ret }
  const row = (id) => rows[id] || (rows[id] = (() => { const sig = cstr(ex.zn_row_sig(id)); const [p, r] = sig.split('>'); return { name: cstr(ex.zn_row_name(id)), params: p, ret: r }; })());
  const warned = new Set();

  function gfx(id, argsPtr, resPtr) {
    if (returnBuffer) { ex.zn_free(returnBuffer); returnBuffer = 0; }
    const { name, params, ret } = row(id);
    const v = dv(), a = [];
    for (let k = 0; k < params.length; k++) {
      const base = argsPtr + k * ARG, c = params[k];
      if (c === 'd') a.push(v.getFloat64(base, true));
      else if (c === 's') { const p = v.getUint32(base + 16, true), n = v.getUint32(base + 20, true); a.push(new TextDecoder().decode(new Uint8Array(memory.buffer, p, n))); }
      else if (c === 'D') { const p = v.getUint32(base + 16, true), n = v.getUint32(base + 20, true); a.push(new Float64Array(memory.buffer.slice(p, p + n * 8))); }
      else if (c === 'B' || c === 'U') {
        const p = v.getUint32(base + 16, true), n = v.getUint32(base + 20, true);
        if (p > memory.buffer.byteLength || n > Math.floor((memory.buffer.byteLength - p) / 8) || n > (c === 'B' ? 67108864 : 16777216)) throw new Error('invalid host array');
        const values = c === 'B' ? new Uint8Array(n) : new Uint32Array(n);
        for (let j = 0; j < n; j++) values[j] = v.getUint32(p + j * 8, true);
        a.push(values);
      }
      else if (c === 'u') a.push(Number(v.getBigInt64(base + 8, true)) >>> 0);
      else a.push(Number(v.getBigInt64(base + 8, true)));
    }
    let out = 0;
    const result = () => {
      const rv = dv();
      if (ret === 'd') rv.setFloat64(resPtr, out, true);
      else if (ret === 'i' || ret === 'b') rv.setBigInt64(resPtr + 8, BigInt(Math.trunc(out)), true);
      else if (ret === 's' || ret === 'B') {
        const bytes = ret === 's' ? new TextEncoder().encode(out || '') : out;
        const p = bytes.byteLength ? (returnBuffer = ex.zn_alloc(bytes.byteLength)) : ex.zn_scratch();
        new Uint8Array(memory.buffer, p, bytes.byteLength).set(bytes);
        dv().setUint32(resPtr + 16, p, true); dv().setUint32(resPtr + 20, bytes.byteLength, true);
      }
    };
    const later = (promise) => promise.then(value => { out = value; result(); }).catch(error => { fsError = String(error.message || error); fsFailure = true; out = ret === 's' ? '' : ret === 'B' ? new Uint8Array() : -1; result(); });
    const imageId = async (entry) => {
      if (!entry || entry.kind !== 1) return -1;
      let id = images.findIndex(i => i?.name === entry.name);
      if (id >= 0) return id;
      if (!entry.pixels) {
        const owner = assets.names.get(entry.name).group, generation = owner.generation;
        const decoded = await textures.decode(entry.bytes);
        if (owner.generation !== generation) return -1;   // an unload must not resurrect an image after the decoder arrives
        assets.checkBudget(decoded.pixels.length); Object.assign(entry, decoded); assets.measure();
      }
      const c = new OffscreenCanvas(entry.w, entry.h);
      c.getContext('2d').putImageData(new ImageData(entry.pixels, entry.w, entry.h), 0, 0);
      id = images.length; images.push({ name: entry.name, canvas: c, k: entry.scale, w: Math.round(entry.w / entry.scale), h: Math.round(entry.h / entry.scale) });
      return id;
    };
    switch (name) {
      case 'host.gfxFrames': out = 2147483647; break;
      case 'host.gfxBegin': if (target === Target.Image) switchTarget(Target.Page); while (clipDepth > 0) { ctx.restore(); clipDepth--; } clips = []; transform.matrix = null; transform.tx = transform.ty = 0; applyTransform(); break;
      case 'host.gfxEnd': case 'host.gfxFinish': case 'host.gfxKeep': case 'host.gfxProfMark': case 'host.gfxSetCursor': break;
      case 'host.gfxClear': { while (clipDepth > 0) { ctx.restore(); clipDepth--; } ctx.save(); ctx.resetTransform(); ctx.globalAlpha = 1; ctx.fillStyle = hex(a[0]); ctx.fillRect(0, 0, W, H); ctx.restore(); for (const c of clips) { applyClip(c); clipDepth++; } applyTransform(); break; }
      case 'host.gfxTranslate': transform.tx = a[0]; transform.ty = a[1]; applyTransform(); break;
      case 'host.gfxSetTransform': transform.matrix = a.slice(0, 6); applyTransform(); break;
      case 'host.gfxResetTransform': transform.matrix = null; applyTransform(); break;
      case 'host.gfxClip': if (clipDepth < 16) { const c = clipBox(a); clips.push(c); applyClip(c); clipDepth++; } break;
      case 'host.gfxUnclip': if (clipDepth > 0) { ctx.restore(); clips.pop(); clipDepth--; applyTransform(); } break;
      case 'host.gfxCreateImage': out = newImage(a[0], a[1]); break;
      case 'host.gfxDestroyImage': if (images[a[0]]?.dynamic) { if (targetId === a[0]) switchTarget(Target.Page); images[a[0]] = null; } break;
      case 'host.gfxImageFromBytes': return later(decodeImage(a[0]));
      case 'host.gfxImageFromPixels': out = a[0].length >= a[1] * a[2] * 4 ? newImage(a[1], a[2]) : -1; updateImage(out, a[0]); break;
      case 'host.gfxUpdateImage': updateImage(a[0], a[1]); break;
      case 'host.gfxUpdatePixels': {
        const bytes = new Uint8Array(a[1].length * 4), packed = new DataView(bytes.buffer);
        for (let j = 0; j < a[1].length; j++) packed.setUint32(j * 4, a[1][j] | (a[2] ? 0xff000000 : 0), true);
        updateImage(a[0], bytes); break;
      }
      case 'host.gfxBeginImage': switchTarget(Target.Image, a[0]); break;
      case 'host.gfxEndImage': switchTarget(Target.Page); break;
      case 'host.gfxImageAlpha': break;
      case 'host.gfxClearImage': { const im = images[a[0]]; if (im?.dynamic) { const c = im.canvas.getContext('2d'); c.save(); c.resetTransform(); c.clearRect(0, 0, im.w, im.h); c.restore(); } break; }
      case 'host.gfxRect': ctx.globalAlpha = 1; ctx.fillStyle = hex(a[4]); ctx.fillRect(a[0], a[1], a[2], a[3]); break;
      case 'host.gfxRRect': ctx.globalAlpha = a[6] / 255; ctx.fillStyle = hex(a[5]); ctx.beginPath(); ctx.roundRect(a[0], a[1], a[2], a[3], a[4]); ctx.fill(); ctx.globalAlpha = 1; break;
      case 'host.gfxGradient': {
        ctx.save(); ctx.globalAlpha = Math.min(255, Math.max(0, a[8])) / 255;
        const gradient = ctx.createLinearGradient(a[0], a[1], a[0] + (a[7] ? 0 : a[2]), a[1] + (a[7] ? a[3] : 0));
        gradient.addColorStop(0, hex(a[5])); gradient.addColorStop(1, hex(a[6])); ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.roundRect(a[0], a[1], a[2], a[3], Math.max(0, a[4])); ctx.fill(); ctx.restore(); break;
      }
      case 'host.gfxLine': ctx.globalAlpha = 1; ctx.strokeStyle = hex(a[4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.stroke(); break;
      case 'host.gfxText': drawBakedText(ctx, fonts[bakedFont(fonts, 'grid', 8 * Math.max(1, a[4]))], a[0], a[1], a[2], a[3], 255, 0); break;
      case 'host.gfxFont': out = bakedFont(fonts, a[0], a[1]); break;
      case 'host.gfxFontAscent': out = fonts[a[0]]?.ascent || 0; break;
      case 'host.gfxLineHeight': out = fonts[a[0]] ? fonts[a[0]].ascent + fonts[a[0]].descent + fonts[a[0]].lineGap : 0; break;
      case 'host.gfxTextWidth': out = textGlyphs(fonts[a[0]], a[1], a[2]); break;
      case 'host.gfxDrawText': drawBakedText(ctx, fonts[a[0]], ...a.slice(1)); break;
      case 'host.gfxImage': {
        out = images.findIndex(i => i?.name === a[0]);
        if (out < 0 && assets) return later(assets.ensure(a[0]).then(imageId));
        break;
      }
      case 'host.assetsExists': out = assets?.names.has(a[0]) ? 1 : 0; break;
      case 'host.assetsReadText': return later(assets ? assets.ensure(manifest.originals?.[a[0]] || a[0]).then(e => { if (!e || e.kind !== 0) throw new Error('no data asset ' + a[0]); fsError = ''; return new TextDecoder().decode(e.bytes); }) : Promise.resolve(''));
      case 'host.assetsLoad': return later(assets ? assets.ensure(manifest.originals?.[a[0]] || a[0]).then(e => { if (!e || e.kind !== 0) throw new Error('no data asset ' + a[0]); fsBytes = e.bytes; fsError = ''; return fsBytes.length; }) : Promise.resolve(0));
      case 'host.assetsCount': listed = assets ? [...assets.names].filter(([n, e]) => e.kind === 0 && !Object.values(manifest.originals || {}).includes(n)).map(([n]) => n).concat(Object.keys(manifest.originals || {})).sort() : []; out = listed.length; break;
      case 'host.assetsName': out = listed[a[0]] || ''; break;
      case 'host.assetsGroupsCount': listed = assets ? [...assets.groups.keys()].sort() : []; out = listed.length; break;
      case 'host.assetsLoadGroup': try { out = assets?.load(a[0]) || 0; fsError = ''; } catch (error) { fsError = String(error.message); fsFailure = true; out = 0; } break;
      case 'host.assetsGroupState': { const state = assets?.groups.get(a[0])?.state; out = state === Group.Loaded ? 2 : state === Group.Loading ? 1 : 0; break; }
      case 'host.assetsUnloadGroup': {
        assets?.unload(a[0]);
        for (let i = 0; i < images.length; i++) if (images[i] && assets?.names.get(images[i].name)?.group.group === a[0]) images[i] = null;
        break;
      }
      case 'host.assetsTurn': if (jspi) return later(new Promise(r => setTimeout(() => r(0), 0))); break;
      case 'host.assetsReqState': out = assets?.requests.get(a[0])?.state ?? Request.Failed; break;
      case 'host.assetsReqDone': out = assets?.requests.get(a[0])?.done || 0; break;
      case 'host.assetsReqTotal': out = assets?.requests.get(a[0])?.total || 0; break;
      case 'host.assetsReqError': out = assets?.requests.get(a[0])?.error ?? 'unknown asset request'; break;
      case 'host.assetsReqForget': assets?.forget(a[0]); break;
      case 'host.assetsAcquire': try { out = assets?.acquire(a[0]) || 0; fsError = ''; } catch (error) { fsError = String(error.message); fsFailure = true; } break;
      case 'host.assetsRelease': assets?.handles.delete(a[0]); break;
      case 'host.assetsHandleText': out = new TextDecoder().decode(assets?.handles.get(a[0])?.bytes || new Uint8Array()); break;
      case 'host.assetsHandleLoad': fsBytes = assets?.handles.get(a[0])?.bytes || new Uint8Array(); out = fsBytes.length; break;
      case 'host.assetsStat': {
        if (a[0] === 2) out = assets?.budget || 0;
        else if (a[0] === 3) out = [...(assets?.groups.values() || [])].filter(g => g.state === Group.Loaded).length;
        else if (a[0] === 4) out = assets?.groups.size || 0;
        else if (a[0] === 5) out = [...(assets?.groups.values() || [])].filter(g => g.state === Group.Loading).length;
        else if (a[0] === 0) out = assets?.measure() || 0;
        else if (a[0] === 1) out = assets?.peak || 0;
        break;
      }
      case 'host.assetsMount': case 'host.assetsUnmount': fsError = 'browser asset mounts are declared in boot.json'; fsFailure = true; out = 0; break;
      case 'host.fsFailed': out = fsFailure ? 1 : 0; fsFailure = false; break;
      case 'host.fsError': out = fsError; break;
      case 'host.fsByte': out = fsBytes[a[0]] || 0; break;
      case 'host.fsBytes': out = fsBytes; break;
      case 'host.gfxImageWidth': out = images[a[0]] ? images[a[0]].w : 0; break;
      case 'host.gfxImageHeight': out = images[a[0]] ? images[a[0]].h : 0; break;
      case 'host.gfxDrawImage': {   // image, x, y, w, h, alpha, radius
        const im = images[a[0]];
        if (!im || !(a[3] > 0 && a[4] > 0)) break;
        ctx.save(); ctx.globalAlpha = Math.min(255, Math.max(0, a[5])) / 255; ctx.imageSmoothingEnabled = true;
        if (a[6] > 0) { ctx.beginPath(); ctx.roundRect(a[1], a[2], a[3], a[4], a[6]); ctx.clip(); }
        ctx.drawImage(im.canvas, a[1], a[2], a[3], a[4]);
        ctx.restore(); break;
      }
      case 'host.gfxDrawImageRect': {   // image, the source rectangle (x, y, w, h in the pixels of imageWidth), the destination one, alpha, flags: 1 mirror x, 2 mirror y, 4 nearest
        const im = images[a[0]], f = a[10];
        if (!im || !(a[3] > 0 && a[4] > 0 && a[7] > 0 && a[8] > 0)) break;
        ctx.save(); ctx.globalAlpha = Math.min(255, Math.max(0, a[9])) / 255; ctx.imageSmoothingEnabled = !(f & 4);
        ctx.translate(a[5] + (f & 1 ? a[7] : 0), a[6] + (f & 2 ? a[8] : 0)); ctx.scale(f & 1 ? -1 : 1, f & 2 ? -1 : 1);
        ctx.drawImage(im.canvas, a[1] * im.k, a[2] * im.k, a[3] * im.k, a[4] * im.k, 0, 0, a[7], a[8]);   // the canvas cuts a source rectangle at the image's edges, as the raster does
        ctx.restore(); break;
      }
      case 'host.gfxWidth': out = W; break;
      case 'host.gfxHeight': out = H; break;
      case 'host.gfxPixelScale': out = 1; break;
      case 'host.gfxProfiling': out = 0; break;
      case 'host.gfxPoll': {   // the frame loop: wait for the page's next tick (JSPI: the next animation frame), then the input of this frame
        frames++; if (frames % 10 === 0) self.postMessage({ frames });
        if (maxFrames && frames >= maxFrames) shared[5] = 1;
        if (jspi) { return nextFrame().then(() => { prevBits = this_bits; this_bits = shared[4]; out = 1 / 60; result(); }); }
        Atomics.wait(shared, 0, lastTick, 200);
        lastTick = Atomics.load(shared, 0);
        prevBits = this_bits; this_bits = Atomics.load(shared, 4);
        out = 1 / 60; break;
      }
      case 'host.gfxShouldQuit': out = Atomics.load(shared, 5); break;
      case 'host.gfxIsDown': out = (this_bits >> a[0]) & 1; break;
      case 'host.gfxWasPressed': out = ((this_bits >> a[0]) & 1) && !((prevBits >> a[0]) & 1) ? 1 : 0; break;
      case 'host.gfxPointerX': out = Atomics.load(shared, 1) / 16; break;
      case 'host.gfxPointerY': out = Atomics.load(shared, 2) / 16; break;
      case 'host.gfxPointerDown': out = Atomics.load(shared, 3); break;
      // queries with nothing to report here (no wheel, touch, key or command queue, never paused) and hints with no effect: 0, silently
      case 'host.gfxPaused': case 'host.gfxIdleDue': case 'host.gfxKeyCount': case 'host.gfxTouchCount': case 'host.gfxWheel': case 'host.gfxWheelX':
      case 'host.gfxScrollDX': case 'host.gfxScrollDY': case 'host.gfxScrollPhase': case 'host.gfxPinch': case 'host.gfxButtonEventCount':
      case 'host.gfxSignalCount': case 'host.gfxModifiers': case 'host.gfxCommands': case 'host.gfxEscapeByApp': case 'host.gfxSetResize': case 'host.gfxCompClock': break;
      case 'host.gfxPointerButtons': out = Atomics.load(shared, 3); break;
      default:
        if (!warned.has(name)) { warned.add(name); console.warn('zinc wasm: ' + name + ' is not available in the browser'); self.postMessage({ missing: name }); }
        out = name === 'host.gfxImageFromBytes' ? -1 : 0;   // no decoder here yet: not an image, rather than image 0
    }
    result();
  }
  let this_bits = 0;

  let nativeABI;
  function nativeCall(module, name, sig, args, ret, err, size) {
    const fail = error => { nativeABI.error(err,size,error); return 2; };
    try {
      const signature = nativeABI.cstr(sig);
      const result = nativeRPC.call(nativeABI.cstr(module),nativeABI.cstr(name),signature,nativeABI.args(signature,args),!jspi);
      const finish = value => { nativeABI.write(signature.split('>')[1],ret,value); return 0; };
      return jspi ? result.then(finish).catch(fail) : finish(result);
    } catch (error) { return fail(error); }
  }
  const imports = {
    wasi_snapshot_preview1: wasiImports(module, () => memory, (fd, text) => { (fd === 2 ? console.error : console.log)(text.replace(/\n$/, '')); self.postMessage({ out: text }); }),
    zn: { gfx: jspi ? new WebAssembly.Suspending(gfx) : gfx, native_call: jspi ? new WebAssembly.Suspending(nativeCall) : nativeCall },
  };
  const inst = await WebAssembly.instantiate(module, imports);
  ex = inst.exports; memory = ex.memory;
  if (ex._initialize) ex._initialize();
  nativeABI = new NativeABI(() => memory,ex);
  ex.zn_native_reset();
  for (const descriptor of natives) {
    const pointers = descriptor.map(value => {
      const bytes = new TextEncoder().encode(value + '\0'), ptr = ex.zn_alloc(bytes.length);
      if (!ptr) throw new Error('browser native descriptor allocation failed');
      new Uint8Array(memory.buffer,ptr,bytes.length).set(bytes); return ptr;
    });
    try { if (ex.zn_native_add(...pointers)) throw new Error('invalid browser native descriptor'); }
    finally { pointers.forEach(ptr=>ex.zn_free(ptr)); }
  }
  if (manifest) assets = new BrowserAssets(manifest, base, (bytes) => {
    const p = ex.zn_alloc(bytes.byteLength);
    if (!p) throw new Error('asset allocation failed');
    try {
      new Uint8Array(memory.buffer, p, bytes.byteLength).set(new Uint8Array(bytes));
      const count = ex.zn_pack_decode(p, bytes.byteLength);
      if (count < 0) throw new Error(cstr(ex.zn_asset_error()));
      const entries = [];
      for (let i = 0; i < count; i++) {
        const e = { name: cstr(ex.zn_pack_name(i)), kind: ex.zn_pack_kind(i), scale: 1, bytes: new Uint8Array(memory.buffer, ex.zn_pack_data(i), ex.zn_pack_size(i)).slice() };
        if (e.kind === 1 && ex.zn_pack_width(i)) { e.w = ex.zn_pack_width(i); e.h = ex.zn_pack_height(i); e.scale = ex.zn_pack_scale(i); e.pixels = new Uint8ClampedArray(memory.buffer, ex.zn_pack_pixels(i), e.w * e.h * 4).slice(); }
        entries.push(e);
      }
      return entries;
    } finally { ex.zn_pack_close(); ex.zn_free(p); }
  }, progress => self.postMessage({ progress }));
  // Only boot/default are eager; every other group starts on loadGroup or its first lookup.
  if (assets) for (const name of ['boot', 'default']) if (assets.groups.has(name)) {
    const id = assets.load(name); await assets.groups.get(name).promise;
    const error = assets.requests.get(id)?.error; assets.forget(id);
    if (error) throw new Error(error);
  }
  const p = ex.zn_alloc(zbc.byteLength);
  new Uint8Array(memory.buffer, p, zbc.byteLength).set(new Uint8Array(zbc));
  self.postMessage({ started: true });
  let rc;
  try { rc = jspi ? await WebAssembly.promising(ex.zn_run)(p, zbc.byteLength) : ex.zn_run(p, zbc.byteLength); } catch (err) { console.error(String(err)); rc = -1; }
  nativeRPC.close();
  self.postMessage({ done: true, rc, frames });
  if (canvas.convertToBlob) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ png: await blob.arrayBuffer() });
  }
}
