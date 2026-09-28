// zinc:ffi — call C functions of shared libraries (docs/plugins/ffi.md), like txiki's tjs:ffi for the scalar cases:
//   const libc = dlopen('');                                   // the program itself (libc included)
//   const strlen = libc.fn('strlen', 'i64', ['string']);
//   strlen.call(['hello'])                                     // 5 (unknown: narrow with typeof)
// Types: 'void' 'i32' 'u32' 'i64' 'f64' 'f32' (return only) 'ptr' 'string'. Up to 6 integer-class (ints, pointers,
// strings) and 8 f64 arguments; no variadic functions, structs by value or callbacks. Memory: alloc / read / write /
// free / readCString. Unsafe by nature: a wrong signature or pointer crashes the program.
import F from './native/ffi.spec';
import { platform } from 'zinc:sys';

/** Shared library suffix of this platform ('so' on the sim). */
export const suffix: string = platform() === 'macos' ? 'dylib' : 'so';

const TYPES = ['void', 'i32', 'u32', 'i64', 'f64', 'ptr', 'string', 'f32'];
function retCode(t: string): i32 {
  const i = TYPES.indexOf(t);
  if (i < 0) throw new TypeError(`zinc:ffi: unknown type '${t}' (${TYPES.join(', ')})`);
  return i === 5 ? 5 : i === 6 ? 6 : i === 7 ? 7 : i;
}

export class ForeignFunction {
  readonly name: string;
  private addr: f64;
  private ret: i32;
  private args: string[];
  constructor(name: string, addr: f64, ret: string, args: string[]) {
    this.name = name; this.addr = addr; this.ret = retCode(ret); this.args = args;
    let ints = 0, floats = 0;
    for (const a of args) {
      if (a === 'f64') floats++;
      else if (a === 'f32' || a === 'void' || !TYPES.includes(a)) throw new TypeError(`zinc:ffi: unsupported argument type '${a}' for ${name}`);
      else ints++;
    }
    if (ints > 6 || floats > 8) throw new TypeError(`zinc:ffi: ${name} has more than 6 integer or 8 floating-point arguments`);
  }
  /** Calls with numbers / strings / null in prototype order; returns a number, a string, or null (void, NULL). */
  call(values: unknown[] = []): unknown {
    if (values.length !== this.args.length) throw new TypeError(`zinc:ffi: ${this.name} takes ${this.args.length} arguments, got ${values.length}`);
    const ints: f64[] = [], floats: f64[] = [], strs: string[] = [], strAt: i32[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i], t = this.args[i];
      if (t === 'f64') { if (typeof v !== 'number') throw new TypeError(`zinc:ffi: argument ${i} of ${this.name} must be a number`); floats.push(v); continue; }
      if (t === 'string' && typeof v === 'string') { strs.push(v); strAt.push(ints.length); ints.push(0); continue; }
      if (v === null) { ints.push(0); continue; }
      if (typeof v === 'number') { ints.push(v); continue; }
      if (typeof v === 'boolean') { ints.push(v ? 1 : 0); continue; }
      throw new TypeError(`zinc:ffi: argument ${i} of ${this.name} must be a number${t === 'string' ? ' or a string' : ''}`);
    }
    const r = F.call(this.addr, ints, strs, strAt, floats, this.ret);
    if (this.ret === 0) return null;
    if (this.ret === 6) { if (r === 0) return null; const s: unknown = F.text(); return s; }
    const n: unknown = r;
    return n;
  }
}

export class Library {
  private h: i32;
  readonly path: string;
  constructor(h: i32, path: string) { this.h = h; this.path = path; }
  /** Address of a symbol (0 when missing). */
  symbol(name: string): f64 { return this.h < 0 ? 0 : F.sym(this.h, name); }
  /** A callable function. @throws Error when the symbol is missing, TypeError on an unsupported signature */
  fn(name: string, ret: string, args: string[]): ForeignFunction {
    if (this.h < 0) throw new Error('zinc:ffi: library is closed');
    const a = F.sym(this.h, name);
    if (a === 0) throw new Error(F.error());
    return new ForeignFunction(name, a, ret, args);
  }
  close(): void { if (this.h >= 0) { F.close(this.h); this.h = -1; } }
}
/** Opens a shared library ('' = the program itself); `libz.${suffix}` style names use the system search path.
 *  @throws Error with dlerror's text */
export function dlopen(path: string): Library {
  const h = F.open(path);
  if (h < 0) throw new Error(F.error());
  return new Library(h, path);
}

/** C memory (malloc'ed, zeroed) for out-parameters and buffers. */
export function alloc(n: i32): f64 { return F.alloc(n); }
export function free(p: f64): void { F.free(p); }
export function read(p: f64, n: i32): u8[] { return F.read(p, n); }
export function write(p: f64, data: u8[]): void { F.write(p, data); }
export function readCString(p: f64): string { return F.readCString(p); }
