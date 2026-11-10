// Dedicated Workers share only serialized messages; the thread/queue/termination machinery is zinc:worker's.
(g => {
  'use strict';
  const scope = g.__zincWorkerScope;
  const pumps = new Map();
  const cloneError = e => new DOMException(String(e && e.message || e), 'DataCloneError');
  const packet = message => {
    const bitmaps = [], errors = [], blobs = [], seen = new Map();
    const copy = value => {
      if (!value || typeof value !== 'object') return value;
      if (seen.has(value)) return seen.get(value);
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date || value instanceof RegExp) return value;
      const out = Array.isArray(value) ? [] : value instanceof Map ? new Map() : value instanceof Set ? new Set() : {};
      seen.set(value, out);
      if (value instanceof ImageBitmap) {
        const pixels = value._pixels();
        if (!pixels) throw cloneError('ImageBitmap is closed');
        out.width = value.width; out.height = value.height;
        bitmaps.push({ bitmap: out, pixels });
      } else if (value instanceof Error) {
        errors.push({ error: out, name: value.name, message: value.message, stack: value.stack, cause: copy(value.cause) });
      } else if (value instanceof Blob && value._bytes instanceof Uint8Array) {
        blobs.push({ blob: out, bytes: value._bytes, type: value.type });
      } else if (value instanceof Map) {
        for (const [k, v] of value) out.set(copy(k), copy(v));
      } else if (value instanceof Set) {
        for (const v of value) out.add(copy(v));
      } else {
        if (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') throw cloneError('Unsupported object');
        for (const key of Object.keys(value)) Object.defineProperty(out, key, { value: copy(value[key]), enumerable: true, writable: true, configurable: true });
        if (Array.isArray(value)) out.length = value.length;
      }
      return out;
    };
    return { message: copy(message), bitmaps, errors, blobs };
  };
  const unpack = value => {
    for (const { bitmap, pixels } of value.bitmaps) g.__zincBitmapRestore(bitmap, pixels);
    for (const { error, name, message, stack, cause } of value.errors) {
      const constructors = { Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError };
      const constructor = Object.hasOwn(constructors, name) ? constructors[name] : Error;
      Object.setPrototypeOf(error, constructor.prototype);
      Object.defineProperties(error, { name: { value: name, configurable: true, writable: true }, message: { value: message, configurable: true, writable: true }, stack: { value: stack, configurable: true, writable: true }, cause: { value: cause, configurable: true, writable: true } });
    }
    for (const { blob, bytes, type } of value.blobs) {
      const restored = new Blob([bytes], { type });
      Object.setPrototypeOf(blob, Blob.prototype);
      Object.defineProperties(blob, { _bytes: { value: restored._bytes }, size: { value: bytes.length }, type: { value: type } });
    }
    return value.message;
  };
  function post(handle, message, options = []) {
    const transfer = Array.from(options && typeof options[Symbol.iterator] === 'function' ? options : options && options.transfer || []);
    const buffers = [], bitmaps = [], seen = new Set();
    for (const value of transfer) {
      if (seen.has(value)) throw cloneError('Duplicate transferable');
      seen.add(value);
      if (value instanceof ArrayBuffer) buffers.push(value);
      else if (value instanceof ImageBitmap && value._pixels()) bitmaps.push(value);
      else throw cloneError('Unsupported or closed transferable');
    }
    const value = packet(message);
    try { g.__webWorkerPost(handle, value, buffers); }
    catch (error) { if (error instanceof RangeError) throw error; throw cloneError(error); }
    for (const bitmap of bitmaps) bitmap.close();
  }
  const receive = (handle, target) => {
    while (g.__host_workerNext(handle)) {
      let data;
      try { data = unpack(g.__recRead('')); }
      catch (error) { target.dispatchEvent(new MessageEvent('messageerror', { data: error })); continue; }
      g.__host_workerMark(handle, 1);
      try { target.dispatchEvent(new MessageEvent('message', { data })); }
      finally { g.__host_workerMark(handle, 2); }
    }
  };
  g.__addEvHandler((handle, kind) => { if (kind === 70) { const pump = pumps.get(handle); if (pump) pump(); } });
  if (scope) {
    const target = new EventTarget();
    // zinc:web's EventTarget dispatches listeners; the global's handler property is delivered by the same event.
    for (const type of ['message', 'messageerror', 'error']) target.addEventListener(type, event => {
      const handler = g['on' + type];
      if (typeof handler !== 'function') return;
      const result = type === 'error' ? handler.call(g, event.message, event.filename, event.lineno, event.colno, event.error) : handler.call(g, event);
      if (type === 'error' && result === true) event.preventDefault();
    });
    g.self = g;
    g.onmessage = null; g.onmessageerror = null; g.onerror = null;
    g.addEventListener = target.addEventListener.bind(target);
    g.removeEventListener = target.removeEventListener.bind(target);
    g.dispatchEvent = target.dispatchEvent.bind(target);
    g.postMessage = (message, transfer) => post(0, message, transfer);
    g.close = () => { pumps.delete(0); g.__host_workerClose(0); };
    pumps.set(0, () => receive(0, target));
    return;
  }
  // Handles are monotonic in the bridge and never recycled within a program.
  const State = Object.freeze({ running: 0, ended: 1, terminated: 2 });
  const slots = new WeakMap();
  function transition(worker, state) {
    const slot = slots.get(worker);
    if (slot.state !== State.running) return false;
    slot.state = state;
    pumps.delete(slot.handle);
    return true;
  }
  class Worker extends EventTarget {
    constructor(input, options = {}) {
      super();
      const type = options.type === undefined ? 'classic' : String(options.type);
      if (type !== 'classic' && type !== 'module') throw new TypeError('Worker type must be classic or module');
      const url = new URL(String(input), g.location.href);
      if (url.protocol !== 'file:' && url.protocol !== 'blob:') throw new DOMException('Worker scripts must use file: or blob: URLs', 'NotSupportedError');
      const source = url.protocol === 'blob:' ? g.__zincWorkerSource(url.href) : undefined;
      if (url.protocol === 'blob:' && source === undefined) throw new DOMException('Worker Blob URL has been revoked', 'NetworkError');
      const entry = url.protocol === 'file:' ? decodeURIComponent(url.pathname) : url.href;
      const handle = g.__webWorkerStart(entry, source, type, url.href);
      slots.set(this, { handle, state: State.running });
      this.onmessage = null; this.onerror = null; this.onmessageerror = null;
      pumps.set(handle, () => {
        receive(handle, this);
        const error = g.__host_workerError(handle);
        if (!error || !transition(this, State.ended) || error === '<ended>') return;
        const event = new ErrorEvent('error', { message: error, cancelable: true });
        if (this.dispatchEvent(event) && !this.onerror) console.error('Uncaught (in worker) ' + error);
      });
    }
    postMessage(message, transfer) { post(slots.get(this).handle, message, transfer); }
    terminate() { if (transition(this, State.terminated)) g.__host_workerClose(slots.get(this).handle); }
  }
  g.Worker = Worker;
})(globalThis);
