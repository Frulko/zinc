// zinc:wasm — WebAssembly (docs/plugins/wasm.md): the WebAssembly JS API's shape over the wasm3 interpreter natively
// and V8 on the sim. A program that names `WebAssembly` gets it as a global (compiler/src/frontend.ts webGlobals).
//   const { instance } = await WebAssembly.instantiate(bytes, new Imports().fn('env', 'log', (a: f64[]) => { ...; return 0; }));
//   instance.exports.call('add', [2, 3])        // 5
// Values cross as f64 (i64 beyond 2^53 loses precision; JS uses BigInt), exports are reached by name.
import W from './native/wasm.spec';
import { utf8Decode } from 'zinc:sys';

export class CompileError extends Error { constructor(m: string) { super(m); this.name = 'CompileError'; } }
export class LinkError extends Error { constructor(m: string) { super(m); this.name = 'LinkError'; } }
export class RuntimeError extends Error { constructor(m: string) { super(m); this.name = 'RuntimeError'; } }

export class ModuleImportDescriptor { module: string; name: string; kind: string; constructor(m: string, n: string, k: string) { this.module = m; this.name = n; this.kind = k; } }
export class ModuleExportDescriptor { name: string; kind: string; constructor(n: string, k: string) { this.name = n; this.kind = k; } }
const KINDS = ['function', 'table', 'memory', 'global', 'tag'];

/** Reads the import and export sections of a module binary (the same on every target). */
class Sections {
  imports: ModuleImportDescriptor[] = [];
  exports: ModuleExportDescriptor[] = [];
  constructor(b: u8[]) {
    let p: i32 = 8;
    const u32 = (): i32 => { let r: i32 = 0, shift: i32 = 0; for (;;) { const x: i32 = b[p++]; r |= (x & 0x7f) << shift; if ((x & 0x80) === 0) return r; shift += 7; } };
    const name = (): string => { const n = u32(); const s = utf8Decode(b.slice(p, p + n)); p += n; return s; };
    while (p < b.length) {
      const id: i32 = b[p++];
      const size = u32();
      const end = p + size;
      if (id === 2) {
        const n = u32();
        for (let i = 0; i < n; i++) {
          const m = name(), f = name(), k: i32 = b[p++];
          this.imports.push(new ModuleImportDescriptor(m, f, k < KINDS.length ? KINDS[k] : 'unknown'));
          if (k === 0) u32();
          else if (k === 1) { p++; const fl: i32 = b[p++]; u32(); if ((fl & 1) !== 0) u32(); }
          else if (k === 2) { const fl: i32 = b[p++]; u32(); if ((fl & 1) !== 0) u32(); }
          else if (k === 3) p += 2;
          else if (k === 4) { p++; u32(); }
        }
      } else if (id === 7) {
        const n = u32();
        for (let i = 0; i < n; i++) { const f = name(); const k: i32 = b[p++]; u32(); this.exports.push(new ModuleExportDescriptor(f, k < KINDS.length ? KINDS[k] : 'unknown')); }
      }
      p = end;
    }
  }
}

/** A compiled (validated) module. @throws CompileError */
export class Module {
  readonly handle: i32;
  private sections: Sections;
  constructor(bytes: u8[]) {
    if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) throw new CompileError('expected magic word 00 61 73 6d');
    const h = W.compile(bytes);
    if (h < 0) throw new CompileError(W.error());
    this.handle = h;
    this.sections = new Sections(bytes);
  }
  static imports(m: Module): ModuleImportDescriptor[] { return m.sections.imports.slice(); }
  static exports(m: Module): ModuleExportDescriptor[] { return m.sections.exports.slice(); }
}

export type HostFunction = (args: f64[]) => f64;
/** The import object: host functions by module and name. */
export class Imports {
  modules: string[] = [];
  names: string[] = [];
  fns: HostFunction[] = [];
  fn(module: string, name: string, f: HostFunction): Imports { this.modules.push(module); this.names.push(name); this.fns.push(f); return this; }
}

const hosts: HostFunction[] = [];
let routed = false;

export class Memory {
  private inst: i32;
  constructor(inst: i32) { this.inst = inst; }
  /** Size in bytes (buffer.byteLength). */
  get byteLength(): i32 { return W.memorySize(this.inst); }
  /** @throws RangeError out of bounds */
  read(offset: i32, n: i32): u8[] { const r = W.memoryRead(this.inst, offset, n); if (r.length !== n) throw new RangeError(W.error()); return r; }
  write(offset: i32, data: u8[]): void { if (!W.memoryWrite(this.inst, offset, data)) throw new RangeError(W.error()); }
}
export class Exports {
  private inst: i32;
  private names: ModuleExportDescriptor[];
  constructor(inst: i32, names: ModuleExportDescriptor[]) { this.inst = inst; this.names = names; }
  /** Export names and kinds, in module order. */
  list(): ModuleExportDescriptor[] { return this.names.slice(); }
  has(name: string): boolean { for (const e of this.names) if (e.name === name) return true; return false; }
  /** Calls an exported function. @throws RuntimeError on a trap, TypeError on an unknown export / argument count */
  call(name: string, args: f64[] = []): f64 {
    const n = W.argCount(this.inst, name);
    if (n < 0) throw new TypeError(`no exported function ${name}`);
    if (n !== args.length) throw new TypeError(`${name} takes ${n} arguments, got ${args.length}`);
    const r = W.call(this.inst, name, args);
    if (W.failed()) throw new RuntimeError(W.error());
    return r;
  }
  /** Value of an exported global. @throws TypeError when missing */
  global(name: string): f64 {
    const v = W.globalGet(this.inst, name);
    if (v !== v) throw new TypeError(`no exported global ${name}`);
    return v;
  }
  /** The module's memory (wasm3 supports one). @throws TypeError when the module exports none by this name */
  memory(name: string = 'memory'): Memory {
    for (const e of this.names) if (e.name === name && e.kind === 'memory') return new Memory(this.inst);
    throw new TypeError(`no exported memory ${name}`);
  }
}
/** An instance of a module. @throws LinkError when an import is missing, RuntimeError when the start function traps */
export class Instance {
  readonly handle: i32;
  readonly exports: Exports;
  constructor(module: Module, imports: Imports = new Imports()) {
    const h = W.instantiate(module.handle);
    if (h < 0) throw new LinkError(W.error());
    if (!routed) { routed = true; W.onImport((id: i32, args: f64[]): f64 => hosts[id](args)); }
    for (let i = 0; i < imports.fns.length; i++) {
      hosts.push(imports.fns[i]);
      W.linkImport(h, imports.modules[i], imports.names[i], hosts.length - 1);
    }
    if (!W.start(h)) {
      const e = W.error();
      W.free(h);
      if (e.startsWith('import ')) throw new LinkError(e);
      throw new RuntimeError(e);
    }
    this.handle = h;
    this.exports = new Exports(h, Module.exports(module));
  }
}
export class InstantiateResult { module: Module; instance: Instance; constructor(m: Module, i: Instance) { this.module = m; this.instance = i; } }

/** The WebAssembly namespace (validate, compile, instantiate). */
export class WebAssemblyNamespace {
  validate(bytes: u8[]): boolean { try { new Module(bytes); return true; } catch (e) { return false; } }
  async compile(bytes: u8[]): Promise<Module> { return new Module(bytes); }
  async instantiate(bytes: u8[], imports: Imports = new Imports()): Promise<InstantiateResult> {
    const m = new Module(bytes);
    return new InstantiateResult(m, new Instance(m, imports));
  }
}
export const WebAssembly: WebAssemblyNamespace = new WebAssemblyNamespace();
