// A just-enough DOM for the Khronos WebGL conformance pages (ZN-203.04): the page's elements come from tools/webgl-conformance as __elements, the results leave through
// window.parent.webglTestHarness (what js-test-pre.js already calls) and are printed as "@R 1|0 message", "@F" and "@E message" lines.
(function (g) {
  delete g.SharedArrayBuffer;   // a page that is not cross-origin isolated has none; the engine cannot hand out its bytes
  g.screen = { width: 1920, height: 1080 };
  g.window = g; g.self = g; g.top = g;
  const out = (...a) => console.log(a.join(' '));
  g.parent = { webglTestHarness: {
    reportResults(path, ok, msg, skipped) { out('@R', ok ? 1 : 0, String(msg).replace(/\s+/g, ' ')); },
    notifyFinished(path) { out('@F'); },
  } };
  const pagePath = g.__pagePath || '/test.html';   // conformance2 pages are told from conformance ones by this path
  g.location = { href: 'file://' + pagePath, pathname: pagePath, search: '', hash: '', protocol: 'file:', host: '', hostname: '', toString() { return this.href; } };
  g.navigator = { userAgent: 'zinc-quickjs', platform: 'zinc', appVersion: 'zinc', language: 'en' };
  if (typeof g.URL === 'undefined') g.URL = class URL { constructor(s) { this.href = String(s); this.searchParams = { get() { return null; }, has() { return false; }, set() {} }; this.search = ''; } };
  if (typeof g.URLSearchParams === 'undefined') g.URLSearchParams = class URLSearchParams { get() { return null; } has() { return false; } getAll() { return []; } toString() { return ''; } };
  if (typeof g.requestAnimationFrame === 'undefined') g.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
  g.devicePixelRatio = 1; g.innerWidth = 800; g.innerHeight = 600;
  g.addEventListener = function (type, f) { (listeners[type] = listeners[type] || []).push(f); };
  g.removeEventListener = function () {};
  g.postMessage = function (data) { setTimeout(() => { for (const f of (listeners['message'] || [])) f({ type: 'message', data, source: g, stopPropagation() {} }); }, 0); };
  g.dispatchEvent = function () { return true; };
  g.getComputedStyle = () => ({ getPropertyValue() { return ''; } });
  g.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  const listeners = {};

  const nativeCreate = g.document && g.document.createElement;   // WebGL's own canvas (src/gl/webgl_js.cpp): width, height and getContext
  function initNode(n, tag) { n.tagName = String(tag).toUpperCase(); n.nodeName = n.tagName; if (n.tagName === 'SCRIPT') n.src = ''; n.childNodes = []; n.children = n.childNodes; n.parentNode = null; n.attributes = {}; n.style = {}; n._text = ''; n._ev = {}; n.className = ''; n.id = ''; n.dataset = {}; n.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} }; }
  class Node {
    constructor(tag) { initNode(this, tag); }
    appendChild(c) { c.parentNode = this; this.childNodes.push(c); if (c.tagName === 'SCRIPT' && /js-test-post\.js$/.test(c.src || '') && g.__postJs) (0, eval)(g.__postJs); return c; }   // finishTest() loads the epilogue this way
    insertBefore(c, ref) { c.parentNode = this; const i = this.childNodes.indexOf(ref); if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
    replaceChild(n, old) { const i = this.childNodes.indexOf(old); if (i < 0) this.childNodes.push(n); else this.childNodes[i] = n; n.parentNode = this; if (old) old.parentNode = null; return old; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'type' || k === 'name' || k === 'value' || k === 'src' || k === 'href') this[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'width') this.width = Number(v); if (k === 'height') this.height = Number(v); }
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
    hasAttribute(k) { return k in this.attributes; }
    removeAttribute(k) { delete this.attributes[k]; }
    addEventListener(t, f) { (this._ev[t] = this._ev[t] || []).push(f); }
    removeEventListener(t, f) { const l = this._ev[t]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
    dispatchEvent(e) { e.target = e.currentTarget = this; for (const f of (this._ev[e.type] || []).slice()) f.call(this, e); if (typeof this['on' + e.type] === 'function') this['on' + e.type](e); return !e.defaultPrevented; }
    getElementsByTagName(t) { const r = []; const w = (n) => { for (const c of n.childNodes) { if (c.tagName === String(t).toUpperCase() || t === '*') r.push(c); w(c); } }; w(this); return r; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    cloneNode() { const n = new Node(this.tagName); n.id = this.id; return n; }
    get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
    get innerHTML() { return this._text; } set innerHTML(v) { this._text = String(v); }
    get innerText() { return this._text; } set innerText(v) { this._text = String(v); }
    get text() { return this._text; } set text(v) { this._text = String(v); }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get nextSibling() { return null; }
    get ownerDocument() { return g.document; }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width || 0, height: this.height || 0, right: this.width || 0, bottom: this.height || 0 }; }
    get clientWidth() { return this.width || 0; } get clientHeight() { return this.height || 0; }
    get offsetWidth() { return this.width || 0; } get offsetHeight() { return this.height || 0; }
    focus() {} blur() {} click() {}
  }
  // a bitmap-only CanvasRenderingContext2D: enough for pages that fill rectangles, copy a WebGL canvas and read pixels back (colours: #rgb, #rrggbb, rgb(), rgba(), a few names)
  const NAMED = { black: [0, 0, 0, 255], white: [255, 255, 255, 255], red: [255, 0, 0, 255], green: [0, 128, 0, 255], lime: [0, 255, 0, 255], blue: [0, 0, 255, 255], yellow: [255, 255, 0, 255], cyan: [0, 255, 255, 255], magenta: [255, 0, 255, 255], transparent: [0, 0, 0, 0], gray: [128, 128, 128, 255], grey: [128, 128, 128, 255] };
  function parseColor(c) {
    c = String(c).trim().toLowerCase();
    if (NAMED[c]) return NAMED[c].slice();
    let m;
    if ((m = /^#([0-9a-f]{3})$/.exec(c))) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(255);
    if ((m = /^#([0-9a-f]{6})$/.exec(c))) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)).concat(255);
    if ((m = /^rgba?\(([^)]*)\)$/.exec(c))) { const v = m[1].split(',').map((x) => parseFloat(x)); return [v[0], v[1], v[2], v.length > 3 ? Math.round(v[3] * 255) : 255]; }
    return [0, 0, 0, 255];
  }
  class Context2D {
    constructor(canvas) { this.canvas = canvas; this._w = 0; this._h = 0; this._px = null; this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.globalAlpha = 1; }
    _fit() { const w = Math.max(0, this.canvas.width | 0), h = Math.max(0, this.canvas.height | 0); if (!this._px || w !== this._w || h !== this._h) { this._w = w; this._h = h; this._px = new Uint8ClampedArray(w * h * 4); } return this._px; }
    save() {} restore() {} beginPath() {} closePath() {} translate() {} scale() {} rotate() {} setTransform() {} fillText() {} strokeText() {} fill() {} stroke() {}
    clearRect(x, y, w, h) { this._rect(x, y, w, h, [0, 0, 0, 0]); }
    fillRect(x, y, w, h) { this._rect(x, y, w, h, parseColor(this.fillStyle)); }
    _rect(x, y, w, h, c) {
      const px = this._fit(); const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(this._w, Math.round(x + w)), y1 = Math.min(this._h, Math.round(y + h));
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) { const o = (j * this._w + i) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3]; }
    }
    createImageData(w, h) { if (typeof w === 'object') { h = w.height; w = w.width; } return new g.ImageData(w, h); }
    getImageData(x, y, w, h) {
      const px = this._fit(), out = new g.ImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const sx = x + i, sy = y + j; if (sx < 0 || sy < 0 || sx >= this._w || sy >= this._h) continue; const o = (sy * this._w + sx) * 4, d = (j * w + i) * 4; out.data[d] = px[o]; out.data[d + 1] = px[o + 1]; out.data[d + 2] = px[o + 2]; out.data[d + 3] = px[o + 3]; }
      return out;
    }
    putImageData(img, dx, dy) {
      const px = this._fit();
      for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) { const x = dx + i, y = dy + j; if (x < 0 || y < 0 || x >= this._w || y >= this._h) continue; const o = (y * this._w + x) * 4, s = (j * img.width + i) * 4; px[o] = img.data[s]; px[o + 1] = img.data[s + 1]; px[o + 2] = img.data[s + 2]; px[o + 3] = img.data[s + 3]; }
    }
    drawImage(src, a, b, c, d, e, f, h, k) {   // drawImage(src, dx, dy) | (src, dx, dy, dw, dh) | (src, sx, sy, sw, sh, dx, dy, dw, dh); nearest neighbour, source-over without blending (opaque or replace)
      const s = srcPixels(src); if (!s) return;
      let sx = 0, sy = 0, sw = s.width, sh = s.height, dx, dy, dw, dh;
      if (arguments.length >= 9) { sx = a; sy = b; sw = c; dx = e; dy = f; sh = d; dw = h; dh = k; } else if (arguments.length >= 5) { dx = a; dy = b; dw = c; dh = d; } else { dx = a; dy = b; dw = sw; dh = sh; }
      const px = this._fit();
      for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
        const x = Math.round(dx) + i, y = Math.round(dy) + j; if (x < 0 || y < 0 || x >= this._w || y >= this._h) continue;
        const u = sx + Math.min(sw - 1, Math.floor(i * sw / dw)), v = sy + Math.min(sh - 1, Math.floor(j * sh / dh)), so = (v * s.width + u) * 4, o = (y * this._w + x) * 4;
        px[o] = s.data[so]; px[o + 1] = s.data[so + 1]; px[o + 2] = s.data[so + 2]; px[o + 3] = s.data[so + 3];
      }
    }
  }
  // the pixels of a drawImage / texImage2D source: a 2D canvas, a WebGL canvas (read back, top row first) or an ImageData
  function srcPixels(src) {
    if (!src) return null;
    if (src.data && src.width) return src;
    if (src._ctx2d) { const px = src._ctx2d._fit(); return { data: px, width: src._ctx2d._w, height: src._ctx2d._h }; }
    if (src.__gl) {
      const gl = src.__gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, raw = new Uint8Array(w * h * 4), out = new Uint8ClampedArray(w * h * 4);
      const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); if (fb) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      if (fb) gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      for (let j = 0; j < h; j++) out.set(raw.subarray((h - 1 - j) * w * 4, (h - j) * w * 4), j * w * 4);
      return { data: out, width: w, height: h };
    }
    return null;
  }
  g.__srcPixels = srcPixels;
  class Canvas extends Node {
    toDataURL() { return 'data:image/png;base64,'; }
    toBlob(cb) { setTimeout(() => cb(null), 0); }
  }
  const doc = new Node('#document');
  doc.title = 'webgl conformance';
  doc.readyState = 'complete';
  doc.body = new Node('body'); doc.documentElement = new Node('html'); doc.head = new Node('head');
  doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
  const byId = {};
  doc.getElementById = (id) => byId[id] || null;
  doc.createElement = (tag) => {
    if (String(tag).toLowerCase() === 'canvas' && nativeCreate) { const c = nativeCreate('canvas'); const glContext = c.getContext; Object.setPrototypeOf(c, Canvas.prototype); initNode(c, 'canvas');
      c.getContext = function (type, attrs) { if (type === '2d') return this._ctx2d || (this._ctx2d = new Context2D(this)); return glContext.call(this, type, attrs); };
      return c; }
    if (String(tag).toLowerCase() === 'img') return new g.Image();
    return new Node(tag);
  };
  doc.createElementNS = (ns, tag) => doc.createElement(tag);
  doc.createTextNode = (t) => { const n = new Node('#text'); n._text = String(t); return n; };
  doc.getElementsByTagName = (t) => Node.prototype.getElementsByTagName.call(doc.documentElement, t);
  doc.addEventListener = (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); };
  doc.defaultView = g;
  doc.location = g.location;
  g.document = doc;
  g.Node = Node; g.HTMLElement = Node; g.HTMLCanvasElement = Canvas; g.Element = Node;
  g.HTMLImageElement = class HTMLImageElement extends Node {};
  g.HTMLVideoElement = class HTMLVideoElement extends Node {};
  // there is no image decoder: an image source never loads, so the page learns it from an error event (and fails with that reason rather than waiting for a load)
  g.Image = class Image extends Node {
    constructor() { super('img'); }
    get src() { return this._src || ''; }
    set src(v) {
      this._src = String(v);
      if (this._src === 'data:image/png;base64,') return;   // canvas.toDataURL() of this shim: a picture for the page's log, nobody waits for it
      setTimeout(() => {
        const e = { type: 'error', target: this };
        out('@E', 'image decoding is not available (' + this._src.slice(0, 40) + ')');
        if (typeof this.onerror === 'function') this.onerror(e);
        else if (!(this._ev.error || []).length && typeof g.testFailed === 'function') { g.testFailed('image decoding is not available (' + this._src.slice(0, 40) + ')'); if (typeof g.finishTest === 'function') g.finishTest(); }   // the page waits for a load that cannot come
        this.dispatchEvent(e);
      }, 0);
    }
  };
  g.ImageData = class ImageData { constructor(a, w, h) { if (typeof a === 'number') { h = w; w = a; a = new Uint8ClampedArray(w * h * 4); } this.data = a; this.width = w; this.height = h; } };

  // synchronous XMLHttpRequest over local files: the page directory is __pageDir (set by the runner), __zincReadFile comes with the WebGL bindings
  g.XMLHttpRequest = class XMLHttpRequest {
    open(method, url, async) { this.url = String(url); this.readyState = 1; }
    setRequestHeader() {} overrideMimeType() {} abort() {}
    send() {
      const text = g.__zincReadFile((g.__pageDir || '.') + '/' + this.url.split('?')[0]);
      this.readyState = 4;
      if (text === undefined) { this.status = 404; this.responseText = ''; } else { this.status = 200; this.responseText = text; this.response = text; }
      if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
      if (typeof this.onload === 'function') this.onload();
    }
  };

  // the elements of the page
  g.__buildPage = function (elements) {
    for (const e of elements) {
      const n = doc.createElement(e.tag);
      n.tagName = e.tag.toUpperCase();
      for (const k of Object.keys(e.attrs)) n.setAttribute(k, e.attrs[k]);
      if (e.tag === 'canvas') { if (e.attrs.width) n.width = Number(e.attrs.width); if (e.attrs.height) n.height = Number(e.attrs.height); }
      n._text = e.text || '';
      if (e.id) byId[e.id] = n;
      doc.body.appendChild(n);
    }
  };
  g.__fireLoad = function () {
    for (const f of (listeners['load'] || [])) { try { f({ type: 'load' }); } catch (e) { out('@E', 'load handler:', String(e && e.stack || e)); } }
    if (g.__bodyOnload) { try { (0, eval)(g.__bodyOnload); } catch (e) { out('@E', 'body onload:', String(e && e.message || e), '|', String(e && e.stack || '').split('\n').slice(0, 3).join(' | ')); } }
    if (typeof g.onload === 'function') { try { g.onload({ type: 'load' }); } catch (e) { out('@E', 'onload:', String(e && e.stack || e)); } }
    for (const f of (listeners['doc:DOMContentLoaded'] || [])) { try { f({ type: 'DOMContentLoaded' }); } catch (e) { out('@E', 'DOMContentLoaded:', String(e && e.stack || e)); } }
  };
})(globalThis);
