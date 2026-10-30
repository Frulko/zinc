// The Zinc web runtime (docs/targets/web.md): the host rows of the QuickJS engine (`__host_*`, the table of include/zn/runtime.h) over the browser,
// so the JavaScript `zinc bundle --profile web` writes runs on the page's own JavaScript engine. zinc:ui, its classic layout and the UI kits are
// that bundle; this file is the canvas (or the DOM, render "dom"), the input, the assets, storage and the frame loop.
// It reads its configuration from <script id="zinc-config" type="application/json"> and starts the app module named there.
// Nothing here knows an app or a plugin: plugins register their browser backends through __zincWeb.registerNative (plugins/<name>/web/).

const CFG = JSON.parse(document.getElementById('zinc-config').textContent);
const G = globalThis;

// ---------------------------------------------------------------- errors, features
/** Thrown by a part of Zinc this browser (or the web target) cannot give: code, what is needed and which browsers have it. */
export class ZnUnsupported extends Error {
  constructor(feature, why) {
    super(`${feature} is not available in this browser${why ? ': ' + why : ''}`);
    this.name = 'ZnUnsupported';
    this.code = 'ZN_UNSUPPORTED';
    this.feature = feature;
  }
}
G.ZnUnsupported = ZnUnsupported;
/** Thrown by exit(): the program ended, nothing to report. */
class ZnExit extends Error { constructor(code) { super('exit ' + code); this.name = 'ZnExit'; this.code = code; } }

const has = (f) => { try { return !!f(); } catch { return false; } };
/** What this browser offers, by the names of docs/targets/web.md (the `web` capability row refined at run time). */
export function detect() {
  const n = typeof navigator === 'undefined' ? {} : navigator;
  const md = n.mediaDevices;
  return {
    canvas2d: has(() => document.createElement('canvas').getContext('2d')),
    webgl2: has(() => document.createElement('canvas').getContext('webgl2')),
    webgpu: has(() => 'gpu' in n),
    offscreenCanvas: has(() => typeof OffscreenCanvas === 'function'),
    getUserMedia: has(() => md && md.getUserMedia),
    audio: has(() => G.AudioContext || G.webkitAudioContext),
    audioWorklet: has(() => G.AudioWorkletNode),
    webrtc: has(() => G.RTCPeerConnection),
    websocket: has(() => G.WebSocket),
    webusb: has(() => 'usb' in n),
    webserial: has(() => 'serial' in n),
    webmidi: has(() => n.requestMIDIAccess),
    webbluetooth: has(() => 'bluetooth' in n),
    webhid: has(() => 'hid' in n),
    fileSystemAccess: has(() => G.showOpenFilePicker),
    clipboard: has(() => n.clipboard && n.clipboard.writeText),
    notifications: has(() => G.Notification),
    gamepad: has(() => n.getGamepads),
    vibrate: has(() => n.vibrate),
    wakeLock: has(() => 'wakeLock' in n),
    share: has(() => n.share),
    serviceWorker: has(() => 'serviceWorker' in n),
    indexedDB: has(() => G.indexedDB),
    wasm: has(() => G.WebAssembly),
    sharedArrayBuffer: has(() => G.SharedArrayBuffer && G.crossOriginIsolated),
    crossOriginIsolated: !!G.crossOriginIsolated,
    secureContext: !!G.isSecureContext,
    touch: has(() => n.maxTouchPoints > 0),
    pen: has(() => G.PointerEvent),
    imageBitmap: has(() => G.createImageBitmap),
    compressionStreams: has(() => G.DecompressionStream),
    fontFaceSet: has(() => document.fonts && G.FontFace),
    batteryStatus: has(() => n.getBattery),
    speechRecognition: has(() => G.SpeechRecognition || G.webkitSpeechRecognition),
    speechSynthesis: has(() => G.speechSynthesis),
    screenCapture: has(() => md && md.getDisplayMedia),
  };
}
const FEATURES = detect();
const registry = Object.create(null);   // the browser backends of the plugins' native sides: name -> object of functions
const Z = (G.__zincWeb = {
  config: CFG, features: FEATURES, detect, ZnUnsupported,
  /** A plugin's browser backend: `registerNative('Camera', { permission(ask) {...}, ... })`, the functions of its native spec. `needs` names features(). */
  registerNative(name, impl, needs = []) {
    registry[name] = { impl, needs };
  },
  /** Throws ZnUnsupported when a feature of features() is missing; plugins call it first. */
  require(feature, why) { if (!FEATURES[feature]) throw new ZnUnsupported(feature, why); },
  nativeOf(name) { return registry[name]; },
  bridge: CFG.bridge ? devBridge(CFG.bridge) : null,
  invalidate() { /* set below */ },
});

// The dev bridge (zinc dev only, docs/targets/web.md): a native side with no browser backend runs on the developer's machine (targets/web/bridge-host.mjs).
// A call is a synchronous request, as a native call is synchronous. The events of that side (callbacks, settled promises) come with each answer and
// from a synchronous drain after a long poll says there are some, so they keep the order that side made them; they run as a task of their own,
// never inside a call, as on the native loop. ponytail: a plugin that gives a freed handle again at once could see an old event reach the new
// owner (the handle is freed there before the page has run the event); zinc:process rotates its handles for that reason.
const pageFetch = G.fetch.bind(G);   // the browser's own fetch: the runtime's requests (assets, wasm, the bridge's poll) never go through the dev bridge
function devBridge({ url, token, natives }) {
  const fns = new Map(), ids = new WeakMap(), pending = new Map();
  let polling = false;
  const enc = (v) => typeof v === 'function' ? { $cb: ids.get(v) ?? (ids.set(v, fns.size + 1), fns.set(fns.size + 1, v), fns.size) }
    : ArrayBuffer.isView(v) ? { $ta: v.constructor.name, d: Array.from(v) } : v;
  const dec = (v) => v && typeof v === 'object' && v.$ta ? new G[v.$ta](v.d) : v;
  function request(method, path, body) {
    const x = new XMLHttpRequest();
    x.open(method, url + path, false);
    x.setRequestHeader('x-zinc-token', token);
    x.send(body);
    return JSON.parse(x.responseText);
  }
  let queued = [];
  function run(evs) {
    if (!evs || !evs.length) return;
    if (!queued.length) setTimeout(flush, 0);
    queued.push(...evs);
  }
  function flush() {
    const evs = queued;
    queued = [];
    for (const ev of evs) {
      if (ev.cb !== undefined) { const f = fns.get(ev.cb); if (f) f(...ev.a.map(dec)); continue; }
      if (ev.ev !== undefined) { Z.hostEvent(...ev.ev); continue; }   // an event of this machine's loop (a fetch done, an OSC message...) for the page's modules
      const p = pending.get(ev.p);
      if (!p) continue;
      pending.delete(ev.p);
      if (ev.e !== undefined) p.reject(new Error(ev.e)); else p.resolve(dec(ev.v));
    }
  }
  async function poll() {
    for (;;) {
      try {
        await pageFetch(url + '/wait', { headers: { 'x-zinc-token': token } });
        run(request('GET', '/drain', null).ev);
      } catch (e) { await new Promise((res) => setTimeout(res, 1000)); }
    }
  }
  return {
    has: (name) => natives.includes(name),
    call(name, k, args) {
      let r;
      try { r = request('POST', '/call', JSON.stringify({ m: name, k, a: args.map(enc) })); } catch (e) { throw new ZnUnsupported('plugin ' + name + '.' + k, 'the dev bridge does not answer (zinc dev stopped?)'); }
      if (r.p !== undefined || fns.size) { if (!polling) { polling = true; poll(); } }
      const settled = r.p === undefined ? null : new Promise((resolve, reject) => pending.set(r.p, { resolve, reject }));
      run(r.ev);
      if (r.e !== undefined) throw new Error(name + '.' + k + ': ' + r.e);
      return settled || dec(r.v);
    },
  };
}

// ---------------------------------------------------------------- environment the bundle expects
// The Generic Sensor API is missing from most browsers (Firefox, Safari, desktop Chrome without a flag): a sensor the browser lacks is built all the
// same and fails as the specification says a sensor with no device does, an `error` event with a NotReadableError after start()
if (!('deviceInfo' in navigator)) Object.defineProperty(navigator, 'deviceInfo', { value: null });   // zinc:web's DeviceInfo | null: a page does not know the machine
if (!G.SensorErrorEvent) G.SensorErrorEvent = class SensorErrorEvent extends Event { constructor(type, init) { super(type); this.error = init.error; } };
for (const name of ['Sensor', 'Accelerometer', 'LinearAccelerationSensor', 'GravitySensor', 'Gyroscope', 'Magnetometer', 'AbsoluteOrientationSensor', 'RelativeOrientationSensor', 'AmbientLightSensor']) {
  if (G[name]) continue;
  G[name] = class extends EventTarget {
    constructor() { super(); this.activated = false; this.hasReading = false; this.timestamp = null; this.onreading = null; this.onerror = null; this.onactivate = null; }
    start() {
      queueMicrotask(() => {
        const e = new G.SensorErrorEvent('error', { error: new DOMException(name + ' is not available in this browser', 'NotReadableError') });
        if (this.onerror) this.onerror(e);
        this.dispatchEvent(e);
      });
    }
    stop() {}
  };
}
G.process = G.process || { env: {}, argv: ['zinc'], platform: 'browser', exit() {}, stdout: { write: (s) => console.log(String(s).replace(/\n$/, '')) }, stderr: { write: (s) => console.error(String(s).replace(/\n$/, '')) } };

