// The web environment of QuickJS programs (ZN-568): the browser a JavaScript library expects around WebGL, written against what PixiJS, Phaser,
// p5.js and three.js call (docs/reports/games/js-game-libraries.md, section 3.1) and no further. Evaluated before the program when it asks
// (ZINC_WEB=1, or "web" in zinc.json; src/qjs/webenv.cpp); nothing of it exists otherwise.
//
// What it is not: a DOM implementation. There is no layout (an element is as large as its style says), no CSS, no HTML parser (innerHTML keeps
// its text), and selectors are the simple ones. A member a library reads and does not find is named by ZINC_WEB=trace.
(g => {
  'use strict';
  const native = g.__zincWeb;
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
  class HTMLCanvasElement extends HTMLElement {
    getContext() { return null; }
  }
  class HTMLImageElement extends HTMLElement {}
  const TAGS = { canvas: HTMLCanvasElement, img: HTMLImageElement, audio: HTMLAudioElement, video: HTMLVideoElement };
  let captured = null;   // the element holding the pointer (setPointerCapture)

  class Document extends Node {
    constructor() { super(9, '#document'); this.readyState = 'interactive'; this.title = ''; this.cookie = ''; this.referrer = ''; this.characterSet = 'UTF-8'; this.compatMode = 'CSS1Compat'; this.contentType = 'text/html'; }
    createElement(tag) {
      tag = String(tag).toLowerCase();
      const e = new (TAGS[tag] || HTMLElement)(tag);
      if (tag === 'canvas') { e.width = 300; e.height = 150; }
      return e;
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
