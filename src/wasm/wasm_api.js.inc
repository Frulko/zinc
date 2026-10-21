R"JS((function (wasm) {
'use strict';
// The WebAssembly JavaScript API over libzn_wasm's native functions (src/wasm/wasm_js.cpp, ZN-773.06). Ported from txiki.js's
// src/js/polyfills/wasm.js (MIT, Copyright (c) 2019-present Saul Ibarra Corretge). Returns the namespace; zinc puts it on globalThis.WebAssembly.
// What is not there (each a ceiling of WAMR's embedding API, see the task notes): a Memory, Table or mutable Global imported by an instance is
// copied into it, not shared; an imported Table is ignored; funcref values cross only through tables; multi-value results of imports.

const PAGE = 65536, MAX_PAGES = 65536;
const funcInfo = new WeakMap();   // exported function -> { inst, index }: keeps its instance handle alive and lets a table take it
const funcCache = new WeakMap();  // instance handle -> Map(index -> function): one function object per wasm function

function makeError(name) {
  const E = { [name]: class extends Error { constructor(message) { super(message, arguments[1]); } } }[name];
  Object.defineProperty(E.prototype, 'name', { value: name, writable: true, configurable: true });
  Object.defineProperty(E.prototype, 'message', { value: '', writable: true, configurable: true });
  return E;
}
const CompileError = makeError('CompileError');
const LinkError = makeError('LinkError');
const RuntimeError = makeError('RuntimeError');
wasm.setErrors(CompileError, LinkError, RuntimeError);

function toBytes(src, what) {
  if (ArrayBuffer.isView(src)) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  if (src instanceof ArrayBuffer || (typeof SharedArrayBuffer === 'function' && src instanceof SharedArrayBuffer)) return new Uint8Array(src);
  throw new TypeError(`${what}: Argument 0 must be a buffer source`);
}
function toU32(v, what) {   // WebIDL [EnforceRange] unsigned long
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(Number(v)) || n < 0 || n > 0xFFFFFFFF) throw new TypeError(`${what} must be an integer from 0 to 2^32-1`);
  return n;
}
function toBigInt(v) {
  if (typeof v === 'number') throw new TypeError('a WebAssembly i64 takes a BigInt');
  return BigInt(v);
}
function toWasm(type, v) {   // ToWebAssemblyValue
  switch (type) {
    case 'i32': return v | 0;
    case 'i64': return BigInt.asIntN(64, toBigInt(v));
    case 'f32': return Math.fround(+v);
    case 'f64': return +v;
    case 'externref': return v;
    default:
      if (v !== null && !funcInfo.has(v)) throw new TypeError('a funcref is null or an exported WebAssembly function');
      return v;
  }
}
const defaultValue = (type) => type === 'i64' ? 0n : type === 'externref' ? undefined : type === 'anyfunc' ? null : 0;
function utf8(bytes) {
  if (typeof TextDecoder === 'function') return new TextDecoder().decode(bytes);
  return decodeURIComponent(escape(String.fromCharCode(...bytes)));
}

