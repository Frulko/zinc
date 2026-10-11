// The web environment of QuickJS programs (ZN-568): the browser a JavaScript library expects around WebGL, written against what PixiJS, Phaser,
// p5.js and three.js call (docs/reports/games/js-game-libraries.md, section 3.1) and no further. Evaluated before the program when it asks
// (ZINC_WEB=1, or "web" in zinc.json; src/qjs/webenv.cpp); nothing of it exists otherwise.
//
// What it is not: a DOM implementation. There is no layout (an element is as large as its style says), no CSS, no HTML parser (innerHTML keeps
// its text), and selectors are the simple ones. A member a library reads and does not find is named by ZINC_WEB=trace.
(g => {
  'use strict';
  const native = g.__zincWeb;
  const nativeCanvas = g.document && g.document.createElement;   // the WebGL module's canvas (src/gl/webgl_js.cpp), when the module is there
  delete g.__zincWeb;
  const hidden = (o, props) => { for (const k of Object.keys(props)) Object.defineProperty(o, k, { value: props[k], writable: true, configurable: true }); return o; };
  const writeErr = g.__host_sysWriteErr;

  class DOMException extends Error {
    constructor(message = '', name = 'Error') { super(message); this.name = name; }
  }

  // ---- events: capture, target and bubble phases along the parents of a node, then the document, then the window, as libraries rely on
  // (PixiJS hears pointermove on the document and pointerup on the window, Phaser its keys on the window: one dispatch at the target reaches them)
  const listenersOf = new WeakMap();   // target -> Map(type -> [{ f, capture, once, passive, gone }])
  let winProxy = null, docProxy = null;   // ZINC_WEB=trace: `window` and `document` are proxies of the real ones
  const targetOf = t => t === undefined || t === null || t === winProxy ? g : t === docProxy ? doc : t;
  const parentOf = t => t instanceof Node ? t.parentNode || (t === doc ? g : null) : null;
  class Event {
    constructor(type, init) {
      this.type = String(type); this.bubbles = !!(init && init.bubbles); this.cancelable = !!(init && init.cancelable); this.composed = !!(init && init.composed);
      this.target = null; this.currentTarget = null; this.eventPhase = 0; this.defaultPrevented = false; this.isTrusted = false; this.timeStamp = performance.now();
      hidden(this, { _stop: 0, _passive: false, _path: [] });
    }
    preventDefault() { if (this.cancelable && !this._passive) this.defaultPrevented = true; }
    stopPropagation() { this._stop |= 1; }
    stopImmediatePropagation() { this._stop |= 3; }
    composedPath() { return this._path.slice(); }
    get srcElement() { return this.target; }
    get returnValue() { return !this.defaultPrevented; } set returnValue(v) { if (!v) this.preventDefault(); }
    get cancelBubble() { return (this._stop & 1) !== 0; } set cancelBubble(v) { if (v) this._stop |= 1; }
    initEvent(type, bubbles, cancelable) { this.type = String(type); this.bubbles = !!bubbles; this.cancelable = !!cancelable; }
  }
  for (const [k, v] of [['NONE', 0], ['CAPTURING_PHASE', 1], ['AT_TARGET', 2], ['BUBBLING_PHASE', 3]]) { Event[k] = v; Event.prototype[k] = v; }
  const fields = (e, init, defaults) => { for (const k in defaults) e[k] = init && init[k] !== undefined ? init[k] : defaults[k]; };
  const KEYS = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
  class CustomEvent extends Event { constructor(t, i) { super(t, i); this.detail = i && i.detail !== undefined ? i.detail : null; } initCustomEvent(t, b, c, d) { this.initEvent(t, b, c); this.detail = d; } }
  class UIEvent extends Event {
    constructor(t, i) { super(t, i); fields(this, i, { view: null, detail: 0 }); }
    getModifierState(k) { return !!this[{ Control: 'ctrlKey', Shift: 'shiftKey', Alt: 'altKey', Meta: 'metaKey' }[k]]; }
  }
  class MouseEvent extends UIEvent {
    constructor(t, i) { super(t, i); fields(this, i, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, button: 0, buttons: 0, relatedTarget: null, movementX: 0, movementY: 0, ...KEYS }); }
    get pageX() { return this.clientX; } get pageY() { return this.clientY; }   // nothing scrolls and every box starts at the window's origin
    get x() { return this.clientX; } get y() { return this.clientY; }
    get offsetX() { return this.clientX; } get offsetY() { return this.clientY; }
    get layerX() { return this.clientX; } get layerY() { return this.clientY; }
  }
  class PointerEvent extends MouseEvent {
    constructor(t, i) { super(t, i); fields(this, i, { pointerId: 0, width: 1, height: 1, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: '', isPrimary: false }); }
    getCoalescedEvents() { return [this]; }
    getPredictedEvents() { return []; }
  }
  class WheelEvent extends MouseEvent { constructor(t, i) { super(t, i); fields(this, i, { deltaX: 0, deltaY: 0, deltaZ: 0, deltaMode: 0 }); } }
  for (const [k, v] of [['DOM_DELTA_PIXEL', 0], ['DOM_DELTA_LINE', 1], ['DOM_DELTA_PAGE', 2]]) { WheelEvent[k] = v; WheelEvent.prototype[k] = v; }
  class KeyboardEvent extends UIEvent { constructor(t, i) { super(t, i); fields(this, i, { key: '', code: '', location: 0, repeat: false, isComposing: false, keyCode: 0, which: 0, charCode: 0, ...KEYS }); } }
  class Touch { constructor(i) { fields(this, i, { identifier: 0, target: null, clientX: 0, clientY: 0, screenX: 0, screenY: 0, pageX: 0, pageY: 0, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 }); } }
  class TouchEvent extends UIEvent { constructor(t, i) { super(t, i); fields(this, i, { touches: [], targetTouches: [], changedTouches: [], ...KEYS }); } }
  class FocusEvent extends UIEvent { constructor(t, i) { super(t, i); fields(this, i, { relatedTarget: null }); } }
  class ErrorEvent extends Event { constructor(t, i) { super(t, i); fields(this, i, { message: '', filename: '', lineno: 0, colno: 0, error: null }); } }
  class MessageEvent extends Event { constructor(t, i) { super(t, i); fields(this, i, { data: null, origin: '', lastEventId: '', source: null, ports: [] }); } }
  class PromiseRejectionEvent extends Event { constructor(t, i) { super(t, i); fields(this, i, { promise: null, reason: undefined }); } }
  class ProgressEvent extends Event { constructor(t, i) { super(t, i); fields(this, i, { lengthComputable: false, loaded: 0, total: 0 }); } }

  function invoke(t, e, phase) {
    const byType = listenersOf.get(t), list = byType && byType.get(e.type);
    e.currentTarget = t; e.eventPhase = phase;
    if (list) for (const x of list.slice()) {
      if (x.gone || (phase === 1 && !x.capture) || (phase === 3 && x.capture)) continue;
      if (x.once) remove(t, e.type, x.f, x.capture);
      e._passive = x.passive;
      try { if (typeof x.f === 'function') x.f.call(t, e); else x.f.handleEvent(e); } catch (err) { reportError(err); }   // a listener that throws stops nobody else, as in a browser
      e._passive = false;
      if (e._stop & 2) return;
    }
    const on = phase === 1 ? undefined : t['on' + e.type];   // the handler property (onload, onmessage, onclick...)
    if (typeof on === 'function') { try { on.call(t, e); } catch (err) { reportError(err); } }
  }
  function dispatch(target, e) {
    e.target = target; e._stop = 0;
    const path = [];
    for (let t = target; t; t = parentOf(t)) path.push(t);
    e._path = path;
    for (let i = path.length - 1; i > 0 && !(e._stop & 1); i--) invoke(path[i], e, 1);
    if (!(e._stop & 1)) invoke(target, e, 2);
    if (e.bubbles) for (let i = 1; i < path.length && !(e._stop & 1); i++) invoke(path[i], e, 3);
    e.eventPhase = 0; e.currentTarget = null;
    return !e.defaultPrevented;
  }
  function remove(t, type, f, capture) {
    const byType = listenersOf.get(t), list = byType && byType.get(type);
    const i = list ? list.findIndex(x => x.f === f && x.capture === capture) : -1;
    if (i >= 0) { list[i].gone = true; list.splice(i, 1); }
  }
  class EventTarget {
    addEventListener(type, f, options) {
      if (f === null || f === undefined) return;
      const t = targetOf(this), o = typeof options === 'object' && options !== null ? options : { capture: !!options };
      let byType = listenersOf.get(t);
      if (!byType) listenersOf.set(t, byType = new Map());
      let list = byType.get(type = String(type));
      if (!list) byType.set(type, list = []);
      if (list.some(x => x.f === f && x.capture === !!o.capture)) return;
      list.push({ f, capture: !!o.capture, once: !!o.once, passive: !!o.passive, gone: false });
      if (o.signal) o.signal.addEventListener('abort', () => remove(t, type, f, !!o.capture));
    }
    removeEventListener(type, f, options) { remove(targetOf(this), String(type), f, !!(typeof options === 'object' && options !== null ? options.capture : options)); }
    dispatchEvent(e) { return dispatch(targetOf(this), e); }
  }
  // an error nobody caught: the window's `error` event, then the message unless a listener prevented it; the program goes on
  let reporting = false;   // an `error` listener that throws is printed, not reported to itself
  function reportError(err) {
    let quiet = false;
    if (!reporting) { reporting = true; quiet = !dispatch(g, new ErrorEvent('error', { cancelable: true, error: err, message: 'Uncaught ' + String(err) })); reporting = false; }
    if (!quiet) writeErr('Uncaught ' + String(err) + '\n' + (err && err.stack ? err.stack : ''));
  }

  // ---- the tree
  function initNode(n, type, name) { n.nodeType = type; n.nodeName = name; n.childNodes = []; n.parentNode = null; }
  class Node extends EventTarget {
    constructor(type, name) { super(); initNode(this, type, name); }
    get parentElement() { const p = this.parentNode; return p && p.nodeType === 1 ? p : null; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
    get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] || null : null; }
    get isConnected() { return doc.contains(this); }
    get ownerDocument() { return this === doc ? null : g.document; }
    get nodeValue() { return null; }
    get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
    set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes.length = 0; if (v !== null && v !== undefined && v !== '') this.appendChild(new Text(v)); }
    getRootNode() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc ? g.document : n; }
    hasChildNodes() { return this.childNodes.length > 0; }
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
    appendChild(c) { return this.insertBefore(c, null); }
    insertBefore(c, ref) {
      if (c instanceof DocumentFragment) { for (const k of c.childNodes.slice()) this.insertBefore(k, ref); return c; }
      if (c.contains(this)) throw new DOMException('The new child contains its parent', 'HierarchyRequestError');
      if (c.parentNode) c.parentNode.removeChild(c);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
      c.parentNode = this;
      if (c.nodeType === 1 && (c.tagName === 'CANVAS' || walk(c, e => e.tagName === 'CANVAS', [], true).length) && doc.contains(c)) wantFrames();   // a canvas in the document is something to show
      if (c.nodeType === 1 && c.tagName === 'SCRIPT' && doc.contains(c)) runScript(c);
      return c;
    }
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i < 0) throw new DOMException('The node to be removed is not a child of this node', 'NotFoundError');
      this.childNodes.splice(i, 1);
      c.parentNode = null;
      return c;
    }
    replaceChild(n, old) { this.insertBefore(n, old); return this.removeChild(old); }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    cloneNode(deep) {
      const n = this.nodeType === 1 ? g.document.createElement(this.localName) : this.nodeType === 3 ? new Text(this.data) : new Node(this.nodeType, this.nodeName);
      if (this.nodeType === 1) for (const [k, v] of this._attrs) n.setAttribute(k, v);
      if (deep) for (const c of this.childNodes) n.appendChild(c.cloneNode(true));
      return n;
    }
  }
  for (const [k, v] of [['ELEMENT_NODE', 1], ['TEXT_NODE', 3], ['COMMENT_NODE', 8], ['DOCUMENT_NODE', 9], ['DOCUMENT_FRAGMENT_NODE', 11]]) { Node[k] = v; Node.prototype[k] = v; }
  class Text extends Node {
    constructor(data = '') { super(3, '#text'); this.data = String(data); }
    get textContent() { return this.data; } set textContent(v) { this.data = String(v); }
    get nodeValue() { return this.data; } set nodeValue(v) { this.data = String(v); }
  }
  class DocumentFragment extends Node { constructor() { super(11, '#document-fragment'); } }
  function walk(root, test, out, one) {
    for (const c of root.childNodes) {
      if (c.nodeType !== 1) continue;
      if (test(c)) { out.push(c); if (one) return out; }
      walk(c, test, out, one);
      if (one && out.length) return out;
    }
    return out;
  }
  // The selectors a library writes itself: tag, #id, .class, [attr] and [attr=value] in compounds, joined by descendant or child combinators, in a
  // comma list. Anything else is refused by name rather than answered wrongly (a full selector engine is a library's work, see ZN-568's notes).
  function matcher(sel) {
    const refuse = () => { throw new DOMException(`'${sel}' is not a selector the web environment knows`, 'SyntaxError'); };
    const compound = text => {
      const m = /^(\*|[\w-]+)?((?:[#.][\w-]+|\[[\w-]+(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[^\]]*))?\])*)$/.exec(text);
      if (!m || text === '') refuse();
      const tests = [];
      if (m[1] && m[1] !== '*') { const tag = m[1].toUpperCase(); tests.push(e => e.tagName === tag); }
      for (const p of m[2].match(/[#.][\w-]+|\[[^\]]*\]/g) || []) {
        if (p[0] === '#') tests.push(e => e.id === p.slice(1));
        else if (p[0] === '.') tests.push(e => e.classList.contains(p.slice(1)));
        else {
          const a = /^\[([\w-]+)(?:(=)(.*))?\]$/.exec(p);
          if (!a) refuse();
          const want = a[3] === undefined ? undefined : a[3].replace(/^["']|["']$/g, '');
          tests.push(e => a[2] ? e.getAttribute(a[1]) === want : e.hasAttribute(a[1]));
        }
      }
      return e => tests.every(t => t(e));
    };
    const alts = String(sel).split(',').map(one => {
      const steps = [];   // left to right: { test, child } where child says the step is a direct child of the one before
      let child = false;
      for (const word of one.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/)) {
        if (word === '>') { if (child || !steps.length) refuse(); child = true; continue; }
        steps.push({ test: compound(word), child });
        child = false;
      }
      if (child || !steps.length) refuse();
      return steps;
    });
    const at = (e, steps, i) => {
      if (!steps[i].test(e)) return false;
      if (i === 0) return true;
      if (steps[i].child) return !!e.parentElement && at(e.parentElement, steps, i - 1);
      for (let p = e.parentElement; p; p = p.parentElement) if (at(p, steps, i - 1)) return true;
      return false;
    };
    return e => alts.some(steps => at(e, steps, steps.length - 1));
  }
  const camel = k => String(k).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  class CSSStyleDeclaration {
    setProperty(k, v) { this[camel(k)] = v === null || v === undefined ? '' : String(v); }
    getPropertyValue(k) { const v = this[camel(k)]; return v === undefined ? '' : String(v); }
    removeProperty(k) { const v = this.getPropertyValue(k); delete this[camel(k)]; return v; }
    get cssText() { return Object.keys(this).map(k => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + ': ' + this[k] + ';').join(' '); }
    set cssText(text) {
      for (const k of Object.keys(this)) delete this[k];
      for (const d of String(text).split(';')) { const i = d.indexOf(':'); if (i > 0) this.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
    }
  }
  const newStyle = () => new Proxy(new CSSStyleDeclaration(), { get: (t, k) => k in t || typeof k !== 'string' ? t[k] : '' });   // a property never set reads '', as in a browser
  class DOMTokenList {
    constructor(el) { hidden(this, { _el: el }); }
    get value() { return this._el.getAttribute('class') || ''; }
    set value(v) { this._el.setAttribute('class', v); }
    get length() { return this._list().length; }
    _list() { return this.value.split(/\s+/).filter(Boolean); }
    item(i) { return this._list()[i] || null; }
    contains(c) { return this._list().includes(c); }
    add(...cs) { const l = this._list(); for (const c of cs) if (!l.includes(c)) l.push(c); this.value = l.join(' '); }
    remove(...cs) { this.value = this._list().filter(c => !cs.includes(c)).join(' '); }
    toggle(c, force) { const on = force === undefined ? !this.contains(c) : !!force; if (on) this.add(c); else this.remove(c); return on; }
    replace(a, b) { if (!this.contains(a)) return false; this.remove(a); this.add(b); return true; }
    forEach(f, self) { this._list().forEach(f, self); }
    [Symbol.iterator]() { return this._list()[Symbol.iterator](); }
    toString() { return this.value; }
  }
  class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) { this.x = x; this.y = y; this.width = width; this.height = height; }
    get left() { return this.x; } get top() { return this.y; } get right() { return this.x + this.width; } get bottom() { return this.y + this.height; }
    toJSON() { return { x: this.x, y: this.y, width: this.width, height: this.height, top: this.top, right: this.right, bottom: this.bottom, left: this.left }; }
  }
  // There is no layout engine. An element is as large as its style says (px, %, vw, vh); without one, html and body are the window, a canvas or
  // an image is its own size, anything else is a block as wide as its parent and empty. Every box starts at the window's origin.
  function length(v, whole) {
    const m = /^\s*(-?[\d.]+)(px|%|vw|vh)?\s*$/.exec(v);
    if (!m) return NaN;
    return m[2] === '%' ? m[1] * whole / 100 : m[2] === 'vw' ? m[1] * g.innerWidth / 100 : m[2] === 'vh' ? m[1] * g.innerHeight / 100 : +m[1];
  }
  function boxOf(el) {
    const root = el === html || el === body || !el.parentElement;
    const around = root ? { width: g.innerWidth, height: g.innerHeight } : boxOf(el.parentElement);
    const st = el._style;
    let w = st ? length(st.width, around.width) : NaN, h = st ? length(st.height, around.height) : NaN;
    if (isNaN(w)) w = typeof el.width === 'number' ? el.width : around.width;
    if (isNaN(h)) h = typeof el.height === 'number' ? el.height : el === html || el === body ? around.height : 0;
    return new DOMRect(0, 0, w, h);
  }
  function initElement(e, tag) {
    initNode(e, 1, tag.toUpperCase());
    e.tagName = e.nodeName; e.localName = tag; e.namespaceURI = 'http://www.w3.org/1999/xhtml';
    e.scrollLeft = 0; e.scrollTop = 0;
    hidden(e, { _attrs: new Map(), _style: null, _classes: null, _data: null, _html: '' });
    return e;
  }
  class Element extends Node {
    constructor(tag = 'div') { super(1, ''); initElement(this, tag); }
    getAttribute(k) { const v = this._attrs.get(String(k).toLowerCase()); return v === undefined ? null : v; }
    setAttribute(k, v) { this._attrs.set(String(k).toLowerCase(), String(v)); }
    removeAttribute(k) { this._attrs.delete(String(k).toLowerCase()); }
    hasAttribute(k) { return this._attrs.has(String(k).toLowerCase()); }
    getAttributeNames() { return [...this._attrs.keys()]; }
    get id() { return this.getAttribute('id') || ''; } set id(v) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') || ''; } set className(v) { this.setAttribute('class', v); }
    get classList() { return this._classes || (this._classes = new DOMTokenList(this)); }
    get style() { return this._style || (this._style = newStyle()); }
    set style(text) { this.style.cssText = text; }
    get dataset() { return this._data || (this._data = {}); }
    get tabIndex() { const v = this.getAttribute('tabindex'); return v === null ? -1 : +v; } set tabIndex(v) { this.setAttribute('tabindex', v); }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get childElementCount() { return this.children.length; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get innerText() { return this.textContent; } set innerText(v) { this.textContent = v; }
    // no HTML parser: markup is kept as the text it is, and read back unchanged
    get innerHTML() { return this._html; }
    set innerHTML(v) { this.textContent = ''; this._html = String(v); if (this._html.includes('<')) missing('innerHTML with markup (kept as text)'); else this.textContent = this._html; }
    append(...nodes) { for (const n of nodes) this.appendChild(typeof n === 'string' ? new Text(n) : n); }
    prepend(...nodes) { const first = this.firstChild; for (const n of nodes) this.insertBefore(typeof n === 'string' ? new Text(n) : n, first); }
    matches(sel) { return matcher(sel)(this); }
    closest(sel) { const m = matcher(sel); for (let e = this; e; e = e.parentElement) if (m(e)) return e; return null; }
    querySelector(sel) { return walk(this, matcher(sel), [], true)[0] || null; }
    querySelectorAll(sel) { return walk(this, matcher(sel), []); }
    getElementsByTagName(tag) { tag = String(tag).toUpperCase(); return walk(this, e => tag === '*' || e.tagName === tag, []); }
    getElementsByClassName(c) { return walk(this, e => e.classList.contains(c), []); }
    getBoundingClientRect() { return boxOf(this); }
    getClientRects() { return [boxOf(this)]; }
    get clientWidth() { return boxOf(this).width; } get clientHeight() { return boxOf(this).height; }
    get offsetWidth() { return boxOf(this).width; } get offsetHeight() { return boxOf(this).height; }
    get scrollWidth() { return boxOf(this).width; } get scrollHeight() { return boxOf(this).height; }
    get clientLeft() { return 0; } get clientTop() { return 0; } get offsetLeft() { return 0; } get offsetTop() { return 0; }
    get offsetParent() { return this.parentElement; }
    focus() { focus(this); }
    blur() { if (active === this) focus(body); }
    click() { this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: g })); }
    setPointerCapture() { captured = this; }
    releasePointerCapture() { if (captured === this) captured = null; }
    hasPointerCapture() { return captured === this; }
    requestPointerLock() {}
    requestFullscreen() { return Promise.resolve(); }
    scrollIntoView() {}
  }
  class HTMLElement extends Element {}
  class HTMLMediaElement extends HTMLElement {   // sound and video are ZN-573's: an element that plays nothing and says so
    canPlayType() { return ''; }
    load() {}
    pause() {}
    play() { return Promise.reject(new DOMException('The web environment plays no media', 'NotSupportedError')); }
  }
  class HTMLAudioElement extends HTMLMediaElement {}
  class HTMLVideoElement extends HTMLMediaElement {}
  // A canvas is the WebGL module's own canvas object (its width and height resize the drawing buffer, its getContext makes the context) given
  // this class and an element's fields; without the module it is an element whose getContext answers null, as in a browser without WebGL.
  class HTMLCanvasElement extends HTMLElement {
    getContext(type, attributes) {
      const webgl = type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl';
      if (webgl) return this._gl && !this._2d ? this._gl(type, attributes) : null;
      if (type === '2d') return this.__gl ? null : this._2d || (this._2d = new CanvasRenderingContext2D(this));   // one kind of context per canvas
      missing("canvas.getContext('" + type + "')");
      return null;
    }
    _pixels() { const w = this.width, h = this.height; return this._2d && w > 0 && h > 0 ? { data: new Uint8ClampedArray(c2d.read(this._2d._b, 0, 0, w, h)), width: w, height: h } : null; }   // a texture source, drawImage's
    setAttribute(k, v) { super.setAttribute(k, v); if (k === 'width' || k === 'height') this[k] = +v; }
    toDataURL() { missing('canvas.toDataURL (no image encoder)'); return 'data:,'; }
    toBlob(cb) { missing('canvas.toBlob (no image encoder)'); setTimeout(() => cb(null), 0); }
  }
  function newCanvas() {
    const c = nativeCanvas ? nativeCanvas('canvas') : { width: 300, height: 150 };
    const gl = c.getContext;
    delete c.getContext;
    Object.setPrototypeOf(c, HTMLCanvasElement.prototype);
    initElement(c, 'canvas');
    for (const k of ['width', 'height']) {   // a size given to a canvas clears its 2D bitmap and state, even the size it has
      const d = Object.getOwnPropertyDescriptor(c, k);
      let own = d.value;
      Object.defineProperty(c, k, { get: d.get ? () => d.get.call(c) : () => own, set(v) { if (d.set) d.set.call(c, v); else own = v >>> 0; if (c._2d) c._2d._reset(); }, enumerable: true, configurable: true });
    }
    return hidden(c, { _gl: gl ? gl.bind(c) : null, _2d: null, _image: 0 });
  }
  // ---- Canvas 2D, the text-first tier (ZN-570). The pixels and everything drawn are native (native.c2d, src/qjs/canvas2d.cpp: canvas_ity for
  // shapes, the engine's text tier for glyphs); this side keeps the state a program reads back and parses CSS colours and fonts. Blending is a
  // browser's (sRGB values, source-over and ten more operations); pictures are resampled with a bicubic filter, whatever imageSmoothingEnabled
  // says. What the tier leaves out (ZN-572: Path2D, patterns, conic gradients, filters, the even-odd rule, the other
  // blend modes) is a counted no-op, never an exception: __canvas2dUnsupported() gives the counts, ZINC_WEB=trace names each once.
  const c2d = native.c2d, OP = {};
  ('save restore scale rotate translate transform setTransform globalAlpha composite shadowColor shadowBlur shadowOffset lineWidth lineCap lineJoin miterLimit dashOffset beginPath moveTo closePath ' +
    'lineTo quadTo bezierTo arcTo arc rect fill stroke clip inPath clearRect fillRect strokeRect color linear radial stop').split(' ').forEach((k, i) => { OP[k] = i; });   // the order of Op in canvas2d.cpp
  const unsupported2d = new Map();
  function unsupported(what) { unsupported2d.set(what, (unsupported2d.get(what) || 0) + 1); missing('CanvasRenderingContext2D ' + what); }
  hidden(g, { __canvas2dUnsupported: () => Object.fromEntries(unsupported2d) });
  const COLOR_NAMES = {};
  'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32'.split(' ').forEach((k, i, all) => { if (!(i & 1)) COLOR_NAMES[k] = all[i + 1]; });
  for (const k of ['gray', 'darkgray', 'darkslategray', 'dimgray', 'lightgray', 'lightslategray', 'slategray']) COLOR_NAMES[k.replace('gray', 'grey')] = COLOR_NAMES[k];
  // A CSS colour as [r, g, b, a] in 0..1, null when it is not one (the assignment is then ignored, as the specification says): a name, #rgb,
  // #rgba, #rrggbb, #rrggbbaa, rgb() and hsl() with commas or spaces
  const colors = new Map();
  function parseColor(v) {
    if (typeof v !== 'string') return null;
    let c = colors.get(v);
    if (c !== undefined) return c;
    let s = v.trim().toLowerCase(), m;
    if (COLOR_NAMES[s]) s = '#' + COLOR_NAMES[s];
    c = null;
    if (s === 'transparent') c = [0, 0, 0, 0];
    else if ((m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s))) {
      const h = m[1].length < 6 ? m[1].replace(/./g, '$&$&') : m[1];
      c = [0, 2, 4, 6].map(i => i < h.length ? parseInt(h.slice(i, i + 2), 16) / 255 : 1);
    } else if ((m = /^(rgb|hsl)a?\(\s*([^)]*?)\s*\)$/.exec(s))) {
      const p = m[2].split(/[\s,\/]+/), n = (t, full) => t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t) / full;
      if (p.length === 3 || p.length === 4) {
        const a = p.length === 4 ? n(p[3], 1) : 1;
        if (m[1] === 'rgb') c = [n(p[0], 255), n(p[1], 255), n(p[2], 255), a];
        else {
          const h = parseFloat(p[0]), sat = Math.min(1, Math.max(0, parseFloat(p[1]) / 100)), l = Math.min(1, Math.max(0, parseFloat(p[2]) / 100)), q = sat * Math.min(l, 1 - l);
          const f = i => { const k = (((i + h / 30) % 12) + 12) % 12; return l - q * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
          c = [f(0), f(8), f(4), a];
        }
        c = c.some(isNaN) ? null : c.map(x => Math.min(1, Math.max(0, x)));
      }
    }
    if (colors.size > 1024) colors.clear();
    colors.set(v, c);
    return c;
  }
  const cssColor = c => c[3] >= 1 ? '#' + c.slice(0, 3).map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('') : 'rgba(' + c.slice(0, 3).map(x => Math.round(x * 255)).join(', ') + ', ' + +c[3].toFixed(3) + ')';
  class CanvasGradient {
    constructor(op, numbers) { hidden(this, { _op: op, _numbers: numbers, _stops: [] }); }
    addColorStop(offset, color) {
      const c = parseColor(color);
      if (!(offset >= 0 && offset <= 1)) throw new DOMException('The offset of a colour stop is between 0 and 1', 'IndexSizeError');
      if (!c) throw new DOMException("'" + color + "' is not a colour", 'SyntaxError');
      this._stops.push([+offset, c]);
    }
  }
  class CanvasPattern { setTransform() {} }
  class TextMetrics {
    constructor(m) {
      [this.width, this.actualBoundingBoxLeft, this.actualBoundingBoxRight, this.actualBoundingBoxAscent, this.actualBoundingBoxDescent, this.fontBoundingBoxAscent, this.fontBoundingBoxDescent,
        this.emHeightAscent, this.emHeightDescent, this.hangingBaseline, this.alphabeticBaseline, this.ideographicBaseline] = m;
    }
  }
  // Fonts. The families a program registered (FontFace, document.fonts) are theirs; the others come from the three bundled faces (lib/fonts):
  // the monospaced one for a monospace family, the sans one, regular or bold, for the generic families and when nothing else is left.
  // There is no italic face and no bold monospaced one.
  const families = new Map();   // family in lower case -> [FontFace]
  const bundled = name => c2d.font(name);
  const fontCache = new Map();
  let fontEpoch = 0;   // a family registered or removed: the faces of a font string may have changed
  function parseFont(v) {
    const key = fontEpoch + ' ' + v;
    let f = fontCache.get(key);
    if (f !== undefined) return f;
    const m = /^\s*(.*?)\s*(\d*\.?\d+)(px|pt|pc|in|cm|mm|q|em|rem|%)(?:\s*\/\s*[^\s,]+)?\s+(\S.*?)\s*$/i.exec(String(v));
    f = null;
    if (m && /^(\s*(normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00|(ultra-|extra-|semi-)?(condensed|expanded)))*\s*$/i.test(m[1])) {
      const px = +m[2] * { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, em: 16, rem: 16, '%': 0.16 }[m[3].toLowerCase()];
      const bold = /\b(bold|bolder|[6-9]00)\b/i.test(m[1]), faces = [];
      const add = id => { if (id >= 0 && !faces.includes(id)) faces.push(id); };
      for (const name of m[4].split(',').map(t => t.trim().replace(/^(["'])(.*)\1$/, '$2').toLowerCase())) {
        const own = families.get(name);
        if (own) { const fit = own.filter(o => o._id >= 0); for (const o of fit) if (/^(bold|[6-9]00)$/.test(o.weight) === bold) add(o._id); for (const o of fit) add(o._id); }
        else if (/mono|courier|consolas|menlo/.test(name)) add(bundled('JetBrainsMono-Regular.ttf'));
        else if (/^(sans-serif|serif|system-ui|ui-sans-serif|ui-serif|ui-rounded|cursive|fantasy|math)$/.test(name)) add(bundled(bold ? 'Inter-Bold.ttf' : 'Inter-Regular.ttf'));
      }   // a family that is not here is passed over, as a browser passes over one that is not installed
      add(bundled(bold ? 'Inter-Bold.ttf' : 'Inter-Regular.ttf'));   // the last resort of every list
      const style = m[1].toLowerCase().split(/\s+/).filter(t => t && t !== 'normal').join(' ');
      f = { px, faces, text: (style ? style + ' ' : '') + +px.toFixed(3) + 'px ' + m[4] };
    }
    if (fontCache.size > 256) fontCache.clear();
    fontCache.set(key, f);
    return f;
  }
  // A font of the program's own: bytes, or url(...) of one of its files or of a data: URL. Fonts from the network are refused: the reader
  // of glyph outlines (stb_truetype) is not made for a hostile file.
  class FontFace {
    constructor(family, source, descriptors) {
      const d = descriptors || {};
      this.family = String(family).replace(/^(["'])(.*)\1$/, '$2'); this.style = d.style || 'normal'; this.weight = String(d.weight || 'normal'); this.stretch = d.stretch || 'normal';
      this.unicodeRange = d.unicodeRange || 'U+0-10FFFF'; this.variant = 'normal'; this.featureSettings = 'normal'; this.display = d.display || 'auto'; this.status = 'unloaded';
      hidden(this, { _src: source, _id: -1, _load: null });
      if (typeof source !== 'string') this.load().catch(() => {});
    }
    get loaded() { return this.load(); }
    load() {
      if (this._load) return this._load;
      this.status = 'loading';
      const src = this._src, url = typeof src === 'string' ? /url\(\s*(["']?)(.*?)\1\s*\)/.exec(src) : null;
      const bytes = typeof src !== 'string' ? Promise.resolve(src) : new Promise(resolve => { const r = url ? local(absolute(url[2])) : null; resolve(r && r.status === 200 ? r.body : null); });
      return this._load = bytes.then(b => {
        this._id = b ? c2d.font(b) : -1;
        this.status = this._id < 0 ? 'error' : 'loaded';
        if (this._id < 0) throw new DOMException("the font '" + this.family + "' is not a TrueType file of the program (a font is not taken from the network)", 'SyntaxError');
        fontEpoch++;
        return this;
      });
    }
  }
  class FontFaceSet extends EventTarget {
    constructor() { super(); this.status = 'loaded'; hidden(this, { _all: new Set() }); }
    get ready() { return Promise.all([...this._all].map(f => f.load().catch(() => null))).then(() => this); }
    get size() { return this._all.size; }
    add(f) { this._all.add(f); const k = f.family.toLowerCase(); families.set(k, (families.get(k) || []).filter(o => o !== f).concat(f)); fontEpoch++; return this; }
    delete(f) { const k = f.family.toLowerCase(), had = this._all.delete(f); families.set(k, (families.get(k) || []).filter(o => o !== f)); if (!families.get(k).length) families.delete(k); fontEpoch++; return had; }
    clear() { for (const f of [...this._all]) this.delete(f); }
    has(f) { return this._all.has(f); }
    forEach(fn, self) { for (const f of this._all) fn.call(self, f, f, this); }
    values() { return this._all.values(); }
    keys() { return this._all.values(); }
    entries() { return this._all.entries(); }
    [Symbol.iterator]() { return this._all.values(); }
    check(font) { const f = parseFont(font); return !!f; }   // every family has a face here (its own or a bundled one)
    load(font) { const f = parseFont(font), names = f ? f.text.slice(f.text.indexOf('px ') + 3).split(',').map(t => t.trim().replace(/^(["'])(.*)\1$/, '$2').toLowerCase()) : []; return Promise.all(names.flatMap(n => families.get(n) || []).map(o => o.load())); }
  }
  const CAPS = { butt: 0, square: 1, round: 2 }, JOINS = { miter: 0, bevel: 1, round: 2 }, ALIGN = { start: 0, end: 1, left: 2, right: 3, center: 4 };
  const BASELINE = { alphabetic: 0, top: 1, hanging: 2, middle: 3, ideographic: 4, bottom: 5 };
  const COMPOSITE = { 'source-in': 1, copy: 2, 'source-out': 3, 'destination-in': 4, 'destination-atop': 7, lighter: 10, 'destination-over': 11, 'destination-out': 12, 'source-atop': 13, 'source-over': 14, xor: 15 };
  const freshState = () => ({ fillStyle: '#000000', strokeStyle: '#000000', fillStops: -1, strokeStops: -1, globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    miterLimit: 10, lineDashOffset: 0, dash: [], font: '10px sans-serif', parsed: parseFont('10px sans-serif'), textAlign: 'start', textBaseline: 'alphabetic', direction: 'ltr', letterSpacing: '0px', spacing: 0,
    shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)', shadowOffsetX: 0, shadowOffsetY: 0, m: [1, 0, 0, 1, 0, 0],
    filter: 'none', imageSmoothingEnabled: true, imageSmoothingQuality: 'low', fontKerning: 'auto', wordSpacing: '0px', fontStretch: 'normal', fontVariantCaps: 'normal', textRendering: 'auto' });
  const mul = (m, a, b, c, d, e, f) => [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
  const finite = (...n) => n.every(Number.isFinite);
  class CanvasRenderingContext2D {
    constructor(canvas) { this.canvas = canvas; hidden(this, { _b: c2d.create(canvas.width, canvas.height), _s: freshState(), _stack: [] }); }
    _reset() { c2d.resize(this._b, this.canvas.width, this.canvas.height); this._s = freshState(); this._stack = []; }   // the canvas was given a size: a new bitmap, the first state
    getContextAttributes() { return { alpha: true, colorSpace: 'srgb', desynchronized: false, willReadFrequently: false }; }
    isContextLost() { return false; }
    save() { this._stack.push({ ...this._s, dash: this._s.dash.slice(), m: this._s.m.slice() }); c2d.op(this._b, OP.save); }
    restore() { if (this._stack.length) { this._s = this._stack.pop(); c2d.op(this._b, OP.restore); } }
    reset() { this._reset(); }
    // transforms: the matrix is kept here too, for getTransform
    scale(x, y) { if (finite(x, y)) { this._s.m = mul(this._s.m, x, 0, 0, y, 0, 0); c2d.op(this._b, OP.scale, x, y); } }
    rotate(a) { if (finite(a)) { const c = Math.cos(a), s = Math.sin(a); this._s.m = mul(this._s.m, c, s, -s, c, 0, 0); c2d.op(this._b, OP.rotate, a); } }
    translate(x, y) { if (finite(x, y)) { this._s.m = mul(this._s.m, 1, 0, 0, 1, x, y); c2d.op(this._b, OP.translate, x, y); } }
    transform(a, b, c, d, e, f) { if (finite(a, b, c, d, e, f)) { this._s.m = mul(this._s.m, a, b, c, d, e, f); c2d.op(this._b, OP.transform, a, b, c, d, e, f); } }
    setTransform(a, b, c, d, e, f) {
      if (a === undefined) [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0];
      else if (typeof a === 'object' && a) ({ a, b, c, d, e, f } = a);
      if (finite(a, b, c, d, e, f)) { this._s.m = [a, b, c, d, e, f]; c2d.op(this._b, OP.setTransform, a, b, c, d, e, f); }
    }
    resetTransform() { this.setTransform(1, 0, 0, 1, 0, 0); }
    getTransform() { const [a, b, c, d, e, f] = this._s.m, v = { a, b, c, d, e, f, is2D: true, isIdentity: a === 1 && !b && !c && d === 1 && !e && !f }; return typeof g.DOMMatrix === 'function' ? new g.DOMMatrix([a, b, c, d, e, f]) : v; }
    // styles
    get fillStyle() { return this._s.fillStyle; } set fillStyle(v) { this._style('fillStyle', 0, v); }
    get strokeStyle() { return this._s.strokeStyle; } set strokeStyle(v) { this._style('strokeStyle', 1, v); }
    _style(key, which, v) {
      const s = this._s;
      if (v instanceof CanvasGradient) { s[key] = v; s[which ? 'strokeStops' : 'fillStops'] = -1; return; }   // sent with its stops when something is drawn (_sync)
      if (v instanceof CanvasPattern) return unsupported('pattern as ' + key);
      const c = parseColor(v);
      if (c) { s[key] = cssColor(c); c2d.op(this._b, OP.color, which, c[0], c[1], c[2], c[3]); }
    }
    _sync() {   // a gradient reaches the bitmap with the stops it has now: they may be added after it became the style
      const s = this._s;
      for (const [key, count, which] of [['fillStyle', 'fillStops', 0], ['strokeStyle', 'strokeStops', 1]]) {
        const v = s[key];
        if (typeof v === 'string' || s[count] === v._stops.length) continue;
        c2d.op(this._b, v._op, which, ...v._numbers);
        for (const [o, c] of v._stops) c2d.op(this._b, OP.stop, which, o, c[0], c[1], c[2], c[3]);
        s[count] = v._stops.length;
      }
    }
    createLinearGradient(x0, y0, x1, y1) { return new CanvasGradient(OP.linear, [x0, y0, x1, y1]); }
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return new CanvasGradient(OP.radial, [x0, y0, r0, x1, y1, r1]); }
    createConicGradient() { unsupported('createConicGradient'); return new CanvasPattern(); }
    createPattern() { unsupported('createPattern'); return new CanvasPattern(); }
    get globalAlpha() { return this._s.globalAlpha; } set globalAlpha(v) { v = +v; if (v >= 0 && v <= 1) { this._s.globalAlpha = v; c2d.op(this._b, OP.globalAlpha, v); } }
    get globalCompositeOperation() { return this._s.globalCompositeOperation; }
    set globalCompositeOperation(v) { if (COMPOSITE[v] === undefined) return unsupported("globalCompositeOperation '" + v + "'"); this._s.globalCompositeOperation = v; c2d.op(this._b, OP.composite, COMPOSITE[v]); }
    get shadowColor() { return this._s.shadowColor; } set shadowColor(v) { const c = parseColor(v); if (c) { this._s.shadowColor = cssColor(c); c2d.op(this._b, OP.shadowColor, c[0], c[1], c[2], c[3]); } }
    get shadowBlur() { return this._s.shadowBlur; } set shadowBlur(v) { v = +v; if (v >= 0 && isFinite(v)) { this._s.shadowBlur = v; c2d.op(this._b, OP.shadowBlur, v); } }
    get shadowOffsetX() { return this._s.shadowOffsetX; } set shadowOffsetX(v) { v = +v; if (isFinite(v)) { this._s.shadowOffsetX = v; c2d.op(this._b, OP.shadowOffset, v, this._s.shadowOffsetY); } }
    get shadowOffsetY() { return this._s.shadowOffsetY; } set shadowOffsetY(v) { v = +v; if (isFinite(v)) { this._s.shadowOffsetY = v; c2d.op(this._b, OP.shadowOffset, this._s.shadowOffsetX, v); } }
    get lineWidth() { return this._s.lineWidth; } set lineWidth(v) { v = +v; if (v > 0 && isFinite(v)) { this._s.lineWidth = v; c2d.op(this._b, OP.lineWidth, v); } }
    get lineCap() { return this._s.lineCap; } set lineCap(v) { if (v in CAPS) { this._s.lineCap = v; c2d.op(this._b, OP.lineCap, CAPS[v]); } }
    get lineJoin() { return this._s.lineJoin; } set lineJoin(v) { if (v in JOINS) { this._s.lineJoin = v; c2d.op(this._b, OP.lineJoin, JOINS[v]); } }
    get miterLimit() { return this._s.miterLimit; } set miterLimit(v) { v = +v; if (v > 0 && isFinite(v)) { this._s.miterLimit = v; c2d.op(this._b, OP.miterLimit, v); } }
    get lineDashOffset() { return this._s.lineDashOffset; } set lineDashOffset(v) { v = +v; if (isFinite(v)) { this._s.lineDashOffset = v; c2d.op(this._b, OP.dashOffset, v); } }
    setLineDash(list) { const d = Array.from(list, Number); if (d.some(n => !(n >= 0) || !isFinite(n))) return; this._s.dash = d.length & 1 ? d.concat(d) : d; c2d.dash(this._b, this._s.dash); }
    getLineDash() { return this._s.dash.slice(); }
    get font() { return this._s.font; } set font(v) { const f = parseFont(v); if (f) { this._s.font = f.text; this._s.parsed = f; } }
    get textAlign() { return this._s.textAlign; } set textAlign(v) { if (v in ALIGN) this._s.textAlign = v; }
    get textBaseline() { return this._s.textBaseline; } set textBaseline(v) { if (v in BASELINE) this._s.textBaseline = v; }
    get direction() { return this._s.direction; } set direction(v) { if (v === 'ltr' || v === 'rtl' || v === 'inherit') this._s.direction = v; }
    get letterSpacing() { return this._s.letterSpacing; } set letterSpacing(v) { const m = /^\s*(-?\d*\.?\d+)(px)?\s*$/.exec(v); if (m) { this._s.spacing = +m[1]; this._s.letterSpacing = +m[1] + 'px'; } }
    get filter() { return this._s.filter; } set filter(v) { if (v !== 'none' && v) unsupported('filter'); else this._s.filter = 'none'; }
    // paths
    beginPath() { c2d.op(this._b, OP.beginPath); }
    closePath() { c2d.op(this._b, OP.closePath); }
    moveTo(x, y) { c2d.op(this._b, OP.moveTo, x, y); }
    lineTo(x, y) { c2d.op(this._b, OP.lineTo, x, y); }
    quadraticCurveTo(cx, cy, x, y) { c2d.op(this._b, OP.quadTo, cx, cy, x, y); }
    bezierCurveTo(ax, ay, bx, by, x, y) { c2d.op(this._b, OP.bezierTo, ax, ay, bx, by, x, y); }
    arcTo(x1, y1, x2, y2, r) { if (r < 0) throw new DOMException('The radius is negative', 'IndexSizeError'); c2d.op(this._b, OP.arcTo, x1, y1, x2, y2, r); }
    arc(x, y, r, start, end, ccw) { if (r < 0) throw new DOMException('The radius is negative', 'IndexSizeError'); c2d.op(this._b, OP.arc, x, y, r, start, end, ccw ? 1 : 0); }
    ellipse(x, y, rx, ry, rotation, start, end, ccw) {   // a circle of radius 1 under the ellipse's own transform; the path keeps the points, the transform is put back
      if (rx < 0 || ry < 0) throw new DOMException('A radius is negative', 'IndexSizeError');
      if (!finite(x, y, rx, ry, rotation, start, end)) return;
      const b = this._b, m = this._s.m;
      c2d.op(b, OP.translate, x, y); c2d.op(b, OP.rotate, rotation); c2d.op(b, OP.scale, rx, ry);
      c2d.op(b, OP.arc, 0, 0, 1, start, end, ccw ? 1 : 0);
      c2d.op(b, OP.setTransform, m[0], m[1], m[2], m[3], m[4], m[5]);
    }
    rect(x, y, w, h) { c2d.op(this._b, OP.rect, x, y, w, h); }
    roundRect(x, y, w, h, radii = 0) {   // ponytail: circular corners; an elliptical one ({ x, y }) takes its x, and a negative size is drawn square
      const r = (Array.isArray(radii) ? radii : [radii]).map(v => typeof v === 'object' && v ? +v.x : +v);
      if (r.some(v => v < 0)) throw new RangeError('A radius of roundRect is negative');
      if (!finite(x, y, w, h, ...r)) return;
      if (w < 0 || h < 0 || !r.some(v => v > 0)) return this.rect(x, y, w, h);
      const [tl, tr, br, bl] = r.length === 1 ? [r[0], r[0], r[0], r[0]] : r.length === 2 ? [r[0], r[1], r[0], r[1]] : r.length === 3 ? [r[0], r[1], r[2], r[1]] : r;
      const k = Math.min(1, w / (tl + tr), w / (bl + br), h / (tl + bl), h / (tr + br));   // corners that would overlap shrink together
      this.moveTo(x + tl * k, y); this.arcTo(x + w, y, x + w, y + h, tr * k); this.arcTo(x + w, y + h, x, y + h, br * k); this.arcTo(x, y + h, x, y, bl * k); this.arcTo(x, y, x + w, y, tl * k);
      this.closePath();
    }
    _paint(op, what, a, b) {   // fill, stroke and clip of the current path; a Path2D or the even-odd rule is not in this tier
      if (a && typeof a === 'object') return unsupported(what + '(Path2D)');
      if (a === 'evenodd' || b === 'evenodd') unsupported(what + " 'evenodd' (non-zero rule)");
      this._sync(); c2d.op(this._b, op);
    }
    fill(a, b) { this._paint(OP.fill, 'fill', a, b); }
    stroke(a) { this._paint(OP.stroke, 'stroke', a); }
    clip(a, b) { this._paint(OP.clip, 'clip', a, b); }
    isPointInPath(x, y) { if (typeof x === 'object') { unsupported('isPointInPath(Path2D)'); return false; } return !!c2d.op(this._b, OP.inPath, x, y); }
    isPointInStroke() { unsupported('isPointInStroke'); return false; }
    drawFocusIfNeeded() { unsupported('drawFocusIfNeeded'); }
    scrollPathIntoView() { unsupported('scrollPathIntoView'); }
    clearRect(x, y, w, h) { c2d.op(this._b, OP.clearRect, x, y, w, h); }
    fillRect(x, y, w, h) { this._sync(); c2d.op(this._b, OP.fillRect, x, y, w, h); }
    strokeRect(x, y, w, h) { this._sync(); c2d.op(this._b, OP.strokeRect, x, y, w, h); }
    // text
    _text(stroke, text, x, y, maxWidth) {
      const s = this._s;
      if (maxWidth !== undefined && !(maxWidth > 0)) return;
      this._sync();
      c2d.text(this._b, stroke, x, y, maxWidth === undefined ? 0 : maxWidth, String(text), s.parsed.faces, s.parsed.px, s.spacing, s.direction === 'rtl' ? 1 : 0, ALIGN[s.textAlign], BASELINE[s.textBaseline]);
    }
    fillText(text, x, y, maxWidth) { this._text(false, text, x, y, maxWidth); }
    strokeText(text, x, y, maxWidth) { this._text(true, text, x, y, maxWidth); }
    measureText(text) {
      const s = this._s;
      return new TextMetrics(c2d.measure(String(text), s.parsed.faces, s.parsed.px, s.spacing, s.direction === 'rtl' ? 1 : 0, ALIGN[s.textAlign], BASELINE[s.textBaseline]) || new Array(12).fill(0));
    }
    // pixels
    drawImage(src, ...a) {
      const p = g.__srcPixels(src);
      if (!p) { if (!(src instanceof HTMLElement)) unsupported('drawImage of this source'); return; }   // an image that has not loaded draws nothing
      let [sx, sy, sw, sh, dx, dy, dw, dh] = a.length >= 8 ? a : [0, 0, p.width, p.height, a[0], a[1], a.length >= 4 ? a[2] : p.width, a.length >= 4 ? a[3] : p.height];
      if (!finite(sx, sy, sw, sh, dx, dy, dw, dh) || !sw || !sh) return;
      // the part of the source rectangle that is in the picture, in whole pixels, and the part of the destination it covers
      // ponytail: a source rectangle on half pixels is rounded; an exact one needs the picture resampled first (ZN-572)
      const x0 = Math.max(0, Math.round(sx)), y0 = Math.max(0, Math.round(sy)), x1 = Math.min(p.width, Math.round(sx + sw)), y1 = Math.min(p.height, Math.round(sy + sh));
      if (!(x1 > x0 && y1 > y0)) return;
      const kx = dw / sw, ky = dh / sh;
      c2d.image(this._b, p.data, p.width, p.height, x0, y0, x1 - x0, y1 - y0, dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
    }
    getImageData(x, y, w, h) {
      if (!w || !h) throw new DOMException('The source width or height is 0', 'IndexSizeError');
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      return new ImageData(new Uint8ClampedArray(c2d.read(this._b, Math.round(x), Math.round(y), w, h)), w, h);
    }
    createImageData(w, h) { return typeof w === 'object' ? new ImageData(w.width, w.height) : new ImageData(Math.max(1, Math.abs(w) | 0), Math.max(1, Math.abs(h) | 0)); }
    putImageData(d, x, y, dx = 0, dy = 0, dw = d.width, dh = d.height) {
      const x0 = Math.max(0, dx | 0), y0 = Math.max(0, dy | 0), x1 = Math.min(d.width, (dx | 0) + (dw | 0)), y1 = Math.min(d.height, (dy | 0) + (dh | 0));
      if (x1 > x0 && y1 > y0 && finite(x, y)) c2d.write(this._b, d.data, d.width, d.height, x | 0, y | 0, x0, y0, x1 - x0, y1 - y0);
    }
  }
  for (const k of ['imageSmoothingEnabled', 'imageSmoothingQuality', 'fontKerning', 'wordSpacing', 'fontStretch', 'fontVariantCaps', 'textRendering'])   // kept and given back; they change nothing drawn
    Object.defineProperty(CanvasRenderingContext2D.prototype, k, { get() { return this._s[k]; }, set(v) { this._s[k] = v; }, configurable: true });
  class ImageData {
    constructor(a, b, c) {
      if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c === undefined ? a.length / 4 / b : c; }
      this.colorSpace = 'srgb';
    }
  }
  // The pixels of an image file, { data: RGBA8 rows from the top, alpha not premultiplied, width, height }, or null: the engine's codec decodes
  // (PNG, JPEG, BMP, the first frame of a GIF, WebP). An image larger than the environment takes is refused by name, not by a crash.
  function decodeImage(bytes) {
    try { const d = native.decodeImage(bytes.buffer, bytes.byteOffset, bytes.byteLength); return d ? { data: new Uint8ClampedArray(d.data), width: d.width, height: d.height } : null; }
    catch (err) { writeErr('zinc: ' + err.message + '\n'); return null; }
  }
  // An image element. Its src is loaded as fetch loads it (the project's files, data: and blob: URLs, the network) and decoded; it is then a
  // texture source (texImage2D reads _pixels()). In the order a browser gives: setting src makes `complete` false at once; later, in a task of
  // its own, either the natural size is known, `complete` is true and `load` fires, or `complete` is true with no size and `error` fires.
  // A src set again abandons the load before it: that one fires nothing.
  class HTMLImageElement extends HTMLElement {
    constructor(tag = 'img') { super(tag); this.crossOrigin = null; this.decoding = 'auto'; this.loading = 'eager'; this.alt = ''; hidden(this, { _img: null, _req: 0, _loading: false }); }
    get src() { const v = this.getAttribute('src'); return v === null || v === '' ? '' : absolute(v); }
    set src(v) { this.setAttribute('src', v); }
    get currentSrc() { return this.src; }
    get complete() { return !this._loading; }
    get naturalWidth() { return this._img ? this._img.width : 0; }
    get naturalHeight() { return this._img ? this._img.height : 0; }
    get width() { const v = this.getAttribute('width'); return v === null ? this.naturalWidth : +v || 0; }   // the attribute, else the picture's own size
    set width(v) { this.setAttribute('width', v); }
    get height() { const v = this.getAttribute('height'); return v === null ? this.naturalHeight : +v || 0; }
    set height(v) { this.setAttribute('height', v); }
    setAttribute(k, v) {
      super.setAttribute(k, v);
      if (k !== 'src') return;
      const req = ++this._req, url = String(v);
      this._img = null; this._loading = true;
      const settle = img => setTimeout(() => {
        if (req !== this._req) return;
        this._img = img; this._loading = false;
        dispatch(this, new Event(img ? 'load' : 'error'));
      }, 0);
      if (url === '') return settle(null);
      let bytes;
      try { bytes = load(absolute(url), 'GET', [], new Uint8Array(0)); } catch (err) { bytes = Promise.reject(err); }   // (a data: URL that is not one)
      bytes.then(r => r.status === 200 ? decodeImage(r.body) : null, () => null).then(settle);
    }
    removeAttribute(k) { super.removeAttribute(k); if (k === 'src') { this._req++; this._img = null; this._loading = false; } }
    decode() {   // settles when the load does: resolved for a picture, EncodingError for none
      return new Promise((resolve, reject) => {
        const req = this._req, answer = () => req === this._req && this._img ? resolve() : reject(new DOMException('The source image cannot be decoded', 'EncodingError'));
        if (!this._loading) return answer();
        const done = () => { this.removeEventListener('load', done); this.removeEventListener('error', done); answer(); };
        this.addEventListener('load', done); this.addEventListener('error', done);
      });
    }
    _pixels() { return this._img; }
  }
  function Image(width, height) {   // new Image(w, h): an img element that is in no document
    const i = new HTMLImageElement();
    if (width !== undefined) i.width = +width;
    if (height !== undefined) i.height = +height;
    return i;
  }
  Image.prototype = HTMLImageElement.prototype;
  // There is no createImageBitmap, on purpose, until there is a Worker (the two come together in every browser): PixiJS 7 and 8, finding
  // createImageBitmap, load every picture through a Worker they make without asking whether one exists, and fail. Without it they, three.js's
  // GLTFLoader and Phaser load pictures through image elements, unmodified. (An implementation and its tests are in the history: ZN-569.)
  const TAGS = { canvas: HTMLCanvasElement, img: HTMLImageElement, audio: HTMLAudioElement, video: HTMLVideoElement };
  let captured = null;   // the element holding the pointer (setPointerCapture)

  class Document extends Node {
    constructor() { super(9, '#document'); this.readyState = 'interactive'; this.title = ''; this.cookie = ''; this.referrer = ''; this.characterSet = 'UTF-8'; this.compatMode = 'CSS1Compat'; this.contentType = 'text/html'; }
    createElement(tag) {
      tag = String(tag).toLowerCase();
      return tag === 'canvas' ? newCanvas() : new (TAGS[tag] || HTMLElement)(tag);
    }
    createElementNS(ns, tag) { return this.createElement(tag); }
    createTextNode(data) { return new Text(data); }
    createComment(data) { const n = new Node(8, '#comment'); n.data = String(data); return n; }
    createDocumentFragment() { return new DocumentFragment(); }
    createEvent(kind) { return new ({ CustomEvent, MouseEvent, MouseEvents: MouseEvent, UIEvent, UIEvents: UIEvent, KeyboardEvent }[kind] || Event)(''); }   // the old way: then initEvent
    get documentElement() { return html; }
    get head() { return head; }
    get body() { return body; }
    get activeElement() { return active; }
    get defaultView() { return g.window; }
    get location() { return g.location; }
    get baseURI() { return g.location.href; }
    get URL() { return g.location.href; }
    get hidden() { return false; }
    get visibilityState() { return 'visible'; }
    get pointerLockElement() { return null; }
    get fullscreenElement() { return null; }
    get fullscreenEnabled() { return false; }
    get scripts() { return this.getElementsByTagName('script'); }
    get currentScript() { return null; }
    hasFocus() { return true; }
    exitPointerLock() {}
    exitFullscreen() { return Promise.resolve(); }
    elementFromPoint() { return hit(); }
    getElementById(id) { return walk(this, e => e.id === String(id), [], true)[0] || null; }
    getElementsByName(name) { return walk(this, e => e.getAttribute('name') === String(name), []); }
    querySelector(sel) { return walk(this, matcher(sel), [], true)[0] || null; }
    querySelectorAll(sel) { return walk(this, matcher(sel), []); }
    getElementsByTagName(tag) { return Element.prototype.getElementsByTagName.call(this, tag); }
    getElementsByClassName(c) { return Element.prototype.getElementsByClassName.call(this, c); }
  }
  const doc = new Document();
  doc.fonts = new FontFaceSet();
  const html = new HTMLElement('html'), head = new HTMLElement('head'), body = new HTMLElement('body');
  doc.appendChild(html); html.appendChild(head); html.appendChild(body);
  let active = body;   // the element the keys go to
  function focus(el) {
    if (active === el) return;
    const old = active;
    active = el;
    dispatch(old, new FocusEvent('blur', { relatedTarget: el })); dispatch(old, new FocusEvent('focusout', { bubbles: true, relatedTarget: el }));
    dispatch(el, new FocusEvent('focus', { relatedTarget: old })); dispatch(el, new FocusEvent('focusin', { bubbles: true, relatedTarget: old }));
  }
  // what is under the pointer: the last canvas of the document (the one drawn on top), else the body
  function hit() { const c = walk(doc, e => e.tagName === 'CANVAS', []); return c[c.length - 1] || body; }

  // ---- the window: the global object itself, so `window.x`, `self.x` and a bare `x` are one thing
  class Window extends EventTarget {}
  Object.setPrototypeOf(g, Window.prototype);
  const platform = g.__host_sysPlatform();
  const system = platform === 'macos' ? ['Macintosh; Intel Mac OS X 10_15_7', 'MacIntel'] : platform === 'windows' ? ['Windows NT 10.0; Win64; x64', 'Win32'] : ['X11; Linux x86_64', 'Linux x86_64'];
  const locale = g.__host_sysLocale() || 'en-US';
  const navigator = {   // a desktop Chrome by its name: libraries read the string to choose their workarounds, and Chrome's are the fewest
    userAgent: `Mozilla/5.0 (${system[0]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Zinc`,
    appName: 'Netscape', appVersion: `5.0 (${system[0]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Zinc`, product: 'Gecko', vendor: 'Zinc',
    platform: system[1], language: locale, languages: [locale], onLine: true, cookieEnabled: false, maxTouchPoints: 0, hardwareConcurrency: g.__host_osCpus() || 1,
    getGamepads: () => [],   // ZN-574
  };
  const page = 'file://' + encodeURI(native.base) + '/index.html';   // relative URLs resolve against the project's directory, as beside an index.html there
  const location = {
    href: page, protocol: 'file:', host: '', hostname: '', port: '', pathname: page.slice(7), search: '', hash: '', origin: 'file://',
    assign() {}, replace() {}, reload() {}, toString() { return this.href; },
  };
  const screen = {
    get width() { return g.innerWidth; }, get height() { return g.innerHeight; }, get availWidth() { return g.innerWidth; }, get availHeight() { return g.innerHeight; },
    colorDepth: 24, pixelDepth: 24, orientation: Object.assign(new EventTarget(), { type: 'landscape-primary', angle: 0, lock: () => Promise.resolve(), unlock() {} }),
  };
  class MediaQueryList extends EventTarget {   // nothing matches yet: no library's boot depends on a media query (add the features here when one does)
    constructor(media) { super(); this.media = String(media); this.matches = false; this.onchange = null; }
    addListener(f) { this.addEventListener('change', f); }
    removeListener(f) { this.removeEventListener('change', f); }
  }
  class MessagePort extends EventTarget {
    constructor() { super(); this.onmessage = null; hidden(this, { _other: null }); }
    postMessage(data) { const to = this._other; if (to) setTimeout(() => dispatch(to, new MessageEvent('message', { data })), 0); }
    start() {}
    close() { if (this._other) { this._other._other = null; this._other = null; } }
  }
  class MessageChannel { constructor() { this.port1 = new MessagePort(); this.port2 = new MessagePort(); this.port1._other = this.port2; this.port2._other = this.port1; } }
  class ResizeObserver {   // told once after observe(), then at each change of the window's size
    constructor(cb) { hidden(this, { _cb: cb, _els: new Set() }); }
    observe(el) { this._els.add(el); observers.add(this); setTimeout(() => { if (this._els.has(el)) this._tell([el]); }, 0); }
    unobserve(el) { this._els.delete(el); }
    disconnect() { this._els.clear(); observers.delete(this); }
    _tell(els) {
      const k = g.devicePixelRatio;
      this._cb(els.map(target => { const r = boxOf(target), size = [{ inlineSize: r.width, blockSize: r.height }]; return { target, contentRect: r, contentBoxSize: size, borderBoxSize: size, devicePixelContentBoxSize: [{ inlineSize: Math.round(r.width * k), blockSize: Math.round(r.height * k) }] }; }), this);
    }
  }
  const observers = new Set();
  class MutationObserver { observe() {} disconnect() {} takeRecords() { return []; } }   // the tree changes only by the program's own hand: nothing to report

  const seen = new Set();
  function missing(what) { if (native.trace && !seen.has(what)) { seen.add(what); writeErr('web: unknown ' + what + '\n'); } }
  if (native.trace) {   // ZINC_WEB=trace: each member a library reads on the window, the document or the navigator and does not find, once, on stderr
    const traced = (o, name) => new Proxy(o, { get(t, k) { if (typeof k === 'string' && !(k in t)) missing(name + '.' + k); return t[k]; } });
    winProxy = traced(g, 'window');
    g.document = docProxy = traced(doc, 'document');
    g.navigator = traced(navigator, 'navigator');
  } else { g.document = doc; g.navigator = navigator; }
  for (const k of ['window', 'self', 'top', 'parent', 'frames']) g[k] = winProxy || g;
  Object.assign(g, {
    location, screen, history: { length: 1, state: null, scrollRestoration: 'auto', pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} },
    name: '', closed: false, origin: 'null', isSecureContext: true, scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0, screenX: 0, screenY: 0, screenLeft: 0, screenTop: 0,
    DOMException, Event, CustomEvent, UIEvent, MouseEvent, PointerEvent, WheelEvent, KeyboardEvent, Touch, TouchEvent, FocusEvent, ErrorEvent, MessageEvent, PromiseRejectionEvent, ProgressEvent, EventTarget,
    Node, Text, DocumentFragment, Element, HTMLElement, HTMLCanvasElement, HTMLImageElement, HTMLMediaElement, HTMLAudioElement, HTMLVideoElement, Document, HTMLDocument: Document, Window,
    CSSStyleDeclaration, DOMTokenList, DOMRect, DOMRectReadOnly: DOMRect, MediaQueryList, MessageChannel, MessagePort, ResizeObserver, MutationObserver,
    structuredClone: native.structuredClone, reportError,
    matchMedia: q => new MediaQueryList(q),
    getComputedStyle(el) { const r = boxOf(el), s = newStyle(); Object.assign(s, el.style, { display: 'block', direction: 'ltr', width: r.width + 'px', height: r.height + 'px' }); return s; },
    postMessage(data) { setTimeout(() => dispatch(g, new MessageEvent('message', { data, origin: location.origin, source: g.window })), 0); },
    focus() {}, blur() {}, scroll() {}, scrollTo() {}, scrollBy() {}, print() {}, stop() {}, open: () => null, getSelection: () => null,
    alert: m => console.log(m), confirm: () => false, prompt: () => null,
    close() { g.__host_gfxQuit(); },
  });
  // the size and the pixel scale are the host's at the time of asking: the window's, or the headless surface's
  for (const [k, f] of [['innerWidth', g.__host_gfxWidth], ['innerHeight', g.__host_gfxHeight], ['outerWidth', g.__host_gfxWidth], ['outerHeight', g.__host_gfxHeight], ['devicePixelRatio', g.__host_gfxPixelScale]])
    Object.defineProperty(g, k, { get: () => f(), set() {}, configurable: true, enumerable: true });

  // ---- frames: requestAnimationFrame on the engine's frame loop, the host's input as DOM events before the callbacks
  // The engine enters its frame loop (and opens the window) when globalThis.__zincFrameCb is a function (src/qjs/qjs.cpp): the first
  // requestAnimationFrame or the first canvas put in the document asks for it. A program that also uses zinc:gfx's onFrame keeps it: its step
  // runs after the callbacks.
  let rafId = 0, rafQueue = [], gfxFrame = null, lastW = 0, lastH = 0;
  function wantFrames() {
    if (g.__zincFrameCb === frame) return;
    if (!lastW) { g.__host_gfxSetResize(1); lastW = g.innerWidth; lastH = g.innerHeight; }   // the surface follows the window, as a page does
    gfxFrame = typeof g.__zincFrameCb === 'function' ? g.__zincFrameCb : null;
    g.__zincFrameCb = frame;
  }
  function frame(dt) {
    input();
    if (g.innerWidth !== lastW || g.innerHeight !== lastH) {
      lastW = g.innerWidth; lastH = g.innerHeight;
      dispatch(g, new UIEvent('resize', { view: g.window }));
      for (const o of observers) if (o._els.size) o._tell([...o._els]);
    }
    const due = rafQueue, now = performance.now();
    rafQueue = [];
    for (const r of due) { try { r.cb(now); } catch (err) { reportError(err); } }
    present();
    if (gfxFrame) gfxFrame(dt);
  }
  // What the window shows: each canvas of the document that has a context (WebGL or 2D), over black, at the box its style gives it (its bitmap's size
  // without one). The drawing buffer goes through gl.zincPresent into a zinc:gfx image (ZN-411: a read, pipelined in a real run); a canvas that
  // draws straight into the window is the lane's presentation task.
  let presenting = true;
  function present() {
    if (!presenting) return;
    g.__host_gfxClear(0);
    for (const c of walk(doc, e => e.tagName === 'CANVAS', [])) {
      const gl = c.__gl;
      if (!gl && !c._2d) continue;
      try {
        if (!c._image) c._image = g.__host_gfxCreateImage(c.width, c.height);
        if (!(gl ? gl.zincPresent(c._image) : c2d.present(c._2d._b, c._image))) continue;
      } catch (err) { presenting = false; return; }   // an engine built without a surface to present on
      const r = boxOf(c);
      g.__host_gfxDrawImage(c._image, 0, 0, r.width, r.height, 255, 0);
    }
  }
  // texImage2D and texSubImage2D of the WebGL module ask here for the pixels of a DOM source: { data: RGBA8 top row first, width, height }.
  // An ImageData is one; a WebGL canvas is read back; an image element or a 2D canvas (ZN-570) answers through its own _pixels().
  // null: no pixels to give (an image that has not loaded).
  hidden(g, { __srcPixels(src) {
    if (!src) return null;
    if (src instanceof ImageData) return src;
    const gl = src.__gl;
    if (!gl) return typeof src._pixels === 'function' ? src._pixels() : null;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, raw = new Uint8Array(w * h * 4), data = new Uint8ClampedArray(w * h * 4);
    const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
    for (let y = 0; y < h; y++) data.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return { data, width: w, height: h };
  } });
  // A deterministic run (ZINC_DETERMINISTIC: tests and goldens) reads the virtual clock here too, so a library that paces itself by
  // performance.now draws the same frames at every run; a real run keeps the real clock (p5 and Phaser throttle on it).
  if (/^[^0]/.test(g.__host_sysEnv('ZINC_DETERMINISTIC')))   // QuickJS's own `now` cannot be replaced: an object over it
    Object.defineProperty(g, 'performance', { value: Object.create(performance, { now: { value: () => g.__clock() } }), writable: true, configurable: true, enumerable: true });
  g.requestAnimationFrame = cb => { wantFrames(); rafQueue.push({ id: ++rafId, cb }); return rafId; };
  g.cancelAnimationFrame = id => { rafQueue = rafQueue.filter(r => r.id !== id); };

  // The host's input of this frame (zinc:gfx's rows: the window's, or a ZINC_INPUT script's) as the events a browser sends, each dispatched once at
  // its target and left to bubble: the pointer's at the element under it (or the one that captured it), the keys' at the focused element.
  const NAMED = { Backspace: 8, Tab: 9, Enter: 13, Escape: 27, PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46 };
  const PUNCT = { ';': ['Semicolon', 186], '=': ['Equal', 187], ',': ['Comma', 188], '-': ['Minus', 189], '.': ['Period', 190], '/': ['Slash', 191], '`': ['Backquote', 192], '[': ['BracketLeft', 219], '\\': ['Backslash', 220], ']': ['BracketRight', 221], "'": ['Quote', 222] };
  function keyOf(name, shift) {   // the host's key name as key, code and the old keyCode (Phaser reads it)
    if (name.length !== 1) { const f = /^F(\d+)$/.exec(name); return { key: name, code: name, keyCode: f ? 111 + +f[1] : NAMED[name] || 0 }; }
    const up = name.toUpperCase();
    if (up >= 'A' && up <= 'Z') return { key: shift ? up : name.toLowerCase(), code: 'Key' + up, keyCode: up.charCodeAt(0) };
    if (name >= '0' && name <= '9') return { key: name, code: 'Digit' + name, keyCode: name.charCodeAt(0) };
    if (name === ' ') return { key: ' ', code: 'Space', keyCode: 32 };
    const p = PUNCT[name];
    return { key: name, code: p ? p[0] : '', keyCode: p ? p[1] : name.charCodeAt(0) };
  }
  const modsOf = m => ({ shiftKey: (m & 1) !== 0, ctrlKey: (m & 2) !== 0, altKey: (m & 4) !== 0, metaKey: (m & 8) !== 0 });
  let px = NaN, py = NaN, buttons = 0, pressedOn = null, lastClick = null, lastClickAt = -1e9;
  const touching = new Map();   // finger id -> Touch
  function input() {
    const h = g, x = h.__host_gfxPointerX(), y = h.__host_gfxPointerY();
    const at = (cx, cy, more) => ({ bubbles: true, cancelable: true, composed: true, view: g.window, clientX: cx, clientY: cy, screenX: cx, screenY: cy, buttons, ...modsOf(h.__host_gfxModifiers()), ...more });
    const pointer = init => ({ ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: buttons ? 0.5 : 0 });
    const send = (target, pointerType, mouseType, init) => { dispatch(target, new PointerEvent(pointerType, pointer(init))); dispatch(target, new MouseEvent(mouseType, init)); };
    if (x !== px || y !== py) {
      const target = captured || hit(), first = isNaN(px);
      if (first) { send(target, 'pointerover', 'mouseover', at(x, y)); send(target, 'pointerenter', 'mouseenter', { ...at(x, y), bubbles: false }); }
      const move = at(x, y, { movementX: first ? 0 : x - px, movementY: first ? 0 : y - py });
      dispatch(target, new PointerEvent('pointermove', pointer({ ...move, button: -1 })));
      dispatch(target, new MouseEvent('mousemove', move));
      px = x; py = y;
    }
    for (let i = 0, n = h.__host_gfxButtonEventCount(); i < n; i++) {
      const bx = h.__host_gfxButtonEventX(i), by = h.__host_gfxButtonEventY(i), button = h.__host_gfxButtonEventButton(i), down = h.__host_gfxButtonEventDown(i);   // 0 left, 1 middle, 2 right, as the DOM numbers them
      const bit = button === 0 ? 1 : button === 2 ? 2 : 4, target = captured || hit();
      buttons = down ? buttons | bit : buttons & ~bit;
      const init = at(bx, by, { button, detail: 1 });
      if (down) {
        send(target, 'pointerdown', 'mousedown', init);
        pressedOn = target;
        if (button === 2) dispatch(target, new MouseEvent('contextmenu', init));
      } else {
        send(target, 'pointerup', 'mouseup', init);
        if (!buttons) captured = null;   // the capture ends with the last button
        if (button === 0 && pressedOn === target) {
          dispatch(target, new MouseEvent('click', init));
          const now = performance.now();
          if (lastClick === target && now - lastClickAt < 500) { dispatch(target, new MouseEvent('dblclick', { ...init, detail: 2 })); lastClick = null; } else { lastClick = target; lastClickAt = now; }
        }
      }
    }
    // the wheel: the host counts notches upwards (and a trackpad's pixels), a browser pixels downwards, about 100 a notch
    const dy = -(h.__host_gfxWheel() * 100 + h.__host_gfxScrollDY()), dx = h.__host_gfxWheelX() * 100 + h.__host_gfxScrollDX();
    if (dx || dy) dispatch(captured || hit(), new WheelEvent('wheel', at(x, y, { deltaX: dx, deltaY: dy, deltaMode: 0 })));
    for (let i = 0, n = h.__host_gfxKeyCount(); i < n; i++) {
      const kind = h.__host_gfxKeyKind(i), name = h.__host_gfxKeyName(i), mods = modsOf(h.__host_gfxKeyMods(i));   // 0 down, 1 up, 2 repeat, 3 typed text
      const init = { bubbles: true, cancelable: true, composed: true, view: g.window, ...mods };
      if (kind === 3) { for (const ch of name) { const c = ch.codePointAt(0); dispatch(active, new KeyboardEvent('keypress', { ...init, key: ch, charCode: c, keyCode: c, which: c })); } continue; }
      const k = keyOf(name, mods.shiftKey);
      dispatch(active, new KeyboardEvent(kind === 1 ? 'keyup' : 'keydown', { ...init, key: k.key, code: k.code, keyCode: k.keyCode, which: k.keyCode, repeat: kind === 2 }));
    }
    // fingers: touchstart, touchmove and touchend with the lists a browser gives (the first finger is also the pointer above, as the host reports it)
    const now = new Map(), target = hit();
    for (let i = 0, n = h.__host_gfxTouchCount(); i < n; i++) { const tx = h.__host_gfxTouchX(i), ty = h.__host_gfxTouchY(i), id = h.__host_gfxTouchId(i); now.set(id, new Touch({ identifier: id, target, clientX: tx, clientY: ty, screenX: tx, screenY: ty, pageX: tx, pageY: ty })); }
    if (now.size || touching.size) {
      const started = [], moved = [], ended = [];
      for (const [id, t] of now) { const was = touching.get(id); if (!was) started.push(t); else if (was.clientX !== t.clientX || was.clientY !== t.clientY) moved.push(t); }
      for (const [id, t] of touching) if (!now.has(id)) ended.push(t);
      touching.clear();
      for (const [id, t] of now) touching.set(id, t);
      const touches = [...now.values()];
      for (const [type, changed] of [['touchstart', started], ['touchmove', moved], ['touchend', ended]])
        if (changed.length) dispatch(target, new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, view: g.window, touches, targetTouches: touches, changedTouches: changed, ...modsOf(h.__host_gfxModifiers()) }));
    }
  }

  // ---- URL, Blob and what a URL names
  // URL and URLSearchParams are the typed engine's (lib/std/web.ts, the WHATWG parser), loaded when the first URL is made: until then the two
  // classes are these shells, whose prototypes then inherit the real ones.
  let web = null;
  function realWeb() {
    if (!web) { web = native.module('zinc:web'); Object.setPrototypeOf(URL.prototype, web.URL.prototype); Object.setPrototypeOf(URLSearchParams.prototype, web.URLSearchParams.prototype); }
    return web;
  }
  const blobs = new Map();   // blob: URL -> Blob
  let blobId = 0;
  class URL {
    constructor(url, base) { return Object.setPrototypeOf(new (realWeb().URL)(String(url), base === undefined || base === null ? null : String(base)), URL.prototype); }
    static canParse(url, base) { try { new URL(url, base); return true; } catch (e) { return false; } }
    static createObjectURL(blob) { const u = 'blob:zinc/' + (++blobId); blobs.set(u, blob); return u; }
    static revokeObjectURL(u) { blobs.delete(String(u)); }
  }
  class URLSearchParams { constructor(init) { return Object.setPrototypeOf(new (realWeb().URLSearchParams)(init === undefined ? '' : init), URLSearchParams.prototype); } }
  const absolute = url => /^(data|blob):/i.test(url) ? url : new URL(url, g.location.href).href;
  const utf8 = new TextEncoder();
  const decode = b => native.decode(b.buffer, b.byteOffset, b.byteLength);
  function toBytes(x) {   // what a body or a blob part can be, as bytes
    if (x === null || x === undefined) return new Uint8Array(0);
    if (x instanceof Blob) return x._bytes;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    return utf8.encode(String(x));
  }
  class Blob {
    constructor(parts = [], options = {}) {
      const chunks = parts.map(toBytes), all = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
      let at = 0;
      for (const b of chunks) { all.set(b, at); at += b.length; }
      hidden(this, { _bytes: all });
      this.size = all.length; this.type = String(options.type || '').toLowerCase();
    }
    arrayBuffer() { return Promise.resolve(this._bytes.slice().buffer); }
    bytes() { return Promise.resolve(this._bytes.slice()); }
    text() { return Promise.resolve(decode(this._bytes)); }
    slice(start, end, type = '') { return new Blob([this._bytes.slice(start, end)], { type }); }
  }
  class File extends Blob {
    constructor(parts, name, options = {}) { super(parts, options); this.name = String(name); this.lastModified = options.lastModified === undefined ? Date.now() : options.lastModified; }
  }
  const TYPES = { json: 'application/json', js: 'text/javascript', mjs: 'text/javascript', txt: 'text/plain', html: 'text/html', css: 'text/css', xml: 'application/xml', fnt: 'application/xml', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
    glb: 'model/gltf-binary', gltf: 'model/gltf+json', wasm: 'application/wasm', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
  const answer = (url, status, body, type) => ({ url, status, statusText: status === 200 ? 'OK' : 'Not Found', headers: type ? [['content-type', type], ['content-length', String(body.length)]] : [], body });
  // A data:, blob: or file: URL answers at once, as { url, status, statusText, headers, body }; null for a URL of the network. A missing file is a
  // 404, as a server would say. A file URL is the file of that path; one that does not exist there is looked for under the project's directory, so
  // "/assets/a.png" written for a server's root finds the project's assets.
  function local(url) {
    if (/^data:/i.test(url)) {
      const comma = url.indexOf(','), head = comma < 0 ? '' : url.slice(5, comma), base64 = /;base64$/i.test(head);
      if (comma < 0) throw new TypeError('Failed to fetch: not a data URL');
      const data = url.slice(comma + 1);
      return answer(url, 200, base64 ? Uint8Array.fromBase64(decodeURIComponent(data)) : utf8.encode(decodeURIComponent(data)), head.replace(/;base64$/i, '') || 'text/plain;charset=US-ASCII');
    }
    if (/^blob:/i.test(url)) { const b = blobs.get(url); return b ? answer(url, 200, b._bytes, b.type) : answer(url, 404, new Uint8Array(0), ''); }
    if (!/^file:/i.test(url)) return null;
    const path = decodeURIComponent(new URL(url).pathname);
    let body = native.read(path);
    if (body === undefined && !path.startsWith(native.base + '/')) body = native.read(native.base + path);
    const ext = /\.([a-z0-9]+)$/i.exec(path);
    return body === undefined ? answer(url, 404, new Uint8Array(0), '') : answer(url, 200, new Uint8Array(body), ext && TYPES[ext[1].toLowerCase()] || 'application/octet-stream');
  }
  // The network is the host's (zinc:net's rows, so its permissions and limits hold). A request finishes as an event of the host's loop, which is
  // given a turn at each of ours while requests are out: a short wait when no frame paces the program.
  const pending = new Map();   // handle -> { resolve, reject }
  function pump() {
    for (let e = native.httpPoll(g.__zincFrameCb === frame ? 0 : 2); e !== undefined; e = native.httpPoll(0)) {
      const a = e.indexOf('\x1f'), b = e.indexOf('\x1f', a + 1), handle = +e.slice(0, a), p = pending.get(handle);
      if (!p) continue;
      pending.delete(handle);
      if (e.slice(a + 1, b) === '41') { p.reject(new TypeError('Failed to fetch: ' + e.slice(b + 1))); continue; }
      const r = native.httpTake(handle), nl = r.head.indexOf('\n');
      const headers = r.head.slice(nl + 1).split('\n').filter(l => l.includes(':')).map(l => [l.slice(0, l.indexOf(':')).trim().toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]);
      p.resolve({ url: r.url, status: r.status, statusText: r.head.slice(0, nl < 0 ? r.head.length : nl), headers, body: new Uint8Array(r.body) });
    }
    if (pending.size) setTimeout(pump, 1);
  }
  function load(url, method, headers, body) {
    return new Promise((resolve, reject) => {
      const now = local(url);
      if (now) return resolve(now);
      const handle = native.httpFetch(url, method, headers.map(([k, v]) => k + ': ' + v + '\n').join(''), decode(body));
      if (!handle) return reject(new TypeError('Failed to fetch: ' + (native.httpError() || url)));
      pending.set(handle, { resolve, reject });
      if (pending.size === 1) setTimeout(pump, 0);
    });
  }

  // ---- fetch and XMLHttpRequest over them
  class Headers {
    constructor(init) { hidden(this, { _m: new Map() }); if (init) for (const [k, v] of init instanceof Headers || Array.isArray(init) ? init : Object.entries(init)) this.append(k, v); }
    append(k, v) { k = String(k).toLowerCase(); const old = this._m.get(k); this._m.set(k, old === undefined ? String(v) : old + ', ' + v); }
    set(k, v) { this._m.set(String(k).toLowerCase(), String(v)); }
    get(k) { const v = this._m.get(String(k).toLowerCase()); return v === undefined ? null : v; }
    has(k) { return this._m.has(String(k).toLowerCase()); }
    delete(k) { this._m.delete(String(k).toLowerCase()); }
    forEach(f, self) { for (const [k, v] of this) f.call(self, v, k, this); }
    entries() { return [...this._m].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)[Symbol.iterator](); }
    keys() { return [...this.entries()].map(e => e[0])[Symbol.iterator](); }
    values() { return [...this.entries()].map(e => e[1])[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entries(); }
  }
  class Body {   // what a Request and a Response share: the bytes, read once. There are no streams: `body` is undefined, and libraries then read it whole
    _take() { if (this.bodyUsed) return Promise.reject(new TypeError('The body has already been read')); this.bodyUsed = true; return Promise.resolve(this._bytes); }
    arrayBuffer() { return this._take().then(b => b.slice().buffer); }
    bytes() { return this._take().then(b => b.slice()); }
    blob() { return this._take().then(b => new Blob([b], { type: this.headers.get('content-type') || '' })); }
    text() { return this._take().then(decode); }
    json() { return this.text().then(JSON.parse); }
  }
  class Request extends Body {
    constructor(input, init = {}) {
      super();
      const from = input instanceof Request ? input : null;
      this.url = from ? from.url : absolute(String(input)); this.method = String(init.method || (from ? from.method : 'GET')).toUpperCase();
      this.headers = new Headers(init.headers || (from ? from.headers : undefined)); this.signal = init.signal || (from ? from.signal : null);
      this.credentials = init.credentials || 'same-origin'; this.mode = init.mode || 'cors'; this.cache = init.cache || 'default'; this.redirect = init.redirect || 'follow'; this.bodyUsed = false;
      hidden(this, { _bytes: toBytes(init.body !== undefined ? init.body : from ? from._bytes : null) });
    }
    clone() { return new Request(this); }
  }
  class Response extends Body {
    constructor(body = null, init = {}) {
      super();
      this.status = init.status === undefined ? 200 : init.status; this.statusText = init.statusText || ''; this.ok = this.status >= 200 && this.status < 300;
      this.headers = new Headers(init.headers); this.type = 'basic'; this.url = ''; this.redirected = false; this.bodyUsed = false;
      if (body instanceof Blob && body.type && !this.headers.has('content-type')) this.headers.set('content-type', body.type);
      hidden(this, { _bytes: toBytes(body) });
    }
    clone() { const r = new Response(this._bytes, this); r.url = this.url; return r; }
    static json(data, init) { const r = new Response(JSON.stringify(data), init); if (!r.headers.has('content-type')) r.headers.set('content-type', 'application/json'); return r; }
  }
  const aborted = () => new DOMException('The operation was aborted', 'AbortError');
  function fetch(input, init) {
    return new Promise((resolve, reject) => {
      const req = new Request(input, init);
      if (req.signal) { if (req.signal.aborted) return reject(aborted()); req.signal.addEventListener('abort', () => reject(aborted())); }
      load(req.url, req.method, [...req.headers], req._bytes).then(r => { const res = new Response(r.body, r); res.url = r.url; resolve(res); }, reject);
    });
  }
  class XMLHttpRequestEventTarget extends EventTarget {}
  class XMLHttpRequest extends XMLHttpRequestEventTarget {
    constructor() {
      super();
      this.readyState = 0; this.status = 0; this.statusText = ''; this.response = null; this.responseText = ''; this.responseXML = null; this.responseType = ''; this.responseURL = '';
      this.timeout = 0; this.withCredentials = false; this.upload = new XMLHttpRequestEventTarget();
      hidden(this, { _req: null, _res: null });
    }
    _state(n) { this.readyState = n; dispatch(this, new Event('readystatechange')); }
    _progress(type, n) { dispatch(this, new ProgressEvent(type, { lengthComputable: true, loaded: n, total: n })); }
    open(method, url, async = true) { this._req = { method: String(method).toUpperCase(), url: absolute(String(url)), headers: [], async: async !== false, sent: false }; this._res = null; this.status = 0; this._state(1); }
    setRequestHeader(k, v) { this._req.headers.push([String(k), String(v)]); }
    overrideMimeType() {}
    getResponseHeader(k) { return this._res ? new Headers(this._res.headers).get(k) : null; }
    getAllResponseHeaders() { return this._res ? this._res.headers.map(([k, v]) => k + ': ' + v + '\r\n').join('') : ''; }
    abort() {
      const req = this._req;
      this._req = null;
      if (req && req.sent && this.readyState !== 4) { this.readyState = 4; this._progress('abort', 0); this._progress('loadend', 0); }
      this.readyState = 0;
    }
    send(body = null) {
      const req = this._req;
      if (!req || this.readyState !== 1 || req.sent) throw new DOMException('The request is not open', 'InvalidStateError');
      req.sent = true;
      const done = r => {
        if (this._req !== req) return;   // aborted, or opened again
        this._res = r; this.status = r.status; this.statusText = r.statusText; this.responseURL = r.url;
        this._state(2); this._state(3);
        const b = r.body, kind = this.responseType;
        if (kind === '' || kind === 'text') this.response = this.responseText = decode(b);
        else if (kind === 'json') { try { this.response = JSON.parse(decode(b)); } catch (e) { this.response = null; } }
        else if (kind === 'arraybuffer') this.response = b.slice().buffer;
        else if (kind === 'blob') this.response = new Blob([b], { type: new Headers(r.headers).get('content-type') || '' });
        else missing('XMLHttpRequest.responseType ' + kind);
        this._progress('progress', b.length);
        this._state(4);
        this._progress('load', b.length); this._progress('loadend', b.length);
      };
      const fail = () => { if (this._req !== req) return; this._state(4); this._progress('error', 0); this._progress('loadend', 0); };
      if (!req.async) {   // a synchronous request can only be answered by what answers at once
        const r = local(req.url);
        if (!r) throw new DOMException('A synchronous request over the network is not available', 'NetworkError');
        return done(r);
      }
      this._progress('loadstart', 0);
      load(req.url, req.method, req.headers, toBytes(body)).then(done, fail);
    }
  }
  for (const [k, v] of [['UNSENT', 0], ['OPENED', 1], ['HEADERS_RECEIVED', 2], ['LOADING', 3], ['DONE', 4]]) { XMLHttpRequest[k] = v; XMLHttpRequest.prototype[k] = v; }

  // ---- storage: localStorage is zinc:storage's (kept between runs), sessionStorage lives as long as the program; both by their methods only
  class Storage {
    constructor(kept) {
      hidden(this, { _m: new Map(), _kept: kept });
      if (kept) for (let i = 0, n = g.__host_storageKeysCount(); i < n; i++) { const k = g.__host_storageKey(i); this._m.set(k, g.__host_storageGet(k)); }
    }
    get length() { return this._m.size; }
    key(i) { const k = [...this._m.keys()][i]; return k === undefined ? null : k; }
    getItem(k) { const v = this._m.get(String(k)); return v === undefined ? null : v; }
    setItem(k, v) { k = String(k); v = String(v); this._m.set(k, v); if (this._kept) g.__host_storageSet(k, v); }
    removeItem(k) { k = String(k); if (this._m.delete(k) && this._kept) g.__host_storageRemove(k); }
    clear() { for (const k of [...this._m.keys()]) this.removeItem(k); }
  }
  for (const [name, kept] of [['localStorage', true], ['sessionStorage', false]])   // made (and the stored keys read) at the first use
    Object.defineProperty(g, name, { configurable: true, enumerable: true, get() { const s = new Storage(kept); Object.defineProperty(g, name, { value: s, configurable: true, enumerable: true }); return s; } });

  // ---- script elements: one put in the document with a src (or its own text) runs, then gets its load event; a classic script runs as a global
  // script, so its functions and vars are the window's (how a p5 sketch or a UMD library is written), a module is imported
  class HTMLScriptElement extends HTMLElement {
    get src() { return this.getAttribute('src') || ''; } set src(v) { this.setAttribute('src', v); }
    get type() { return this.getAttribute('type') || ''; } set type(v) { this.setAttribute('type', v); }
    get text() { return this.textContent; } set text(v) { this.textContent = v; }
  }
  TAGS.script = HTMLScriptElement;
  const ran = new WeakSet();
  function runScript(el) {
    if (ran.has(el) || (el.type && !/^(module|(text|application)\/(java|ecma)script)$/i.test(el.type))) return;
    ran.add(el);
    const finish = ok => dispatch(el, new Event(ok ? 'load' : 'error'));
    if (!el.src) { if (el.textContent) native.run(el.textContent, 'script'); return; }
    const url = absolute(el.src);
    if (el.type === 'module') { import(/^file:/i.test(url) ? decodeURIComponent(new URL(url).pathname) : url).then(() => finish(true), err => { reportError(err); finish(false); }); return; }
    load(url, 'GET', [], new Uint8Array(0)).then(r => {
      if (r.status !== 200) return finish(false);
      try { native.run(decode(r.body), /^file:/i.test(url) ? decodeURIComponent(new URL(url).pathname) : url); } catch (err) { reportError(err); }   // a script that throws has still loaded
      finish(true);
    }, () => finish(false));
  }

  Object.assign(g, { URL, URLSearchParams, Blob, File, Headers, Request, Response, fetch, XMLHttpRequest, XMLHttpRequestEventTarget, Storage, HTMLScriptElement, ImageData, Image, CanvasRenderingContext2D, CanvasGradient, CanvasPattern, TextMetrics, FontFace, FontFaceSet });

  // a promise rejected with nobody to catch it (the engine calls this, src/qjs/qjs.cpp): true when a listener prevented the message
  hidden(g, { __zincUnhandledRejection: (promise, reason) => !dispatch(g, new PromiseRejectionEvent('unhandledrejection', { cancelable: true, promise, reason })) });

  // the page is "loaded" once the program's module has run: DOMContentLoaded, then the window's load
  setTimeout(() => {
    dispatch(doc, new Event('DOMContentLoaded', { bubbles: true }));
    doc.readyState = 'complete';
    dispatch(doc, new Event('readystatechange'));
    dispatch(g, new Event('load'));
  }, 0);
})(globalThis);
