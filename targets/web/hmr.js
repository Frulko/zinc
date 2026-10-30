// zinc dev --target web: the hot reload client (docs/targets/web.md, "Hot reload"). Loaded before the app, only by the dev server's page.
// The dev server serves each module on its own; this file gives them `import.meta.hot` (Vite's API as lib/std/hot.ts has it: accept, dispose, on, off, data)
// and `__zincRefresh`, which makes the functions a project module exports forward to their newest definition. A save then goes one of three ways:
//   update   the changed modules export only functions: they are evaluated again, the components that ran them are disposed and rendered again
//            (zinc:ui/solid's _hotC listens to beforeUpdate / afterUpdate), every module that was not touched keeps its state
//   reload   a changed module exports state or classes, is new, or is the entry: the page reloads
//   error    the program does not compile: an overlay shows the diagnostics until the next good save
const Z = globalThis.__zincWeb;

class HotModule {
  constructor(file, data) { this.file = file; this.data = data; this.accepted = false; this.acceptors = []; this.disposers = []; this.before = []; this.after = []; }
  accept(cb) { this.accepted = true; if (cb) this.acceptors.push(cb); }
  dispose(cb) { this.disposers.push(cb); }
  on(event, cb) {
    if (event === 'beforeUpdate') this.before.push(cb);
    else if (event === 'afterUpdate') this.after.push(cb);
    else throw new Error(`import.meta.hot.on: no event '${event}' (beforeUpdate, afterUpdate)`);
  }
  off(event, cb) { const l = event === 'beforeUpdate' ? this.before : this.after; const i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); }
}
const records = new Map(), datas = new Map();
globalThis.__zincHot = (file) => {
  let r = records.get(file);
  if (!r) { if (!datas.has(file)) datas.set(file, {}); records.set(file, r = new HotModule(file, datas.get(file))); }
  return r;
};
const families = new Map();
globalThis.__zincRefresh = (file, name, fn) => {
  if (typeof fn !== 'function') return fn;
  const key = file + '::' + name;
  let f = families.get(key);
  if (!f) {
    f = { impl: fn, wrapper: null };
    f.wrapper = function (...args) { return f.impl.apply(this, args); };
    Object.defineProperty(f.wrapper, 'name', { value: fn.name || name });
    families.set(key, f);
  } else f.impl = fn;
  Object.assign(f.wrapper, fn);
  return f.wrapper;
};

const versions = new Map();
const urlOf = (file) => new URL('stage/' + encodeURI(file) + (versions.get(file) ? '?v=' + versions.get(file) : ''), document.baseURI).href;

function beforeUpdate(modules) {
  for (const r of records.values()) for (const cb of r.before.slice()) cb(modules);
  for (const path of modules) {
    const r = records.get(path);
    if (!r) continue;
    for (const cb of r.disposers) cb();
    records.delete(path);
  }
}
function afterUpdate(modules) {
  for (const path of modules) { const r = records.get(path); if (r) for (const cb of r.acceptors) cb(); }
  for (const r of records.values()) for (const cb of r.after.slice()) cb(modules);
}

// the overlay: the compile error or the exception of the new code, over the app until it is fixed
let overlay = null;
function show(title, text) {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'alert');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:rgba(40,8,8,.94);color:#ffd9d9;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:24px 28px;white-space:pre-wrap';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '';
  const h = document.createElement('div');
  h.style.cssText = 'font:600 16px system-ui,sans-serif;color:#fff;margin-bottom:12px';
  h.textContent = title;
  const b = document.createElement('div');
  b.textContent = text;
  overlay.append(h, b);
}
function hide() { if (overlay) { overlay.remove(); overlay = null; } }
Z.onError = (e) => show(e && e.name === 'ZnUnsupported' ? 'This needs something the browser does not have' : 'Runtime error', (e && (e.stack || e.message)) || String(e));

let applying = Promise.resolve();
async function apply(changed) {
  const names = [];
  for (const c of changed) {
    try { const ns = await import(urlOf(c.file)); for (const n of Object.keys(ns)) names.push('@hot:' + n); } catch { /* it never loaded */ }
  }
  const mods = changed.map((c) => c.file).concat(names);
  const t0 = performance.now();
  beforeUpdate(mods);
  try {
    for (const c of changed) { versions.set(c.file, c.v); await import(urlOf(c.file)); }
  } catch (e) {
    show('The new code of ' + changed.map((c) => c.file.replace(/^.*\//, '')).join(', ') + ' threw', (e && (e.stack || e.message)) || String(e));
    return;
  }
  afterUpdate(mods);
  hide();
  console.log(`[zinc] ${changed.length} module(s) updated in ${Math.round(performance.now() - t0)} ms`);
  globalThis.__zincUpdates = (globalThis.__zincUpdates || 0) + 1;
}

let socket = null, reconnect = false;
function connect() {
  socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/__zinc/ws');
  socket.onopen = () => { globalThis.__zincHotReady = true; if (reconnect) location.reload(); };
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'hello' && m.error) show('Compile error', m.error);
    else if (m.type === 'error') show('Compile error', m.message);
    else if (m.type === 'reload') location.reload();
    else if (m.type === 'update') applying = applying.then(() => apply(m.changed));
  };
  // the dev server went away: wait for it to come back, unless another server took the port (a 404 for the stage: an export served there)
  socket.onclose = () => {
    reconnect = true;
    setTimeout(() => fetch('/stage/stage.json', { method: 'HEAD', cache: 'no-store' }).then((r) => { if (r.status !== 404) connect(); }, () => setTimeout(connect, 800)), 800);
  };
}
connect();