// ---------------------------------------------------------------- the surface
const root = document.getElementById('zinc-root');
const dom = CFG.render === 'dom';
if (dom && CFG.scroll === 'page') root.classList.add('zinc-page');   // the document scrolls (scroll anchoring, find in page, the browser's scrollbar) instead of a fixed stage
const dpr = () => Math.max(1, Math.min(3, G.devicePixelRatio || 1));
let W = 0, H = 0;   // logical pixels
function measureSurface() {
  const fixed = CFG.fixed;
  W = Math.max(1, Math.round(fixed ? fixed[0] : root.clientWidth || innerWidth));
  H = Math.max(1, Math.round(fixed ? fixed[1] : CFG.scroll === 'page' ? innerHeight : root.clientHeight || innerHeight));   // (a page that scrolls is as tall as its content: its surface is the window)
}
measureSurface();
let canvas = dom ? null : document.createElement('canvas');
let ctx = null;
if (canvas) {
  canvas.id = 'zinc-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', CFG.title || 'Zinc app');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  canvas.tabIndex = 0;
  root.appendChild(canvas);
  ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
}
function sizeCanvas() {
  if (!canvas) return;
  const k = dpr();
  const pw = Math.round(W * k), ph = Math.round(H * k);
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  if (CFG.fixed) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
}
sizeCanvas();
new ResizeObserver(() => { measureSurface(); sizeCanvas(); B.resize && B.resize(); }).observe(root);

// ---------------------------------------------------------------- colour and font helpers
const hex6 = (c) => '#' + (c >>> 0 & 0xffffff).toString(16).padStart(6, '0');
const rgba = (c, a) => `rgba(${c >>> 16 & 255},${c >>> 8 & 255},${c & 255},${Math.max(0, Math.min(255, a)) / 255})`;
const fonts = [];   // id -> { css, px, family, weight, italic, asc, lh }
const fontIds = new Map();
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';
const WEIGHTS = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };
const loadedFaces = new Set(CFG.fonts || []);   // font file stems the export registered as @font-face
/** zinc:gfx font(name, px): 'sans', 'sans-bold', 'mono', 'Inter-SemiBold', 'Name~i' (slanted), 'Name-Italic'. -1 for a family the page does not have. */
function fontId(name, px) {
  const key = name + '@' + px;
  let id = fontIds.get(key);
  if (id !== undefined) return id;
  let base = name, italic = false, weight = 400;
  if (base.endsWith('~i')) { italic = true; base = base.slice(0, -2); }
  let m = /^(.*?)-(BoldItalic|Italic)$/.exec(base);
  if (m) { italic = true; base = m[1]; if (m[2] === 'BoldItalic') weight = 700; }
  m = /^(.*)-(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)$/.exec(base);
  if (m) { base = m[1]; weight = WEIGHTS[m[2]]; }
  if (base === 'sans-bold') { base = 'sans'; weight = 700; }
  let family;
  if (loadedFaces.has(name) || loadedFaces.has(base)) {
    family = `"${loadedFaces.has(name) ? name : base}", ${SANS}`;
    if (loadedFaces.has(name)) { weight = 400; italic = false; }   // a face file is the weight it is: no synthetic bold on top
  }
  else if (base === 'sans') family = SANS;
  else if (base === 'mono' || base === 'grid') family = MONO;   // grid: the built-in face of gfx.text, which the page draws in the monospace face
  else if (base === 'serif') family = SERIF;
  else { fontIds.set(key, -1); return -1; }
  const f = { px, family, weight, italic, css: `${italic ? 'italic ' : ''}${weight} ${px}px ${family}`, asc: Math.round(px * 0.97), lh: Math.round(px * 1.21) };
  fonts.push(f);
  fontIds.set(key, fonts.length - 1);
  return fonts.length - 1;
}
const mctx = document.createElement('canvas').getContext('2d');   // text metrics
const widthCache = new Map();
function textWidth(id, s, tracking) {
  const f = fonts[id];
  if (!f) return 0;
  const k = id + '\u0000' + s;
  let w = widthCache.get(k);
  if (w === undefined) {
    mctx.font = f.css;
    w = mctx.measureText(s).width;
    if (widthCache.size > 20000) widthCache.clear();
    widthCache.set(k, w);
  }
  return w + (tracking || 0) * [...s].length;
}

// ---------------------------------------------------------------- images
const images = [];   // id -> { canvas, w, h, k } | null
const imageNames = new Map();
function newImage(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  images.push({ canvas: c, w, h, k: 1 });
  return images.length - 1;
}

/** For the browser backends of plugins: a gfx image's canvas to draw a video frame on, and the signal that its pixels changed (the DOM painter redraws it). */
Z.images = {
  canvas: (id) => (images[id] ? images[id].canvas : null),
  touch: (id) => { if (images[id]) images[id].rev = (images[id].rev || 0) + 1; },
  /** Gives the image another size (zinc:gl present, drawShader): its canvas is cleared. */
  resize: (id, w, h) => { const im = images[id]; if (!im) return; im.canvas.width = Math.max(1, w); im.canvas.height = Math.max(1, h); im.w = w; im.h = h; im.k = 1; },
};

