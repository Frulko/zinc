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
    removeEventListener() {}
    dispatchEvent() { return true; }
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
  class Canvas extends Node {}
  const doc = new Node('#document');
  doc.title = 'webgl conformance';
  doc.readyState = 'complete';
  doc.body = new Node('body'); doc.documentElement = new Node('html'); doc.head = new Node('head');
  doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
  const byId = {};
  doc.getElementById = (id) => byId[id] || null;
  doc.createElement = (tag) => {
    if (String(tag).toLowerCase() === 'canvas' && nativeCreate) { const c = nativeCreate('canvas'); Object.setPrototypeOf(c, Canvas.prototype); initNode(c, 'canvas'); return c; }
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
  g.Image = class Image extends Node { constructor() { super('img'); } };
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
    if (typeof g.onload === 'function') { try { g.onload({ type: 'load' }); } catch (e) { out('@E', 'onload:', String(e && e.stack || e)); } }
    for (const f of (listeners['doc:DOMContentLoaded'] || [])) { try { f({ type: 'DOMContentLoaded' }); } catch (e) { out('@E', 'DOMContentLoaded:', String(e && e.stack || e)); } }
  };
})(globalThis);