// the custom sections and the imports of a module, read from its bytes in their order (WAMR keeps its imports grouped by kind)
const VALTYPES = { 0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x7b: 'v128', 0x70: 'anyfunc', 0x6f: 'externref' };
const KINDS = ['function', 'table', 'memory', 'global', 'tag'];
function sections(b) {
  const custom = [], imports = [];
  let p = 8;
  const leb = () => { let r = 0, s = 0, c; do { c = b[p++]; r += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return r; };
  const str = () => { const n = leb(); return utf8(b.subarray(p, p += n)); };
  const limits = (imp) => { const max = b[p++] & 1; imp.min = leb(); if (max) imp.max = leb(); };
  while (p < b.length) {
    const id = b[p++], size = leb(), end = p + size;
    if (id === 0) { const name = str(); custom.push({ name, bytes: b.slice(p, end) }); }
    else if (id === 2) {
      for (let n = leb(); n > 0; n--) {
        const module = str(), name = str(), kind = KINDS[b[p++]], imp = { module, name, kind };
        if (kind === 'function') leb();
        else if (kind === 'table') { imp.element = VALTYPES[b[p++]]; limits(imp); }
        else if (kind === 'memory') limits(imp);
        else if (kind === 'global') { imp.type = VALTYPES[b[p++]]; imp.mutable = b[p++] === 1; }
        else { p++; leb(); }
        imports.push(imp);
      }
    }
    p = end;
  }
  return { custom, imports };
}

function funcOf(inst, index) {
  let cache = funcCache.get(inst);
  if (!cache) funcCache.set(inst, cache = new Map());
  let f = cache.get(index);
  if (!f) {
    f = wasm.func(inst, index);
    funcInfo.set(f, { inst, index });
    cache.set(index, f);
  }
  return f;
}

let moduleHandle, moduleSections, bindMemory, bindGlobal, globalType, bindTable, memoryLimits, tableLimits;

class Module {
  #h; #sections;
  constructor(bytes) {
    const b = toBytes(bytes, 'WebAssembly.Module()');
    this.#h = wasm.parseModule(b);
    this.#sections = sections(b);
  }
  static {
    moduleHandle = (m) => { if (!(m instanceof Object) || !(#h in m)) throw new TypeError('Argument 0 must be a WebAssembly.Module'); return m.#h; };
    moduleSections = (m) => m.#sections;
  }
  static exports(module) { return wasm.moduleExports(moduleHandle(module)).map(({ name, kind }) => ({ name, kind })); }
  static imports(module) { moduleHandle(module); return moduleSections(module).imports.map(({ module, name, kind }) => ({ module, name, kind })); }
  static customSections(module, sectionName) {
    moduleHandle(module);
    if (sectionName === undefined) throw new TypeError('WebAssembly.Module.customSections(): Argument 1 is required');
    const name = String(sectionName);
    return moduleSections(module).custom.filter((s) => s.name === name).map((s) => s.bytes.slice().buffer);
  }
}

function globalImport(imp, v, i) {
  const where = `WebAssembly.Instance(): Import #${i} "${imp.module}" "${imp.name}"`;
  const t = globalType(v);
  if (t) {
    if (t.type !== imp.type || t.mutable !== imp.mutable) throw new LinkError(`${where}: imported global does not match the expected type`);
    return v.value;
  }
  if (imp.mutable) throw new LinkError(`${where}: imported mutable global must be a WebAssembly.Global object`);
  if (imp.type === 'i64' ? typeof v !== 'bigint' : imp.type === 'externref' ? false : imp.type === 'anyfunc' ? (v !== null && !funcInfo.has(v)) : typeof v !== 'number')
    throw new LinkError(`${where}: global import must be a ${imp.type === 'i64' ? 'BigInt' : 'Number'}`);
  return v;
}

// an imported memory or table matches the module's limits: at least its minimum, and a maximum no larger than the module's
const fits = (l, imp) => l.size >= imp.min && (imp.max === undefined || (l.maximum !== undefined && l.maximum <= imp.max));

class Instance {
  #exports;
  constructor(module) {
    const importObject = arguments[1], h = moduleHandle(module);
    if (importObject !== undefined && (importObject === null || (typeof importObject !== 'object' && typeof importObject !== 'function')))
      throw new TypeError('WebAssembly.Instance(): Argument 1 must be an object');
    const imports = moduleSections(module).imports;
    if (imports.length && importObject === undefined) throw new TypeError('WebAssembly.Instance(): Imports argument must be present and must be an object');
    const funcs = [], globals = [];
    let memory = null;
    imports.forEach((imp, i) => {
      const ns = importObject[imp.module];
      if (ns === null || (typeof ns !== 'object' && typeof ns !== 'function'))
        throw new TypeError(`WebAssembly.Instance(): Import #${i} "${imp.module}": module is not an object or function`);
      const v = ns[imp.name];
      const where = `WebAssembly.Instance(): Import #${i} "${imp.module}" "${imp.name}"`;
      switch (imp.kind) {
        case 'function': if (typeof v !== 'function') throw new LinkError(`${where}: function import requires a callable`); funcs.push(v); break;
        case 'global': globals.push(globalImport(imp, v, i)); break;
        case 'memory': {
          const l = memoryLimits(v);
          if (!l) throw new LinkError(`${where}: memory import must be a WebAssembly.Memory object`);
          if (!fits(l, imp)) throw new LinkError(`${where}: memory import has a size outside the module's limits`);
          memory = v;
          break;
        }
        default: {
          const l = tableLimits(v);
          if (!l) throw new LinkError(`${where}: table import requires a WebAssembly.Table`);
          if (l.element !== imp.element || !fits(l, imp)) throw new LinkError(`${where}: table import does not match the module's table type`);
        }
      }
    });
    const inst = wasm.instantiate(h, funcs, globals);
    if (memory) bindMemory(memory, inst, true);
    const exports = Object.create(null), objects = new Map();
    for (const e of wasm.moduleExports(h)) {
      const key = e.kind + e.index;
      let v = objects.get(key);
      if (v === undefined) {
        switch (e.kind) {
          case 'function': v = funcOf(inst, e.index); break;
          case 'memory': v = memory ?? bindMemory(new Memory({ initial: 0 }), inst, false); break;
          case 'global': v = bindGlobal(new Global({ value: 'i32' }), inst, e.name, wasm.globalInfo(inst, e.name)); break;
          default: v = bindTable(new Table({ element: 'anyfunc', initial: 0 }), inst, e.name, wasm.tableInfo(inst, e.name).element);
        }
        objects.set(key, v);
      }
      exports[e.name] = v;
    }
    this.#exports = Object.freeze(exports);
  }
  get exports() { return this.#exports; }
}

class Memory {
  #inst = null; #buffer; #maximum;
  constructor(descriptor) {
    if (descriptor === null || typeof descriptor !== 'object') throw new TypeError('WebAssembly.Memory(): Argument 0 must be a memory descriptor');
    if (descriptor.initial === undefined) throw new TypeError("WebAssembly.Memory(): Property 'initial' is required");
    const initial = toU32(descriptor.initial, "WebAssembly.Memory(): Property 'initial'");
    const maximum = descriptor.maximum === undefined ? undefined : toU32(descriptor.maximum, "WebAssembly.Memory(): Property 'maximum'");
    if (initial > MAX_PAGES) throw new RangeError("WebAssembly.Memory(): Property 'initial' is above the upper bound");
    if (maximum !== undefined && maximum > MAX_PAGES) throw new RangeError("WebAssembly.Memory(): Property 'maximum' is above the upper bound");
    if (maximum !== undefined && maximum < initial) throw new RangeError("WebAssembly.Memory(): Property 'maximum' must be >= 'initial'");
    this.#buffer = new ArrayBuffer(initial * PAGE);
    this.#maximum = maximum;
  }
  static {
    // imported: what the program wrote before is kept where the module's data segments left zeros (ponytail: WAMR made its own memory)
    bindMemory = (mem, inst, imported) => {
      if (imported && mem.#buffer.byteLength) {
        const to = new Uint8Array(wasm.memoryBuffer(inst)), from = new Uint8Array(mem.#buffer);
        for (let k = 0, n = Math.min(to.length, from.length); k < n; k++) if (from[k] && !to[k]) to[k] = from[k];
        mem.#buffer.transfer(0);
      }
      mem.#inst = inst;
      mem.#buffer = null;
      return mem;
    };
    memoryLimits = (m) => #maximum in Object(m) ? { size: m.buffer.byteLength / PAGE, maximum: m.#maximum } : null;
  }
  get buffer() { return this.#inst ? wasm.memoryBuffer(this.#inst) : this.#buffer; }
  grow(delta) {
    const d = toU32(delta, 'WebAssembly.Memory.grow(): Argument 0');
    if (this.#inst) return wasm.memoryGrow(this.#inst, d);
    const old = this.#buffer.byteLength / PAGE;
    if (old + d > (this.#maximum ?? MAX_PAGES)) throw new RangeError('WebAssembly.Memory.grow(): Maximum memory size exceeded');
    this.#buffer = this.#buffer.transfer((old + d) * PAGE);   // the old buffer is detached, as on a grow of an instance's memory
    return old;
  }
}

const GLOBAL_TYPES = ['i32', 'i64', 'f32', 'f64', 'externref', 'anyfunc'];
class Global {
  #inst = null; #name; #type; #mutable; #value;
  constructor(descriptor, v) {
    if (descriptor === null || typeof descriptor !== 'object') throw new TypeError('WebAssembly.Global(): Argument 0 must be a global descriptor');
    const mutable = Boolean(descriptor.mutable);
    let type = String(descriptor.value);
    if (type === 'funcref') type = 'anyfunc';
    if (!GLOBAL_TYPES.includes(type)) throw new TypeError(`WebAssembly.Global(): Descriptor property 'value' must be a WebAssembly type, not '${type}'`);
    this.#type = type;
    this.#mutable = mutable;
    this.#value = v === undefined ? defaultValue(type) : toWasm(type, v);
  }
  static {
    bindGlobal = (g, inst, name, info) => { g.#inst = inst; g.#name = name; g.#type = info.value; g.#mutable = info.mutable; return g; };
    globalType = (g) => #type in Object(g) ? { type: g.#type, mutable: g.#mutable } : null;
  }
  get value() { return this.#inst ? wasm.globalGet(this.#inst, this.#name) : this.#value; }
  set value(v) {
    if (!this.#mutable) throw new TypeError("WebAssembly.Global.value: Can't set the value of an immutable global");
    if (arguments.length === 0) throw new TypeError('WebAssembly.Global.value: Argument 0 is required');
    if (this.#inst) wasm.globalSet(this.#inst, this.#name, toWasm(this.#type, v));
    else this.#value = toWasm(this.#type, v);
  }
  valueOf() { return this.value; }
}

class Table {
  #inst = null; #name; #element; #items; #maximum;
  constructor(descriptor, value) {
    if (descriptor === null || typeof descriptor !== 'object') throw new TypeError('WebAssembly.Table(): Argument 0 must be a table descriptor');
    let element = String(descriptor.element);
    if (element === 'funcref') element = 'anyfunc';
    if (element !== 'anyfunc' && element !== 'externref') throw new TypeError(`WebAssembly.Table(): Descriptor property 'element' must be a WebAssembly reference type, not '${element}'`);
    if (descriptor.initial === undefined) throw new TypeError("WebAssembly.Table(): Property 'initial' is required");
    const initial = toU32(descriptor.initial, "WebAssembly.Table(): Property 'initial'");
    const maximum = descriptor.maximum === undefined ? undefined : toU32(descriptor.maximum, "WebAssembly.Table(): Property 'maximum'");
    if (maximum !== undefined && maximum < initial) throw new RangeError("WebAssembly.Table(): Property 'maximum' must be >= 'initial'");
    if (initial > 10000000) throw new RangeError("WebAssembly.Table(): Property 'initial' is above the upper bound");
    this.#element = element;
    this.#maximum = maximum;
    this.#items = new Array(initial).fill(arguments.length > 1 ? toWasm(element, value) : defaultValue(element));
  }
  static {
    bindTable = (t, inst, name, element) => { t.#inst = inst; t.#name = name; t.#element = element; t.#items = null; return t; };
    tableLimits = (t) => #element in Object(t) ? { size: t.length, maximum: t.#maximum, element: t.#element } : null;
  }
  get length() { return this.#inst ? wasm.tableInfo(this.#inst, this.#name).length : this.#items.length; }
  get(index) {
    const i = toU32(index, 'WebAssembly.Table.get(): Argument 0');
    if (!this.#inst) {
      if (i >= this.#items.length) throw new RangeError('WebAssembly.Table.get(): invalid address');
      return this.#items[i];
    }
    const raw = wasm.tableGet(this.#inst, this.#name, i);
    return this.#element === 'anyfunc' && raw !== null ? funcOf(this.#inst, raw) : raw;
  }
  set(index, value) {
    const i = toU32(index, 'WebAssembly.Table.set(): Argument 0');
    const v = arguments.length > 1 ? toWasm(this.#element, value) : defaultValue(this.#element);
    if (!this.#inst) {
      if (i >= this.#items.length) throw new RangeError('WebAssembly.Table.set(): invalid address');
      this.#items[i] = v;
      return;
    }
    if (this.#element !== 'anyfunc') return void wasm.tableSet(this.#inst, this.#name, i, v);
    if (v !== null && funcInfo.get(v).inst !== this.#inst) throw new TypeError('WebAssembly.Table.set(): a function of another instance cannot go in this table');
    wasm.tableSet(this.#inst, this.#name, i, v === null ? null : funcInfo.get(v).index);
  }
  grow(delta, value) {
    const d = toU32(delta, 'WebAssembly.Table.grow(): Argument 0');
    const v = arguments.length > 1 ? toWasm(this.#element, value) : defaultValue(this.#element);
    if (!this.#inst) {
      const old = this.#items.length;
      if (old + d > (this.#maximum ?? 10000000)) throw new RangeError('WebAssembly.Table.grow(): failed to grow table');
      for (let k = 0; k < d; k++) this.#items.push(v);
      return old;
    }
    const old = wasm.tableGrow(this.#inst, this.#name, d);
    if (old < 0) throw new RangeError('WebAssembly.Table.grow(): failed to grow table');
    if (v !== null && v !== undefined) for (let k = old; k < old + d; k++) this.set(k, v);
    return old;
  }
}

for (const [C, tag] of [[Module, 'Module'], [Instance, 'Instance'], [Memory, 'Memory'], [Global, 'Global'], [Table, 'Table']])
  Object.defineProperty(C.prototype, Symbol.toStringTag, { value: 'WebAssembly.' + tag, configurable: true });

function validate(bytes) { return wasm.validate(toBytes(bytes, 'WebAssembly.validate()').slice()); }
function compile(bytes) {
  let b;
  try { b = toBytes(bytes, 'WebAssembly.compile()').slice(); } catch (e) { return Promise.reject(e); }
  return Promise.resolve().then(() => new Module(b));
}
function instantiate(source) {
  const importObject = arguments[1];
  if (source instanceof Module) return Promise.resolve().then(() => new Instance(source, importObject));
  return compile(source).then((module) => ({ module, instance: new Instance(module, importObject) }));
}
async function compileStreaming(source) {
  const response = await source;
  if (typeof Response === 'function' && !(response instanceof Response)) throw new TypeError('WebAssembly.compileStreaming(): Argument 0 must be a Response');
  if (!response.ok) throw new TypeError(`WebAssembly.compileStreaming(): HTTP status code ${response.status}`);
  const type = response.headers.get('content-type');
  if (type && !type.includes('application/wasm')) throw new TypeError(`WebAssembly.compileStreaming(): Incorrect response MIME type ${type}, expected 'application/wasm'`);
  return new Module(await response.arrayBuffer());
}
async function instantiateStreaming(source) {
  const importObject = arguments[1];
  const module = await compileStreaming(source);
  return { module, instance: new Instance(module, importObject) };
}

const ns = {};
for (const f of [validate, compile, instantiate, compileStreaming, instantiateStreaming])
  Object.defineProperty(ns, f.name, { value: f, writable: true, enumerable: true, configurable: true });
for (const C of [Module, Instance, Memory, Table, Global, CompileError, LinkError, RuntimeError])
  Object.defineProperty(ns, C.name, { value: C, writable: true, configurable: true });
Object.defineProperty(ns, Symbol.toStringTag, { value: 'WebAssembly', configurable: true });
return ns;
}))JS"