// ---------------------------------------------------------------- the canvas painter
let tx = 0, ty = 0, xf = null;   // translate (zinc:gfx translate) and setTransform's matrix, in logical pixels
let target = null;                // an image being drawn into (beginImage), else the screen
const targets = [];
let kept = false;
const stage = { k: 1 };
let drawScale = 0;   // the device pixel ratio of the canvas a Canvas node of the semantic DOM draws into (0: the page's)
function applyTransform() {
  const c = ctx, k = target ? 1 : drawScale || dpr();
  c.setTransform(k, 0, 0, k, 0, 0);
  if (xf) c.transform(xf[0], xf[1], xf[2], xf[3], xf[4], xf[5]);
  if (tx || ty) c.translate(tx, ty);
}
function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (r > 0) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
}
function cssColorStops(g, stops) { for (const [o, col] of stops) g.addColorStop(Math.max(0, Math.min(1, o)), col); }
function paintStyle(rec, x, y, w, h) {
  const kind = rec[0] | 0, n = rec[7] | 0;
  const stops = [];
  for (let i = 0; i < n; i++) stops.push([rec[8 + i * 3], rgba(rec[9 + i * 3], rec[10 + i * 3])]);
  const rep = (kind & 8) !== 0 && n > 1;
  let g = null;
  const lo = stops.length ? stops[0][0] : 0, hi = stops.length ? stops[stops.length - 1][0] : 1;
  switch (kind & 7) {
    case 1: {
      let x0 = rec[1], y0 = rec[2], x1 = rec[4], y1 = rec[5], s = stops;
      if (rep && hi > lo) {   // repeating: the line is lengthened over the box and the stops repeat along it
        const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
        const proj = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => ((px - x0) * dx + (py - y0) * dy) / len2);
        const a = Math.floor((Math.min(...proj) - lo) / (hi - lo)), b = Math.ceil((Math.max(...proj) - lo) / (hi - lo));
        const cycles = Math.max(1, Math.min(400, b - a + 1)), t0 = lo + a * (hi - lo), span = cycles * (hi - lo);
        s = [];
        for (let c = 0; c < cycles; c++) for (const [o, col] of stops) s.push([(o - lo + c * (hi - lo)) / span, col]);
        const X0 = x0 + dx * t0, Y0 = y0 + dy * t0;
        x1 = X0 + dx * span; y1 = Y0 + dy * span; x0 = X0; y0 = Y0;
      }
      g = ctx.createLinearGradient(x0, y0, x1, y1); cssColorStops(g, s); break;
    }
    case 2: g = ctx.createRadialGradient(rec[1], rec[2], Math.max(0, rec[3]), rec[4], rec[5], Math.max(0, rec[6])); cssColorStops(g, stops); break;
    case 3: return { ellipse: [rec[1], rec[2], rec[4], rec[5]], stops };
    case 4: g = ctx.createConicGradient ? ctx.createConicGradient(rec[3] - Math.PI / 2, rec[1], rec[2]) : null; if (g) cssColorStops(g, stops); break;
  }
  return g || (stops[0] ? stops[0][1] : '#000');
}
const canvasPainter = {
  begin() { kept = false; tx = 0; ty = 0; xf = null; targets.length = 0; target = null; ctx = canvas.getContext('2d'); },
  end() {},
  clear(color) {
    const c = ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.fillStyle = hex6(color);
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  },
  rect(x, y, w, h, color) { applyTransform(); ctx.globalAlpha = 1; ctx.fillStyle = hex6(color); ctx.fillRect(x, y, w, h); },
  rrect(x, y, w, h, r, color, alpha) {
    if (alpha <= 0) return;
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255; ctx.fillStyle = hex6(color);
    if (r > 0) { rr(ctx, x, y, w, h, r); ctx.fill(); } else ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  },
  gradient(x, y, w, h, r, c1, c2, vertical, alpha) {
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255;
    const g = vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, hex6(c1)); g.addColorStop(1, hex6(c2));
    ctx.fillStyle = g; rr(ctx, x, y, w, h, r); ctx.fill(); ctx.globalAlpha = 1;
  },
  gradientPaint(x, y, w, h, r, rec, alpha) {
    if (!rec || rec.length < 11) return;
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255;
    const st = paintStyle(rec, x, y, w, h);
    if (st && st.ellipse) {   // a CSS ellipse: a unit radial gradient scaled by the radii, drawn through the box
      const [cx, cy, rx, ry] = st.ellipse;
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
      ctx.translate(cx, cy); ctx.scale(Math.max(rx, 1e-3), Math.max(ry, 1e-3));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); cssColorStops(g, st.stops); ctx.fillStyle = g;
      ctx.fillRect(-1e4, -1e4, 2e4, 2e4); ctx.restore();
    } else { ctx.fillStyle = st; rr(ctx, x, y, w, h, r); ctx.fill(); }
    ctx.globalAlpha = 1;
  },
  border(x, y, w, h, r, bw, color, alpha) {
    if (!(bw > 0)) return;
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255; ctx.strokeStyle = hex6(color); ctx.lineWidth = bw;
    rr(ctx, x + bw / 2, y + bw / 2, w - bw, h - bw, r - bw / 2); ctx.stroke(); ctx.globalAlpha = 1;
  },
  shadow(x, y, w, h, r, blur, color, alpha) {
    applyTransform();
    const m = ctx.getTransform(), BIG = 100000 / Math.max(1e-3, Math.abs(m.a));   // the shape is drawn far away, its shadow offset back onto the box
    ctx.save(); ctx.globalAlpha = 1;
    ctx.shadowColor = rgba(color, alpha); ctx.shadowBlur = blur * Math.abs(m.a); ctx.shadowOffsetX = 100000; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#000'; rr(ctx, x - BIG, y, w, h, r); ctx.fill(); ctx.restore();
  },
  polygon(pts, color, alpha) {
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255; ctx.fillStyle = hex6(color);
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill('nonzero'); ctx.globalAlpha = 1;
  },
  path(contours, color, alpha) {
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255; ctx.fillStyle = hex6(color);
    ctx.beginPath();
    for (let i = 0; i < contours.length;) {
      const n = contours[i] | 0, s = i + 1;
      if (n < 1 || s + n * 2 > contours.length) break;
      ctx.moveTo(contours[s], contours[s + 1]);
      for (let k = 1; k < n; k++) ctx.lineTo(contours[s + k * 2], contours[s + k * 2 + 1]);
      ctx.closePath(); i = s + n * 2;
    }
    ctx.fill('nonzero'); ctx.globalAlpha = 1;
  },
  stroke(pts, width, color, alpha, closed) {
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255; ctx.strokeStyle = hex6(color); ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); if (closed) ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
  },
  line(x1, y1, x2, y2, color) { applyTransform(); ctx.globalAlpha = 1; ctx.strokeStyle = hex6(color); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
  text(x, y, s, color, scale) {
    applyTransform(); ctx.globalAlpha = 1; ctx.fillStyle = hex6(color); ctx.font = `${8 * Math.max(1, scale)}px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillText(s, x, y);
  },
  drawText(id, x, y, s, color, alpha, tracking) {
    const f = fonts[id];
    if (!f || alpha <= 0 || s === '') return;
    applyTransform(); ctx.globalAlpha = Math.min(255, alpha) / 255; ctx.fillStyle = hex6(color); ctx.font = f.css; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = tracking ? tracking + 'px' : '0px';
    ctx.fillText(s, x, y + f.asc);
    if ('letterSpacing' in ctx && tracking) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  },
  drawImage(id, x, y, w, h, alpha, radius) {
    const im = images[id];
    if (!im || !(w > 0 && h > 0)) return;
    applyTransform(); ctx.globalAlpha = Math.min(255, Math.max(0, alpha)) / 255; ctx.imageSmoothingEnabled = true;
    if (radius > 0) { ctx.save(); rr(ctx, x, y, w, h, radius); ctx.clip(); ctx.drawImage(im.canvas, x, y, w, h); ctx.restore(); } else ctx.drawImage(im.canvas, x, y, w, h);
    ctx.globalAlpha = 1;
  },
  drawImageRect(id, sx, sy, sw, sh, dx, dy, dw, dh, alpha, flags, rotation, tint, blend) {
    const im = images[id];
    if (!im || !(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return;
    applyTransform(); ctx.save();
    ctx.globalAlpha = Math.min(255, Math.max(0, alpha)) / 255; ctx.imageSmoothingEnabled = !(flags & 4);
    ctx.globalCompositeOperation = blend === 1 ? 'lighter' : blend === 2 ? 'multiply' : blend === 3 ? 'screen' : 'source-over';
    ctx.translate(dx + dw / 2, dy + dh / 2); if (rotation) ctx.rotate(rotation);
    ctx.scale(flags & 1 ? -1 : 1, flags & 2 ? -1 : 1);
    let src = im.canvas;
    if (tint !== undefined && (tint & 0xffffff) !== 0xffffff) {   // tint: the image times the colour
      const t = document.createElement('canvas'); t.width = Math.max(1, Math.ceil(sw * im.k)); t.height = Math.max(1, Math.ceil(sh * im.k));
      const tc = t.getContext('2d'); tc.drawImage(im.canvas, sx * im.k, sy * im.k, sw * im.k, sh * im.k, 0, 0, t.width, t.height);
      tc.globalCompositeOperation = 'multiply'; tc.fillStyle = hex6(tint); tc.fillRect(0, 0, t.width, t.height);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(im.canvas, sx * im.k, sy * im.k, sw * im.k, sh * im.k, 0, 0, t.width, t.height);
      src = t; ctx.drawImage(src, 0, 0, t.width, t.height, -dw / 2, -dh / 2, dw, dh);
    } else ctx.drawImage(src, sx * im.k, sy * im.k, sw * im.k, sh * im.k, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  },
  svg(doc, x, y, w, h, alpha) {   // plugins/svg/web/svg.js: a parsed document, its shapes as Path2D
    applyTransform(); ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const vb = doc.vb, sx = w / vb[2], sy = h / vb[3], s = Math.min(sx, sy);
    const kx = doc.none ? sx : s, ky = doc.none ? sy : s;
    ctx.translate(x + (w - vb[2] * kx) / 2 - vb[0] * kx, y + (h - vb[3] * ky) / 2 - vb[1] * ky); ctx.scale(kx, ky);
    const a0 = Math.min(255, alpha) / 255;
    for (const it of doc.items) {
      ctx.save(); ctx.transform(...it.m);
      if (it.fill) { ctx.globalAlpha = a0 * it.opacity * it.fo; ctx.fillStyle = it.fill; ctx.fill(it.path, it.rule); }
      if (it.stroke) {
        ctx.globalAlpha = a0 * it.opacity * it.so; ctx.strokeStyle = it.stroke; ctx.lineWidth = it.sw; ctx.lineCap = it.cap; ctx.lineJoin = it.join; ctx.miterLimit = it.miter;
        ctx.setLineDash(it.dash.length ? it.dash : []); ctx.stroke(it.path);
      }
      ctx.restore();
    }
    ctx.restore();
  },
  /** A DOM element that shows itself in the page's DOM render (a <video>, a player's <canvas>); on a canvas its current picture, fitted into the box (o.fit 'contain' or 'cover', o.bg a colour). */
  element(el, x, y, w, h, o) {
    const sw = el.videoWidth || el.naturalWidth || el.width || 0, sh = el.videoHeight || el.naturalHeight || el.height || 0;
    if (!(sw > 0 && sh > 0 && w > 0 && h > 0)) return;
    applyTransform(); ctx.globalAlpha = 1;
    const cover = o && o.fit === 'cover', k = cover ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh), dw = sw * k, dh = sh * k;
    if (o && o.bg !== undefined && o.bg >= 0) { ctx.fillStyle = hex6(o.bg); ctx.fillRect(x, y, w, h); }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    try { ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); } catch { /* not decoded yet */ }
    ctx.restore();
  },
  clip(x, y, w, h, r) { applyTransform(); ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip(); },
  unclip() { ctx.restore(); },
  beginImage(id) { const im = images[id]; if (!im) return; targets.push([ctx, target, tx, ty, xf]); target = im; ctx = im.canvas.getContext('2d'); tx = ty = 0; xf = null; },
  endImage() { const t = targets.pop(); if (t) { ctx = t[0]; target = t[1]; tx = t[2]; ty = t[3]; xf = t[4]; } },
  resize() {},
};
let B = canvasPainter;
// What a Canvas node of the semantic DOM draws goes through the canvas painter into a <canvas> of its own: the DOM host switches the rows to it while the node draws.
function drawInto(cv, k, cb) {
  const prevCtx = ctx, prevScale = drawScale;
  ctx = cv.getContext('2d'); drawScale = k; tx = 0; ty = 0; xf = null; targets.length = 0; target = null; kept = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  try { cb(); } finally { ctx = prevCtx; drawScale = prevScale; }
}
const imageUrls = [], imageDataUrls = new Map();   // id -> the asset's url / a data: url of a runtime image
function assetUrl(name) {
  const n = normName(name);
  for (const a of CFG.assets || []) if (a.name === n || a.name === 'assets/' + n || a.name === name) return a.url;
  return '';
}
Z.assetNames = () => (CFG.assets || []).map((a) => a.name);
/** Loads a library a plugin brought (plugin.json web.scripts) the first time it is wanted: a script tag, resolved when it ran. */
const scriptsLoaded = new Map();
Z.loadScript = (name) => {
  if (scriptsLoaded.has(name)) return scriptsLoaded.get(name);
  const url = (CFG.scripts || {})[name];
  const p = new Promise((res, rej) => {
    if (!url) return rej(new Error('the export has no script ' + name));
    const s = document.createElement('script');
    s.src = url; s.onload = () => res(); s.onerror = () => rej(new Error('cannot load ' + url));
    document.head.appendChild(s);
  });
  scriptsLoaded.set(name, p);
  return p;
};
Z.assetUrl = assetUrl;   // the url of an asset by its name, for the plugins that hand it to a browser element (<video>)
Z.imageSize = (id) => (images[id] ? [images[id].w, images[id].h] : [0, 0]);
Z.imageUrl = (id) => {
  if (imageUrls[id]) return imageUrls[id];
  const im = images[id];
  if (!im) return '';
  const hit = imageDataUrls.get(id);
  if (hit && hit.rev === (im.rev || 0)) return hit.url;
  let url = '';
  try { url = im.canvas.toDataURL('image/png'); } catch { /* a tainted canvas */ }
  imageDataUrls.set(id, { rev: im.rev || 0, url });
  return url;
};
// A program with no zinc:ui tree (zinc:gfx or three.js drawing straight to the screen) has nothing to turn into elements in the semantic DOM: the first draw call
// that reaches the DOM host without a tree mounts a full-window <canvas> and the program draws and takes input as in the canvas mode.
function enterRaw() {
  if (canvas) return true;
  canvas = document.createElement('canvas');
  canvas.id = 'zinc-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', CFG.title || 'Zinc app');
  canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none;outline:none';
  canvas.tabIndex = 0;
  root.appendChild(canvas);
  measureSurface(); sizeCanvas();
  installCanvasInput(canvas);
  return true;
}
function leaveRaw() { if (dom && canvas) { canvas.remove(); canvas = null; } }
if (dom) {
  const mod = await import(/* @vite-ignore */ CFG.domModule || './dom.js');
  const host = mod.makeDomHost({ root, CFG, Z, fonts, images, hex6, canvasPainter, drawInto, assetUrl, dpr, enterRaw, leaveRaw });
  B = host.painter;
  G.__zincDom = host;   // zinc:ui/dom (lib/std/ui-dom.browser.ts) finds the host here: its frames are committed as elements
}
Z.paint = { svg: (...a) => B.svg(...a), element: (...a) => B.element(...a) };   // for the browser backends of plugins that draw (plugins/svg/web)
Z.invalidate = () => { /* the page asks for another frame (images that finished loading): nothing to do, frames always run */ };

// ---------------------------------------------------------------- input
const input = {
  px: 0, py: 0, down: false, pbuttons: 0, mods: 0, wheel: 0, wheelX: 0, pinch: 1, sdx: 0, sdy: 0, phase: 0,
  keys: [], btn: [], touches: [], pen: [], held: 0, prevHeld: 0, signals: [], cursor: 0, clip: '',
};
const modsOf = (e) => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
const pos = (e) => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const SDLBTN = [1, 2, 3, 4, 5];   // DOM button 0 left, 1 middle, 2 right -> SDL 1, 2, 3
Z.input = input;
function pointerEvent(e, down) {
  const [x, y] = pos(e);
  input.px = x; input.py = y; input.mods = modsOf(e);
  if (e.pointerType === 'touch') {
    const i = input.touches.findIndex((t) => t.id === e.pointerId);
    if (down === false) { if (i >= 0) input.touches.splice(i, 1); }
    else if (i >= 0) { input.touches[i].x = x; input.touches[i].y = y; } else input.touches.push({ id: e.pointerId, x, y });
  } else if (e.pointerType === 'pen') {
    input.pen.push({ x, y, pressure: e.pressure, tx: e.tiltX / 90, ty: e.tiltY / 90, flags: (e.buttons & 1 ? 1 : 0) | (e.buttons & 32 ? 2 : 0) | (e.buttons ? 0 : 4) });
  }
}
function installInput() {
  installSystem();
  if (!dom) installCanvasInput(canvas);   // (the semantic DOM: the page's own events reach the nodes through the DOM host)
}
function installCanvasInput(el) {
  const opt = { passive: false };
  el.addEventListener('pointerdown', (e) => {
    pointerEvent(e, true);
    const b = e.pointerType === 'touch' || e.pointerType === 'pen' ? 1 : SDLBTN[e.button] || 1;
    input.pbuttons |= 1 << (b - 1); input.down = true;
    input.btn.push({ x: input.px, y: input.py, button: b, down: 1 });
    try { el.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault(); el.focus({ preventScroll: true });
    unlockAudio();
  }, opt);
  el.addEventListener('pointermove', (e) => { pointerEvent(e, null); }, opt);
  const up = (e) => {
    pointerEvent(e, false);
    const b = e.pointerType === 'touch' || e.pointerType === 'pen' ? 1 : SDLBTN[e.button] || 1;
    input.pbuttons &= ~(1 << (b - 1));
    input.btn.push({ x: input.px, y: input.py, button: b, down: 0 });
    if (!input.pbuttons) input.down = false;
  };
  el.addEventListener('pointerup', up, opt);
  el.addEventListener('pointercancel', up, opt);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  el.addEventListener('wheel', (e) => {
    const k = e.deltaMode === 1 ? 1 / 3 : e.deltaMode === 2 ? 10 : 1 / 40;
    if (e.ctrlKey) { input.pinch *= Math.exp(-e.deltaY * 0.01); } else { input.wheel += -e.deltaY * k; input.wheelX += e.deltaX * k; }
    const [x, y] = pos(e); input.px = x; input.py = y; input.mods = modsOf(e);
    e.preventDefault();
  }, opt);
  // keyboard: key names as KeyboardEvent.key, unshifted letters; printable characters also arrive as text
  addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    input.mods = modsOf(e);
    const paste = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';
    if (paste) return;   // the paste event follows with the text
    const name = e.key.length === 1 ? e.key.toLowerCase() : e.key === 'Esc' ? 'Escape' : e.key;
    input.keys.push({ kind: e.repeat ? 2 : 0, name, mods: modsOf(e) });
    const claimed = ['Tab', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key);
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.target !== textField) input.keys.push({ kind: 3, name: e.key, mods: modsOf(e) });   // (a field being edited has its <textarea>: its input event brings the text, once)
    const inField = e.target && e.target !== document.body && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target !== textField;
    if (!inField && (claimed || e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) && e.key !== 'F5' && e.key !== 'F12' && !(e.metaKey && e.key.toLowerCase() === 'r') && !(e.ctrlKey && e.key.toLowerCase() === 'r') && !(e.metaKey && e.key === 'q')) e.preventDefault();
  });
  addEventListener('keyup', (e) => { input.mods = modsOf(e); input.keys.push({ kind: 1, name: e.key.length === 1 ? e.key.toLowerCase() : e.key, mods: modsOf(e) }); });
  addEventListener('paste', (e) => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t == null) return;
    input.clip = t; e.preventDefault();
    input.keys.push({ kind: 0, name: 'v', mods: 2 });
  });
  addEventListener('copy', () => {}); addEventListener('cut', () => {});
  addEventListener('blur', () => { input.keys.push({ kind: 1, name: 'Shift', mods: 0 }); });
}
// what the system says: foreground and background, the light or dark theme and, for the semantic DOM, the viewport (safe areas, on-screen keyboard, text size, motion)
function installSystem() {
  document.addEventListener('visibilitychange', () => input.signals.push(document.hidden ? 'background' : 'foreground'));
  const mq = matchMedia('(prefers-color-scheme: dark)');
  input.signals.push('theme ' + (mq.matches ? 'dark' : 'light'));
  mq.addEventListener && mq.addEventListener('change', (e) => input.signals.push('theme ' + (e.matches ? 'dark' : 'light')));
  if (!dom) return;
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  input.signals.push('reducemotion ' + (rm.matches ? '1' : '0'));
  rm.addEventListener && rm.addEventListener('change', (e) => input.signals.push('reducemotion ' + (e.matches ? '1' : '0')));
  // safe areas: env() read through a probe element, sent when they change (a rotation, a notch)
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  let lastSafe = '', lastKb = -1, lastScale = 1;
  const view = () => {
    const cs = getComputedStyle(probe);
    const safe = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0).join(' ');
    if (safe !== lastSafe) { lastSafe = safe; input.signals.push('safearea ' + safe); }
    const vv = G.visualViewport;
    const kb = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;   // the on-screen keyboard covers the bottom of the layout viewport
    const k = kb > 80 ? kb : 0;
    if (k !== lastKb) { lastKb = k; input.signals.push('keyboard ' + k); }
    const fs = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;   // the browser's text size setting (and zoom of text only)
    if (Math.abs(fs - lastScale) > 0.001) { lastScale = fs; input.signals.push('fontscale ' + fs); }
  };
  view();
  addEventListener('resize', view);
  addEventListener('orientationchange', () => setTimeout(view, 100));
  if (G.visualViewport) { G.visualViewport.addEventListener('resize', view); G.visualViewport.addEventListener('scroll', view); }
}
// the text field: a real <textarea> under the app's own field while it edits, so IME, dead keys and the soft keyboard work
let textField = null;
function startTextInput(x, y, w, h) {
  if (!textField) {
    textField = document.createElement('textarea');
    textField.setAttribute('aria-label', 'text input'); textField.autocapitalize = 'off'; textField.autocomplete = 'off'; textField.spellcheck = false;
    textField.style.cssText = 'position:absolute;opacity:0.01;border:0;padding:0;margin:0;resize:none;overflow:hidden;background:transparent;color:transparent;caret-color:transparent;z-index:2;font-size:16px';
    textField.addEventListener('input', (e) => {
      if (e.isComposing) return;
      const v = textField.value; textField.value = '';
      if (e.inputType === 'insertLineBreak') return;
      if (v) input.keys.push({ kind: 3, name: v, mods: 0 });
    });
    textField.addEventListener('compositionend', (e) => { if (e.data) input.keys.push({ kind: 3, name: e.data, mods: 0 }); textField.value = ''; });
    root.appendChild(textField);
  }
  Object.assign(textField.style, { left: x + 'px', top: y + 'px', width: Math.max(4, w) + 'px', height: Math.max(4, h) + 'px', display: 'block' });
  if (document.activeElement !== textField) textField.focus({ preventScroll: true });
}
function stopTextInput() { if (textField) { textField.style.display = 'none'; textField.blur(); } if (canvas) canvas.focus({ preventScroll: true }); }

const CURSORS = ['default', 'text', 'pointer', 'move', 'ew-resize', 'ns-resize', 'crosshair', 'grab', 'grabbing', 'not-allowed'];
// the gamepad: slots as the Gamepad API reports them ("standard" mapping), buttons as the zinc:gfx bit mask
let pads = [];
const PADBTN = { 12: 0, 13: 1, 14: 2, 15: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 9: 10, 8: 11 };   // standard button -> Btn (Up Down Left Right A B X Y L R Start Select)
function pollPads() {
  pads = FEATURES.gamepad ? Array.from(navigator.getGamepads() || []) : [];
  let bits = 0;
  for (const p of pads) if (p && p.connected) for (const [b, bit] of Object.entries(PADBTN)) if (p.buttons[b] && p.buttons[b].pressed) bits |= 1 << bit;
  return bits;
}

// ---------------------------------------------------------------- audio unlock (autoplay policy)
const audioWaiters = [];
function unlockAudio() { for (const f of audioWaiters.splice(0)) f(); }
// (the page's first click, tap or key, in canvas and DOM mode alike; a waiter that arrives after one already happened runs at once: the browser's autoplay rule is then met)
Z.onUserGesture = (f) => { if (navigator.userActivation && navigator.userActivation.hasBeenActive) { try { f(); } catch (e) { console.warn('zinc:', e); } } else audioWaiters.push(f); };
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockAudio, { capture: true, passive: true });

// ---------------------------------------------------------------- assets, files, storage
const assets = new Map();   // 'assets/path' and 'path' -> ArrayBuffer
const memfs = new Map();    // the files the app writes: path -> Uint8Array
let lastBytes = new Uint8Array(0), fsErr = '';
const enc = new TextEncoder(), dec = new TextDecoder();
const normName = (n) => String(n).replace(/^["']|["']$/g, '').replace(/^\/+/, '').replace(/^\.\//, '');
function assetBytes(name) {
  const n = normName(name);
  const b = assets.get(n) || assets.get('assets/' + n) || (n.startsWith('assets/') ? assets.get(n.slice(7)) : undefined);
  return b ? new Uint8Array(b) : null;
}
const fileBytes = (p) => memfs.get(normName(p)) || assetBytes(p);
const store = (() => {
  const prefix = 'zinc:' + (CFG.id || CFG.name) + ':';
  const mem = new Map();
  let ls = null;
  try { ls = localStorage; ls.getItem('x'); } catch { ls = null; }
  return {
    get: (k) => (ls ? ls.getItem(prefix + k) : mem.get(k)) ?? '',
    set: (k, v) => { try { ls ? ls.setItem(prefix + k, v) : mem.set(k, v); } catch (e) { mem.set(k, v); } },
    remove: (k) => { try { ls ? ls.removeItem(prefix + k) : mem.delete(k); } catch {} },
    keys: () => { if (!ls) return [...mem.keys()]; const r = []; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k.startsWith(prefix)) r.push(k.slice(prefix.length)); } return r; },
  };
})();
let storeKeys = [], listing = [];

// ---------------------------------------------------------------- the rows
const out = { text: '' };
function writeLine(err, s) {
  out.text += s;
  let i;
  while ((i = out.text.indexOf('\n')) >= 0) { (err ? console.error : console.log)(out.text.slice(0, i)); out.text = out.text.slice(i + 1); }
}
let quit = false, startMs = performance.now();
const lastKeys = [];
let frameKeys = [], frameBtn = [], framePen = [];
const rows = {
  // frame and surface
  gfxFrames: () => 0x7fffffff, gfxBegin: () => B.begin(), gfxEnd: () => B.end(), gfxFinish: () => {}, gfxKeep: () => { kept = true; B.keep && B.keep(); },
  gfxWidth: () => W, gfxHeight: () => H, gfxPixelScale: () => 1, gfxSetResize: () => {}, gfxProfiling: () => false, gfxProfMark: () => {},
  gfxCommands: () => 0, gfxCommandsFree: () => 1 << 20, gfxShouldQuit: () => quit, gfxQuit: () => { quit = true; }, gfxPoll: () => 1 / 60,
  gfxCapture: () => false,
  // drawing
  gfxClear: (c) => B.clear(c), gfxRect: (x, y, w, h, c) => B.rect(x, y, w, h, c), gfxRRect: (x, y, w, h, r, c, a) => B.rrect(x, y, w, h, r, c, a),
  gfxLine: (a, b, c, d, e) => B.line(a, b, c, d, e), gfxText: (x, y, s, c, k) => B.text(x, y, s, c, k),
  gfxGradient: (...a) => B.gradient(...a), gfxGradientPaint: (...a) => B.gradientPaint(...a), gfxBorder: (...a) => B.border(...a), gfxShadow: (...a) => B.shadow(...a),
  gfxPolygon: (p, c, a) => B.polygon(p, c, a), gfxPath: (p, c, a) => B.path(p, c, a), gfxStroke: (...a) => B.stroke(...a),
  gfxFont: (name, px) => fontId(name, px), gfxLoadFont: (file, px) => { const stem = String(file).replace(/^.*\//, '').replace(/\.[^.]+$/, ''); return loadedFaces.has(stem) ? fontId(stem, px) : -1; },
  gfxFontAscent: (id) => (fonts[id] ? fonts[id].asc : 0), gfxLineHeight: (id) => (fonts[id] ? fonts[id].lh : 0),
  gfxTextWidth: (id, s, t) => textWidth(id, s, t), gfxDrawText: (...a) => B.drawText(...a),
  gfxImage: (name) => { const n = normName(name); return imageNames.has(n) ? imageNames.get(n) : imageNames.has('assets/' + n) ? imageNames.get('assets/' + n) : -1; },
  gfxImageWidth: (i) => (images[i] ? images[i].w : 0), gfxImageHeight: (i) => (images[i] ? images[i].h : 0),
  gfxDrawImage: (...a) => B.drawImage(...a), gfxDrawImageRect: (...a) => B.drawImageRect(...a),
  gfxClip: (...a) => B.clip(...a), gfxUnclip: () => B.unclip(),
  gfxTranslate: (x, y) => { tx += x; ty += y; B.transformChanged && B.transformChanged(); }, gfxSetTransform: (a, b, c, d, e, f) => { xf = [a, b, c, d, e, f]; B.transformChanged && B.transformChanged(); }, gfxResetTransform: () => { xf = null; B.transformChanged && B.transformChanged(); },
  gfxCreateImage: (w, h) => newImage(w, h), gfxDestroyImage: (i) => { images[i] = null; },
  gfxBeginImage: (i) => B.beginImage(i), gfxEndImage: () => { const t = target; B.endImage(); if (t) t.rev = (t.rev || 0) + 1; },
  gfxImageFromPixels: (rgbaBytes, w, h) => { const id = newImage(w, h); rows.gfxUpdateImage(id, rgbaBytes); return id; },
  gfxUpdateImage: (id, bytes) => {
    const im = images[id]; if (!im) return;
    const c = im.canvas.getContext('2d'), a = Uint8ClampedArray.from(bytes);
    if (a.length >= im.w * im.h * 4) c.putImageData(new ImageData(a.subarray(0, im.w * im.h * 4), im.w, im.h), 0, 0);
    im.rev = (im.rev || 0) + 1;
  },
  gfxImageFromBytes: (bytes) => {   // the page decodes off the main thread: the image shows at the next repaint of the app
    const id = newImage(1, 1);
    createImageBitmap(new Blob([Uint8Array.from(bytes)])).then((bm) => {
      const im = images[id]; if (!im) return;
      im.canvas.width = bm.width; im.canvas.height = bm.height; im.w = bm.width; im.h = bm.height;
      im.canvas.getContext('2d').drawImage(bm, 0, 0);
    }, () => {});
    return id;
  },
  gfxShaderProgram: () => -1, gfxDrawShader: () => {}, gfxShaderAvailable: () => 0,
  // input
  gfxWheel: () => input.wheel, gfxWheelX: () => input.wheelX, gfxPinch: () => input.pinch, gfxScrollDX: () => 0, gfxScrollDY: () => 0, gfxScrollPhase: () => 0,
  gfxTouchCount: () => input.touches.length, gfxTouchX: (i) => (input.touches[i] ? input.touches[i].x : 0), gfxTouchY: (i) => (input.touches[i] ? input.touches[i].y : 0), gfxTouchId: (i) => (input.touches[i] ? input.touches[i].id : -1),
  gfxPenCount: () => framePen.length, gfxPenX: (i) => (framePen[i] ? framePen[i].x : 0), gfxPenY: (i) => (framePen[i] ? framePen[i].y : 0), gfxPenPressure: (i) => (framePen[i] ? framePen[i].pressure : 0),
  gfxPenTiltX: (i) => (framePen[i] ? framePen[i].tx : 0), gfxPenTiltY: (i) => (framePen[i] ? framePen[i].ty : 0), gfxPenFlags: (i) => (framePen[i] ? framePen[i].flags : 0),
  gfxGamepadCount: () => 4, gfxGamepadConnected: (i) => !!(pads[i] && pads[i].connected), gfxGamepadName: (i) => (pads[i] ? pads[i].id : ''),
  gfxGamepadButtons: (i) => { const p = pads[i]; if (!p) return 0; let m = 0; for (let b = 0; b < Math.min(17, p.buttons.length); b++) if (p.buttons[b].pressed) m |= 1 << b; return m; },
  gfxGamepadButtonValue: (i, b) => (pads[i] && pads[i].buttons[b] ? pads[i].buttons[b].value : 0), gfxGamepadAxis: (i, a) => (pads[i] ? pads[i].axes[a] || 0 : 0),
  gfxGamepadRumble: (i, lo, hi, ms) => { const p = pads[i]; if (!p || !p.vibrationActuator) return false; p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: lo, weakMagnitude: hi }).catch(() => {}); return true; },
  gfxIsDown: (b) => ((input.held >> b) & 1) === 1, gfxWasPressed: (b) => ((input.held >> b) & 1) === 1 && ((input.prevHeld >> b) & 1) === 0,
  gfxPointerX: () => input.px, gfxPointerY: () => input.py, gfxPointerDown: () => input.down, gfxPointerButtons: () => input.pbuttons, gfxModifiers: () => input.mods,
  gfxKeyCount: () => frameKeys.length, gfxKeyKind: (i) => (frameKeys[i] ? frameKeys[i].kind : -1), gfxKeyMods: (i) => (frameKeys[i] ? frameKeys[i].mods : 0), gfxKeyName: (i) => (frameKeys[i] ? frameKeys[i].name : ''),
  gfxButtonEventCount: () => frameBtn.length, gfxButtonEventX: (i) => (frameBtn[i] ? frameBtn[i].x : 0), gfxButtonEventY: (i) => (frameBtn[i] ? frameBtn[i].y : 0),
  gfxButtonEventButton: (i) => (frameBtn[i] ? frameBtn[i].button : 0), gfxButtonEventDown: (i) => !!(frameBtn[i] && frameBtn[i].down),
  gfxStartTextInput: dom ? () => {} : startTextInput, gfxStopTextInput: dom ? () => {} : stopTextInput,
  gfxClipboardText: () => input.clip, gfxSetClipboardText: (s) => { input.clip = s; if (FEATURES.clipboard) navigator.clipboard.writeText(s).catch(() => {}); },
  gfxSetCursor: (c) => { input.cursor = c; if (!dom) canvas.style.cursor = CURSORS[c] || 'default'; },
  gfxEscapeByApp: () => {}, gfxEscapeDefault: () => {},
  gfxSignalCount: () => frameSignals.length, gfxSignalNext: () => frameSignals.shift() || '',
  gfxOpenWindow: () => -1, gfxCloseWindow: () => {}, gfxWindowOpen: (i) => (i === 0 ? 1 : 0), gfxBeginWindow: () => {}, gfxEndWindow: () => {},
  // system
  sysFirst: () => {}, sysArgsCount: () => 0, sysArg: () => '', sysEnv: (n) => (CFG.env && CFG.env[n]) || '', sysExit: (c) => { quit = true; if (c) console.warn('zinc: exit ' + c); throw new ZnExit(c); },   // (stops the program where it stands, as process.exit does)
  sysPlatform: () => 'web', sysPid: () => 1, sysCwd: () => '/', sysChdir: () => true, sysSetEnv: (n, v) => { (CFG.env = CFG.env || {})[n] = v; }, sysUnsetEnv: (n) => { if (CFG.env) delete CFG.env[n]; },
  sysEnvKeysCount: () => Object.keys(CFG.env || {}).length, sysEnvKey: (i) => Object.keys(CFG.env || {})[i] || '', sysIsatty: () => false,
  sysWrite: (s) => writeLine(false, s), sysWriteErr: (s) => writeLine(true, s),
  sysRandomByte: () => crypto.getRandomValues(new Uint8Array(1))[0], sysUtf8Len: (s) => enc.encode(s).length, sysUtf8Byte: (s, i) => enc.encode(s)[i] || 0,
  sysUtf8Decode: (b) => dec.decode(Uint8Array.from(b)), sysBytesToString: (b) => String.fromCharCode(...b),
  sysLaunchDir: () => '/', sysLocale: () => navigator.language || 'en-US', sysDevice: (q, a) => deviceQuery(q, a),
  sysAllocations: () => 0, sysLiveBlocks: () => 0,
  // files: the assets are read only, what the app writes lives in memory for the page's life; storage is the page's localStorage
  fsFailed: () => fsErr !== '', fsError: () => fsErr,
  fsReadText: (p) => { fsErr = ''; const b = fileBytes(p); if (!b) { fsErr = 'ENOENT: readText ' + p; return ''; } return dec.decode(b); },
  fsWriteText: (p, s) => { fsErr = ''; memfs.set(normName(p), enc.encode(s)); },
  fsAppendText: (p, s) => { fsErr = ''; const o = fileBytes(p) || new Uint8Array(0), a = enc.encode(s), r = new Uint8Array(o.length + a.length); r.set(o); r.set(a, o.length); memfs.set(normName(p), r); },
  fsExists: (p) => !!fileBytes(p) || assetUrl(p) !== '', fsLoad: (p) => { fsErr = ''; const b = fileBytes(p); if (!b) { fsErr = 'ENOENT: readBytes ' + p; return 0; } lastBytes = b; return b.length; },
  fsByte: (i) => lastBytes[i] || 0, fsWriteBytes: (p, b) => { fsErr = ''; memfs.set(normName(p), Uint8Array.from(b)); },
  fsAppendBytes: (p, b) => { fsErr = ''; const o = fileBytes(p) || new Uint8Array(0), r = new Uint8Array(o.length + b.length); r.set(o); r.set(b, o.length); memfs.set(normName(p), r); },
  fsRemove: (p) => memfs.delete(normName(p)), fsMkdir: () => true, fsTmpdir: () => '/tmp',
  fsListCount: (d) => { const pre = normName(d).replace(/\/?$/, '/'); const set = new Set(); for (const k of [...memfs.keys(), ...assets.keys()]) if (k.startsWith(pre === '/' ? '' : pre)) set.add(k.slice(pre === '/' ? 0 : pre.length).split('/')[0]); listing = [...set]; return listing.length; },
  fsListName: (i) => listing[i] || '', fsListKind: () => 0,
  fsStat: (p) => !!fileBytes(p), fsStatD: () => 0, fsStatI: (i) => (i === 0 ? (lastBytes.length) : 0),
  assetsExists: (n) => !!assetBytes(n), assetsReadText: (n) => { fsErr = ''; const b = assetBytes(n); if (!b) { fsErr = 'ENOENT: asset ' + n; return ''; } return dec.decode(b); },
  assetsStat: () => 0,   // (6: under zinc dev with assets rebuilt on save; a page reloads instead)
  assetsLoad: (n) => { fsErr = ''; const b = assetBytes(n); if (!b) { fsErr = 'ENOENT: asset ' + n; return 0; } lastBytes = b; return b.length; },
  assetsCount: () => [...assets.keys()].filter((k) => k.startsWith('assets/')).length, assetsName: (i) => [...assets.keys()].filter((k) => k.startsWith('assets/'))[i]?.slice(7) || '',
  storageGet: (k) => store.get(k), storageSet: (k, v) => store.set(k, v), storageRemove: (k) => store.remove(k), storageKeysCount: () => (storeKeys = store.keys()).length, storageKey: (i) => storeKeys[i] || '',
};
const frameSignals = [];
// the address bar and history follow a Stack's routes (lib/std/navigation.tsx, Stack path): `route DEPTH PATH`. A deeper stack pushes an entry, a shallower one goes back, the same depth
// replaces the address; the browser's own Back or Forward arrives as a popstate, which becomes the app's back key (the Stack pops, and its new route replaces the address).
let routeDepth = 0, routeIgnore = 0, routePopping = false, routeFirst = true;
if (typeof history !== 'undefined' && history.state && typeof history.state.d === 'number') routeDepth = history.state.d;
addEventListener('popstate', () => {
  if (routeIgnore > 0) { routeIgnore--; return; }
  const d = history.state && typeof history.state.d === 'number' ? history.state.d : 0;
  if (d < routeDepth) { routePopping = true; input.signals.push('back'); }
});
function routeTo(depth, path) {
  try {
    if (routeFirst) { routeFirst = false; routeDepth = depth; history.replaceState({ d: depth }, '', path); }   // the first screen is the entry the page was opened at
    else if (routePopping) { routePopping = false; routeDepth = depth; history.replaceState({ d: depth }, '', path); }
    else if (depth > routeDepth) { history.pushState({ d: depth }, '', path); routeDepth = depth; }
    else if (depth < routeDepth) { routeIgnore = 1; const back = routeDepth - depth; routeDepth = depth; history.go(-back); setTimeout(() => history.replaceState({ d: depth }, '', path), 50); }
    else history.replaceState({ d: depth }, '', path);
  } catch { /* a page that may not change its address (a sandboxed frame) */ }
}
function deviceQuery(q, a) {   // the backend of zinc:web's navigator: what a browser knows by itself
  switch (q) {
    case 'route': { const sp = String(a).indexOf(' '); routeTo(parseInt(a), String(a).slice(sp + 1)); return ''; }
    case 'cores': return String(navigator.hardwareConcurrency || 1);
    case 'online': return navigator.onLine ? '1' : '0';
    case 'language': return navigator.language || 'en-US';
    case 'userAgent': return navigator.userAgent;
    default: return '';
  }
}

// every other row the bundle names answers with a typed error that says what is missing (exportWeb lists them at build time as well)
const UNSUPPORTED = CFG.unsupported || [];
const why = (n) => (/^(sock|net|http|tls|mqtt|osc|dns)/i.test(n) ? 'raw sockets and TLS: use fetch or WebSocket (docs/targets/web.md)' : /^(proc|sig|stdin)/i.test(n) ? 'processes and signals' : /^(ev|loop)/i.test(n) ? 'the native event loop' : /^layout/.test(n) ? 'the React Native layout engine (Yoga) is not built for the web target yet; use the classic layout' : /^assets/.test(n) ? 'asset groups and packs' : 'a native service');
for (const n of UNSUPPORTED) G['__host_' + n] = function () { throw new ZnUnsupported(n, why(n)); };
for (const [n, f] of Object.entries(rows)) G['__host_' + n] = f;
G.__addEvHandler = G.__addEvHandler || (() => {});   // the native event loop's handlers (signals, stdin, plugin events): none of those events reach a page
if (Z.bridge && CFG.bridge.rows) {   // zinc dev: the file system and the host services the page lacks are this machine's, as under zinc run (the dev bridge)
  const remote = (n) => (...a) => Z.bridge.call('__rows', n, a);
  const local = /^(ev|loop|layout|assets|gfx|sys|storage)/;
  for (const n of [...UNSUPPORTED.filter((n) => !local.test(n)), ...Object.keys(rows).filter((n) => n.startsWith('fs')), 'sysEnv']) G['__host_' + n] = remote(n);
  // a file the page has itself (an asset, a file it wrote in memory) is read here; any other path is the machine's
  let viaBridge = false, loaded = new Uint8Array(0);
  const mine = (p) => !!fileBytes(p);
  G.__host_fsFailed = () => (viaBridge ? Z.bridge.call('__rows', 'fsFailed', []) : rows.fsFailed());
  G.__host_fsError = () => (viaBridge ? Z.bridge.call('__rows', 'fsError', []) : rows.fsError());
  for (const n of ['fsReadText', 'fsExists']) G['__host_' + n] = (p, ...a) => ((viaBridge = !mine(p)) ? Z.bridge.call('__rows', n, [p, ...a]) : rows[n](p, ...a));
  G.__host_fsLoad = (p) => ((viaBridge = !mine(p)) ? (loaded = Z.bridge.call('__fs', 'load', [p])).length : rows.fsLoad(p));
  G.__host_assetsLoad = (n) => { viaBridge = false; return rows.assetsLoad(n); };   // (zinc:assets reads the bytes with fsByte)
  G.__host_fsByte = (i) => (viaBridge ? loaded[i] || 0 : rows.fsByte(i));
  for (const n of ['fsStat']) G['__host_' + n] = (p, ...a) => ((viaBridge = !mine(p)) ? Z.bridge.call('__rows', n, [p, ...a]) : rows[n](p, ...a));
  for (const n of ['fsStatD', 'fsStatI']) G['__host_' + n] = (...a) => (viaBridge ? Z.bridge.call('__rows', n, a) : rows[n](...a));
  // the events of this machine's loop reach the page's handlers (zinc:net, zinc:osc...), with their payload; zinc:net's servers listen on this machine: a request
  // reaches the page as zinc:net's request event (42), its reply goes back through the bridge
  const evHandlers = [];
  let payload = [];
  G.__addEvHandler = (f) => { evHandlers.push(f); };
  G.__host_evPayload = () => payload;
  Z.hostEvent = (h, kind, data, raw) => { payload = raw; for (const f of evHandlers) f(h, kind, data); };
  const request = (id, data, raw) => Z.hostEvent(id, 42, data, raw);
  G.__host_httpServe = (port) => Z.bridge.call('__net', 'serve', [port, request]);
  G.__host_httpError = () => '';
  G.__host_httpReply = (h, status, lines, body) => Z.bridge.call('__net', 'reply', [h, status, lines, body]);
  G.__host_httpReplyFile = (h, status, lines, file) => Z.bridge.call('__net', 'replyFile', [h, status, lines, file]);
  G.__host_httpStop = (port) => Z.bridge.call('__net', 'stop', [port]);
}

// zinc dev: the program's fetch to another origin is made by this machine, as under zinc run (a LAN device or a site that sends no CORS headers answers);
// a request to the page's own origin stays the browser's
if (Z.bridge) {
  const empty = new Set([101, 204, 205, 304]);
  G.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null;
    const u = new URL(req ? req.url : String(input), location.href);
    if (u.origin === location.origin || !/^https?:$/.test(u.protocol)) return pageFetch(input, init);
    const r = new Request(input, init), headers = [];
    r.headers.forEach((v, k) => headers.push([k, v]));
    const body = r.method === 'GET' || r.method === 'HEAD' ? null : Array.from(new Uint8Array(await r.arrayBuffer()));
    const a = await Z.bridge.call('__fetch', 'fetch', [u.href, r.method, headers, body, init.timeoutMs || 0]);
    const res = new Response(empty.has(a.status) ? null : new Uint8Array(a.body), { status: a.status, statusText: a.statusText, headers: a.headers });
    Object.defineProperty(res, 'url', { value: u.href });
    return res;
  };
}

// ---------------------------------------------------------------- WebAssembly for the plugins that need native code
// A plugin whose native side is C or C++ (sqlite, box2d...) is compiled to wasm by `zinc export` (plugin.json "web": { "wasm": ... }); the page compiles it
// before the app starts, and the plugin's browser backend makes an instance synchronously, so its native calls stay synchronous as on a desktop.
Z.wasm = {};
Z.wasmInstance = (name, extra = {}) => {
  const mod = Z.wasm[name];
  if (!mod) throw new ZnUnsupported('wasm module ' + name, 'the export did not include it');
  let mem = null;
  const view = () => new DataView(mem.buffer);
  const wasi = {
    clock_time_get: (id, _prec, out) => { view().setBigUint64(out, BigInt(Math.round((id === 0 ? Date.now() : performance.now()) * 1e6)), true); return 0; },
    random_get: (p, n) => { crypto.getRandomValues(new Uint8Array(mem.buffer, p, n)); return 0; },
    fd_write: (fd, iovs, n, out) => { let total = 0, text = ''; for (let i = 0; i < n; i++) { const p = view().getUint32(iovs + i * 8, true), l = view().getUint32(iovs + i * 8 + 4, true); text += new TextDecoder().decode(new Uint8Array(mem.buffer, p, l)); total += l; } (fd === 2 ? console.error : console.log)(text.replace(/\n$/, '')); view().setUint32(out, total, true); return 0; },
    environ_sizes_get: (a, b) => { view().setUint32(a, 0, true); view().setUint32(b, 0, true); return 0; },
    args_sizes_get: (a, b) => { view().setUint32(a, 0, true); view().setUint32(b, 0, true); return 0; },
    proc_exit: (c) => { throw new Error('wasm exit ' + c); },
  };
  const imports = {};
  for (const i of WebAssembly.Module.imports(mod)) {
    const ns = (imports[i.module] = imports[i.module] || {});
    ns[i.name] = i.module === 'wasi_snapshot_preview1' && wasi[i.name] ? wasi[i.name] : extra[i.name] || (() => 52);   // 52: ENOSYS
  }
  const inst = new WebAssembly.Instance(mod, imports);
  mem = inst.exports.memory;
  if (inst.exports._initialize) inst.exports._initialize();
  return inst;
};

// ---------------------------------------------------------------- the loop
let last = performance.now(), overlayEl = null;
const errSeen = new Map();   // an error thrown every frame is told once, not sixty times a second: the same message within a second of its last time only counts
function showError(e, kind) {
  if (e && e.name === 'ZnExit') return;
  const key = String((e && (e.stack || e.message)) || e).slice(0, 400), now = performance.now(), seen = errSeen.get(key);
  errSeen.set(key, { at: now, n: (seen ? seen.n : 0) + 1 });
  if (seen && now - seen.at < 1000) return;
  console.error(e);
  if (CFG.dev) return Z.onError && Z.onError(e);
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.setAttribute('role', 'alert');
    overlayEl.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:50%;overflow:auto;z-index:9;padding:12px 16px;background:#7f1d1d;color:#fff;font:14px/1.4 system-ui,sans-serif;white-space:pre-wrap';
    document.body.appendChild(overlayEl);
  }
  overlayEl.textContent = (e && e.name === 'ZnUnsupported') ? 'This app needs a feature your browser does not have: ' + e.message : String((e && e.message) || e) + (e && e.stack ? '\n' + String(e.stack).split('\n').slice(1, 4).join('\n') : '');
}
Z.showError = showError;
function frame(now) {
  if (quit) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
  last = now;
  // this frame's input: what arrived since the last one
  input.prevHeld = input.held;
  input.held = pollPads();
  frameKeys = input.keys.splice(0);
  // a tap can press and release inside one frame; the app sees the press for a frame before the release
  let cut = input.btn.length;
  for (let i = 0; i < input.btn.length; i++) if (input.btn[i].down && i + 1 < input.btn.length) { cut = i + 1; break; }
  frameBtn = input.btn.splice(0, cut);
  framePen = input.pen.splice(0);
  while (input.signals.length) frameSignals.push(input.signals.shift());
  G.__zincFrames = (G.__zincFrames || 0) + 1;
  G.__zincFrameNo = G.__zincFrames;   // zinc:gfx frame(): zinc:ui steps its clock, animations and steppers once per frame number
  const cb = G.__zincFrameCb;
  if (typeof cb === 'function') {
    const t0 = performance.now();
    try { B.begin(); cb(dt); B.end(); } catch (e) { showError(e); }
    const st = (G.__zincStats = G.__zincStats || { first: 0, ms: [] });   // the cost of the app's frame (layout, paint calls, canvas or DOM work), for tools/web-measure
    if (!st.first) st.first = performance.now();
    if (st.ms.length < 2000) st.ms.push(performance.now() - t0);
  }
  input.wheel = 0; input.wheelX = 0; input.pinch = 1;
}
Z.frame = frame;

// ---------------------------------------------------------------- boot
const bar = document.getElementById('zinc-progress');
async function preload() {
  const list = (CFG.assets || []).filter((a) => !a.stream);   // (a video is streamed by its <video> element from its url)
  let done = 0, total = list.reduce((s, a) => s + (a.size || 0), 0) || 1, got = 0;
  const jobs = list.map(async (a) => {
    const r = await pageFetch(a.url);
    if (!r.ok) throw new Error(`cannot load ${a.name}: ${r.status}`);
    const buf = await r.arrayBuffer();
    assets.set(a.name, buf);
    if (a.name.startsWith('assets/')) assets.set(a.name.slice(7), buf);
    got += a.size || 0; done++;
    if (bar) bar.value = Math.min(100, Math.round((got / total) * 100));
    if (a.image) {
      try {
        const bm = await createImageBitmap(new Blob([buf]));
        const k = a.scale || 1, id = newImage(Math.round(bm.width / k), Math.round(bm.height / k));
        const im = images[id]; im.canvas.width = bm.width; im.canvas.height = bm.height; im.k = k; im.canvas.getContext('2d').drawImage(bm, 0, 0);
        imageNames.set(a.name, id); if (a.name.startsWith('assets/')) imageNames.set(a.name.slice(7), id);
        imageUrls[id] = a.url;
      } catch (e) { console.warn('zinc: cannot decode ' + a.name, e); }
    }
    if (a.font) {
      try { const ff = new FontFace(a.font, buf); await ff.load(); document.fonts.add(ff); } catch (e) { console.warn('zinc: cannot load font ' + a.font, e); }
    }
  });
  for (const w of CFG.wasm || []) jobs.push((async () => { const r = await pageFetch(w.url); if (!r.ok) throw new Error(`cannot load ${w.name}: ${r.status}`); Z.wasm[w.name] = await WebAssembly.compile(await r.arrayBuffer()); })());
  await Promise.all(jobs);
}
async function boot() {
  try {
    await preload();
    installInput();
    if (CFG.dev) await import(/* @vite-ignore */ CFG.hmrModule || './hmr.js').catch((e) => console.warn('zinc: no hot reload', e));
    if (CFG.rows) await import(/* @vite-ignore */ 'zinc:native');   // the host rows of rows-*.js (zinc:gl, runtime shaders) live in native.js and must be there before the app runs
    await (globalThis.__zincLoadEntry ? globalThis.__zincLoadEntry() : import(/* @vite-ignore */ CFG.entry));   // a bundler (the Vite plugin) sets __zincLoadEntry to its own import() of the app, so it can split and hash it
    document.getElementById('zinc-splash')?.remove();
    root.focus && root.focus();
    // a prerender capture (?zn-capture, headless Chrome without a display) gets no animation frame in time: the first frame runs from a timer
    if (/[?&]zn-capture/.test(location.search)) setTimeout(() => frame(performance.now()), 0); else requestAnimationFrame(frame);
  } catch (e) {
    document.getElementById('zinc-splash')?.remove();
    showError(e);
  }
}
addEventListener('error', (e) => { if (e.error) { if (e.error.name === 'ZnExit') e.preventDefault(); showError(e.error); } });
addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.name === 'ZnExit') e.preventDefault(); showError(e.reason); });
boot();
