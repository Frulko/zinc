// C++17 emitter (CMP-09). Walks the checked TS AST directly (HIR/MIR deferred, docs/decisions/0004).
// Output: one translation unit `zinc_main.cpp` that includes runtime/zrt.h.
// Errors use status returns (RT-05): a pending error in zrt::g_err is checked after calls that may throw.
// async functions and generators become stackless frames whose step() resumes through a switch (protothreads).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ts, ZINC_ROOT } from './frontend.ts';
import { Sema, type ZT, type NumKind, type DynShape, isNum, isInt, isFx, I32, F64, STR, VOID, DYN, ERROR_CLASSES } from './sema.ts';
import { NativeModules, MODULE_TARGETS } from './native.ts';

const NUMC: Record<NumKind, string> = {
  f64: 'double', f32: 'float', fx12: 'zrt::fx12', fx16: 'zrt::fx16', i8: 'int8_t', i16: 'int16_t', i32: 'int32_t', i64: 'int64_t',
  u8: 'uint8_t', u16: 'uint16_t', u32: 'uint32_t', u64: 'uint64_t', isize: 'zrt::isize', usize: 'zrt::usize',
};
const CPP_KEYWORDS = new Set(('alignas alignof and and_eq asm auto bitand bitor bool break case catch char char16_t char32_t class compl const ' +
  'constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if ' +
  'inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast return ' +
  'short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union ' +
  'unsigned using virtual void volatile wchar_t while xor xor_eq main zrt std NULL errno assert self state step cur').split(' '));
const MATH_FNS = new Set(['abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan2', 'exp', 'log', 'hypot', 'min', 'max', 'fround']);
const CONSOLE = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace']);

/** dev: source-location table + LocFrames for the red box (docs/dev-mode.md). */
/** obfuscate: string literals XOR-encoded in the binary, decoded once at startup (zinc export --obfuscate). */
export interface CppOptions { debug: boolean; title: string; width: number; height: number; outDir: string; target: string; dev?: boolean; obfuscate?: boolean }
export interface CppResult { code: string; usesGfx: boolean; modules: Set<string>; nativeSources: string[] }

const refLike = (t: ZT) => ['obj', 'fn', 'arr', 'map', 'set', 'promise', 'gen', 'dyn'].includes(t.k);
const hasTp = (t: ZT): boolean => t.k === 'tp' || (t.k === 'tup' ? t.els.some(hasTp) : false) || (t.k === 'arr' || t.k === 'set' || t.k === 'promise' || t.k === 'gen' ? hasTp(t.el) : t.k === 'map' ? hasTp(t.key) || hasTp(t.val) : t.k === 'fn' ? t.params.some(hasTp) || hasTp(t.ret) : t.k === 'obj' ? t.args.some(hasTp) : false);

type Cls = ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.TypeLiteralNode | ts.ObjectLiteralExpression;
type FnLike = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

interface Frame { kind: 'async' | 'gen'; fields: Map<string, string>; state: number; awaits: Map<ts.Node, string>; el: ZT; name: string }
interface Ctx { ret: ZT; inCtor: boolean; catches: string[]; breaks: (string | null)[]; frame?: Frame; self: string }

const xorshift = (k: number) => { k = (k ^ (k << 13)) >>> 0; k = (k ^ (k >>> 17)) >>> 0; return (k ^ (k << 5)) >>> 0; };
const litSeed = (i: number) => ((Math.imul(i + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0) || 1;

export function emitCpp(sema: Sema, opts: CppOptions): CppResult {
  return new CppEmitter(sema, opts).run();
}

class CppEmitter {
  K = ts.SyntaxKind;
  lits: string[] = [];
  litIndex = new Map<string, number>();
  litLens: number[] = [];
  tmp = 0;
  ctx: Ctx = { ret: VOID, inCtor: false, catches: [], breaks: [], self: 'this' };
  usesGfx = false;
  frameDefs: string[] = [];
  frameBodies: string[] = [];
  native: NativeModules;
  locs: string[] = [''];
  locIndex = new Map<string, number>();
  /** Dyn -> interface converters, generated on demand (DYN-07). */
  dynFns = new Map<ts.Node, string>();
  dynFnDefs: string[] = [];

  s: Sema;
  o: CppOptions;
  constructor(s: Sema, o: CppOptions) { this.s = s; this.o = o; this.native = new NativeModules(s); }

  // ---------- naming ----------
  id(n: string): string {
    if (n.includes('Symbol.dispose')) return 'zrt_dispose';
    const x = n.replace(/^#/, 'p_').replace(/\$/g, '_S_');
    return CPP_KEYWORDS.has(x) ? x + '_' : x;
  }
  ns(sf: ts.SourceFile): string {
    const rel = path.relative(this.s.root, sf.fileName).replace(/\.[cm]?[jt]sx?$/, m => m === '.tsx' && fs.existsSync(sf.fileName.slice(0, -4) + '.ts') ? '_tsx' : '');
    return 'm_' + rel.replace(/[^A-Za-z0-9]/g, '_');
  }
  isTop(d: ts.Node): boolean { return ts.isSourceFile(d.parent) || this.s.isModuleLevel(d); }
  declName(d: ts.Node): string {
    if (this.s.anon.includes(d)) return `__Obj${this.s.classIds.get(d)}`;
    if (ts.isTypeLiteralNode(d)) {
      const alias = this.s.unionOf.get(d)!;
      return `${alias.name.text}_${this.s.unionMembers.get(alias)!.indexOf(d)}`;
    }
    return (d as ts.NamedDeclaration).name?.getText() ?? '_';
  }
  qual(d: ts.Node): string {
    if (d === this.s.errorDecl) return 'zrt::Error';
    const mod = this.s.libModule(d);
    if (mod) { this.native.used.add(mod); return `zrt::${mod}::${this.declName(d)}`; }
    return `${this.ns(d.getSourceFile())}::${this.id(this.declName(d))}`;
  }
  cls(t: Extract<ZT, { k: 'obj' }>): string {
    return this.qual(t.decl) + (t.args.length ? `<${t.args.map(a => this.cpp(a)).join(', ')}>` : '');
  }
  cpp(t: ZT): string {
    switch (t.k) {
      case 'num': return NUMC[t.m];
      case 'bool': return 'bool';
      case 'str': return 'zrt::String';
      case 'void': return 'void';
      case 'null': return 'decltype(nullptr)';
      case 'arr': return `zrt::Array<${this.cpp(t.el)}>`;
      case 'map': return `zrt::Map<${this.cpp(t.key)}, ${this.cpp(t.val)}>`;
      case 'set': return `zrt::Set<${this.cpp(t.el)}>`;
      case 'obj': return `zrt::Ref<${this.cls(t)}>`;
      case 'fn': return `zrt::Fn<${this.cpp(t.ret)}(${t.params.map(p => this.cpp(p)).join(', ')})>`;
      case 'promise': return `zrt::Promise<${this.val(t.el)}>`;
      case 'gen': return `zrt::Gen<${this.cpp(t.el)}>`;
      case 'tup': return `zrt::Tup${t.els.length}<${t.els.map(x => this.cpp(x)).join(', ')}>`;
      case 'tp': return t.name;
      case 'dyn': return 'zrt::Dyn';
    }
  }
  /** Promise payload type: void becomes zrt::Unit. */
  val(t: ZT): string { return t.k === 'void' ? 'zrt::Unit' : this.cpp(t); }
  tparams(tps: ts.NodeArray<ts.TypeParameterDeclaration> | undefined): string {
    return tps?.length ? `template<${tps.map(t => 'typename ' + t.name.text).join(', ')}> ` : '';
  }
  newTmp(p: string) { return `__${p}${this.tmp++}`; }
  get fx(): boolean { return isFx(this.s.numberKind); }
  /** Wrap a runtime f64 result into the profile's `number` representation. */
  numRet(code: string): string { return this.fx ? `${NUMC[this.s.numberKind]}(${code})` : this.s.numberKind === 'f32' ? `static_cast<float>(${code})` : code; }

  // ---------- string literal pool (constant-initialized, immortal: MEM-05) ----------
  lit(v: string): string {
    let i = this.litIndex.get(v);
    if (i === undefined) {
      i = this.litIndex.size;  // sequential literal id (obfuscated mode emits two array entries per literal)
      this.litIndex.set(v, i);
      const bytes = Buffer.from(v, 'utf8');
      let c = '';
      for (const b of bytes) c += b >= 0x20 && b < 0x7f && b !== 0x22 && b !== 0x5c && b !== 0x3f ? String.fromCharCode(b) : '\\' + b.toString(8).padStart(3, '0');
      const ascii = bytes.every(b => b < 0x80) ? 1 : 0;
      if (this.o.obfuscate) {
        // ponytail: XOR with a xorshift32 keystream seeded per literal; hides literals from `strings`, not from a debugger
        let k = litSeed(i);
        const enc = [...bytes].map(b => { k = xorshift(k); const e = (b ^ k) & 0xff; return e > 127 ? e - 256 : e; });  // signed char literals
        this.litLens.push(bytes.length);
        this.lits.push(`static char zd${i}[] = {${[...enc, 0].join(',')}};`, `static zrt::StrObj zs${i} = {zrt::IMMORTAL, ${bytes.length}, ${v.length}, ${ascii}, zd${i}, nullptr};`);
      } else this.lits.push(`static zrt::StrObj zs${i} = {zrt::IMMORTAL, ${bytes.length}, ${v.length}, ${ascii}, "${c}", nullptr};`);
    }
    return `zrt::String(&zs${i})`;
  }

  /** Decodes the XOR-encoded literal pool in place (same keystream as lit()). */
  litDecoder(): string {
    const rows = this.litLens.map((n, i) => `{zd${i}, ${n}u, ${litSeed(i)}u}`);
    return `static void zinc_lits_decode() {
  static bool done = false;
  if (done) return;
  done = true;
  struct L { char* p; uint32_t n; uint32_t k; };
  static const L t[] = {${rows.join(', ') || '{nullptr, 0u, 0u}'}};
  for (const L& l : t) { uint32_t k = l.k; for (uint32_t j = 0; j < l.n; j++) { k ^= k << 13; k ^= k >> 17; k ^= k << 5; l.p[j] ^= (char)(k & 0xff); } }
}`;
  }

  // ---------- program ----------
  run(): CppResult {
    const classes: Cls[] = [];
    const fns: ts.FunctionDeclaration[] = [];
    const globals: ts.VariableDeclaration[] = [];
    for (const sf of this.s.fe.sources) {
      for (const st of sf.statements) {
        if (ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st)) classes.push(st);
        else if (ts.isTypeAliasDeclaration(st) && (ts.isTypeLiteralNode(st.type) || this.s.unionMembers.has(st))) {
          classes.push(st);
          for (const m of this.s.unionMembers.get(st) ?? []) if (ts.isTypeLiteralNode(m)) classes.push(m);
        }
        else if (ts.isFunctionDeclaration(st) && st.body) fns.push(st);
        else if (ts.isVariableStatement(st)) globals.push(...st.declarationList.declarations);
        else if (ts.isImportDeclaration(st) && (st.moduleSpecifier as ts.StringLiteral).text === 'zinc:gfx') this.usesGfx = true;  // named or namespace import
      }
    }
    for (const a of this.s.anon) classes.push(a as Cls);
    const ordered = this.topo(classes);
    const decls: string[] = [], defs: string[] = [], protos: string[] = [], bodies: string[] = [], inits: string[] = [];
    for (const c of ordered) decls.push(`namespace ${this.ns(c.getSourceFile())} { ${this.tparams((c as ts.ClassDeclaration).typeParameters)}struct ${this.id(this.declName(c))}; }`);
    for (const c of ordered) { const [d, b] = this.classDef(c); defs.push(d); bodies.push(b); }
    const gl: string[] = [];
    for (const g of globals) {
      for (const n of this.boundNames(g.name)) gl.push(`namespace ${this.ns(g.getSourceFile())} { ${this.cpp(this.s.declType(n.decl))} ${this.id(n.name)}{}; }`);
    }
    for (const f of fns) {
      protos.push(`namespace ${this.ns(f.getSourceFile())} { ${this.fnHead(f, true)}; }`);
      bodies.push(`namespace ${this.ns(f.getSourceFile())} {\n${this.fnHead(f, false)} ${this.fnBody(f)}\n}`);
    }
    const mains: string[] = [], deinits: string[] = [];
    for (const sf of this.s.fe.sources) {
      const ns = this.ns(sf);
      inits.push(`namespace ${ns} {\nvoid __init() {\n${this.moduleInit(sf)}}\nvoid __deinit() {\n${this.moduleDeinit(sf)}}\n}`);
      mains.push(`  ${ns}::__init();\n  zrt::check_uncaught();`);
      deinits.unshift(`  ${ns}::__deinit();`);
    }
    const dev = this.o.dev;
    const main = [
      'static void zinc_init() {', ...this.native.inits(), ...mains, '}',
      'static void zinc_deinit() {', ...deinits, '}',
      ...(dev ? [`static const char* const zinc_locs[] = {${this.locs.map(l => JSON.stringify(l)).join(', ')}};`] : []),
      // the dev host (runtime/dev_host.cpp) loads the program as a shared library and calls zinc_app_main
      'extern "C" int zinc_app_main(int argc, char** argv) {',
      ...(this.o.obfuscate ? ['  zinc_lits_decode();'] : []),
      `  HalConfig cfg = {${this.o.width}, ${this.o.height}, ${JSON.stringify(this.o.title)}, ${this.usesGfx ? 1 : 0}};`,
      ...(dev ? ['  zrt::loc_names = zinc_locs;'] : []),
      '  return zrt::app_main(cfg, argc, argv, zinc_init, zinc_deinit);', '}',
      '#ifndef ZRT_DYLIB', 'int main(int argc, char** argv) { return zinc_app_main(argc, argv); }', '#endif',
    ];
    const dynProtos = [...this.dynFns.entries()].map(([d, f]) => `static zrt::Ref<${this.qual(d)}> ${f}(const zrt::Dyn& d);`);
    const code = ['// Generated by zinc. Do not edit.', '#include "zrt.h"', ...this.native.includes(), ...(dev ? ['static zrt::LocFrame& __lf = zrt::loc_root;  // code outside functions'] : []), '', ...this.lits, ...(this.o.obfuscate ? [this.litDecoder()] : []), '', ...decls, '', ...defs, '', ...dynProtos, ...this.dynFnDefs, '',
      ...this.frameDefs, '', ...gl, '', ...protos, '', ...bodies, '', ...this.frameBodies, '', ...inits, '', ...main, ''].join('\n');
    for (const m of this.native.used) {
      const ok = MODULE_TARGETS[m];
      if (ok && !ok.includes(this.o.target)) this.s.fail(this.s.fe.entry, 'Z5003', `module 'zinc:${m}' is not available on target '${this.o.target}' (available: ${ok.join(', ')})`);
    }
    if (this.native.user.size) this.native.writeHeaders(this.o.outDir, t => this.cpp(t));
    return { code, usesGfx: this.usesGfx, modules: this.native.used, nativeSources: this.native.user.size ? this.native.sources(this.o.target) : [] };
  }

  topo(cs: Cls[]): Cls[] {
    const out: Cls[] = [], seen = new Set<Cls>();
    const visit = (c: Cls) => {
      if (seen.has(c)) return;
      seen.add(c);
      for (const d of this.bases(c)) if (cs.includes(d as Cls)) visit(d as Cls);
      out.push(c);
    };
    cs.forEach(visit);
    return out;
  }
  bases(c: Cls): ts.Node[] {
    const out: ts.Node[] = [];
    const u = this.s.unionOf.get(c);
    if (u) out.push(u);
    if (ts.isClassDeclaration(c) || ts.isInterfaceDeclaration(c))
      for (const h of c.heritageClauses ?? []) for (const t of h.types) { const d = this.s.declOf(t.expression); if (d) out.push(d); }
    return out;
  }
  baseOf(c: Cls): { code: string; decl?: ts.Node } {
    const u = this.s.unionOf.get(c);
    if (ts.isTypeLiteralNode(c) || ts.isTypeAliasDeclaration(c)) return u ? { code: this.qual(u), decl: u } : { code: 'zrt::Object' };
    if (ts.isObjectLiteralExpression(c)) return { code: 'zrt::Object' };
    if (ts.isClassDeclaration(c)) { const eb = this.s.errorBase(c); if (eb) return { code: `zrt::${eb}` }; }
    const hs = c.heritageClauses ?? [];
    const all = hs.flatMap(h => h.types.map(t => ({ t, ext: h.token === this.K.ExtendsKeyword })));
    if (all.length > 1) this.s.fail(c, 'Z9008', 'a class may extend one class or implement one interface in the prototype');
    if (!all.length) return u ? { code: this.qual(u), decl: u } : { code: 'zrt::Object' };
    const t = all[0].t;
    const d = this.s.declOf(t.expression)!;
    const args = (t.typeArguments ?? []).map(a => this.cpp(this.s.fromTypeNode(a)));
    return { code: this.qual(d) + (args.length ? `<${args.join(', ')}>` : ''), decl: d };
  }
  /** Optional field of a value type (`label?: string`): absence is tracked by a `__has_` bit. */
  optVal(d: ts.Node): boolean {
    return (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) && !!d.questionToken && !this.s.isLib(d) && !refLike(this.s.declType(d));  // lib structs live in the C++ runtime
  }
  isVirtualClass(c: Cls): boolean {
    return ts.isInterfaceDeclaration(c) || this.s.hierarchy.has(c) || (ts.isClassDeclaration(c) && this.s.implemented(c).length > 0);
  }
  isStatic(m: ts.Node) { return (ts.getCombinedModifierFlags(m as ts.Declaration) & ts.ModifierFlags.Static) !== 0; }
  /** Field names already stored by a base struct (interfaces implemented, union common fields). */
  inheritedFields(c: Cls): Set<string> {
    const names = new Set<string>();
    const u = this.s.unionOf.get(c);
    if (u) for (const f of this.s.commonFields(u)) names.add((f as ts.PropertySignature).name.getText());
    if (ts.isClassDeclaration(c)) for (const i of this.s.implemented(c)) for (const n of this.s.fieldNames(i)) names.add(n);
    if (ts.isInterfaceDeclaration(c)) for (const b of this.bases(c)) for (const n of this.s.fieldNames(b)) names.add(n);
    return names;
  }
  ctorParams(c: ts.ClassDeclaration): readonly ts.ParameterDeclaration[] {
    const ctor = c.members.find(ts.isConstructorDeclaration);
    if (ctor) return ctor.parameters;
    const b = this.s.baseClass(c);
    return b ? this.ctorParams(b) : [];
  }
  /** Parameter list. Destructured or boxed parameters get a synthetic name, unpacked in the prologue. */
  params(ps: readonly ts.ParameterDeclaration[], withDefaults: boolean, subst?: Map<string, ZT>): string {
    return ps.map((p, i) => {
      if (p.dotDotDotToken) this.s.fail(p, 'Z9009', 'rest parameters are not supported yet');
      const t = this.s.paramType(p, subst);
      let s = `${this.cpp(t)} ${this.paramName(p, i)}`;
      if (withDefaults && p.initializer) s += this.literalDefault(p) ? ` = ${this.cpp(t)}()` : ` = ${this.conv(p.initializer, t)}`;
      else if (withDefaults && p.questionToken) s += ` = ${this.cpp(t)}()`;
      return s;
    }).join(', ');
  }
  paramName(p: ts.ParameterDeclaration, i: number): string {
    if (!ts.isIdentifier(p.name)) return `__p${i}`;
    const sym = this.s.symbolOf(p.name);
    return sym && this.s.boxed.has(sym) ? `__pv_${p.name.text}` : this.id(p.name.text);
  }
  /** `o: Opts = {}`: object/array literals cannot be C++ default arguments (lambdas); the prologue builds them. */
  literalDefault(p: ts.ParameterDeclaration): boolean {
    const e = p.initializer;
    return !!e && (ts.isObjectLiteralExpression(e) || ts.isArrayLiteralExpression(e));
  }
  prologue(ps: readonly ts.ParameterDeclaration[], d: number): string {
    let out = '';
    ps.forEach((p, i) => {
      if (this.literalDefault(p) && ts.isIdentifier(p.name)) out += `${this.ind(d)}if (${this.paramName(p, i)} == nullptr) ${this.paramName(p, i)} = ${this.conv(p.initializer!, this.s.paramType(p))};\n`;
      if (!ts.isIdentifier(p.name)) out += this.destructure(p.name, `__p${i}`, this.s.paramType(p), d);
      else {
        const sym = this.s.symbolOf(p.name);
        if (sym && this.s.boxed.has(sym)) out += `${this.ind(d)}auto ${this.id(p.name.text)} = zrt::cell<${this.cpp(this.s.paramType(p))}>(__pv_${p.name.text});\n`;
      }
    });
    return out;
  }

  // ---------- classes ----------
  classDef(c: Cls): [string, string] {
    const name = this.id(this.declName(c));
    const ns = this.ns(c.getSourceFile());
    const tps = (c as ts.ClassDeclaration).typeParameters;
    const tp = this.tparams(tps);
    const self = name + (tps?.length ? `<${tps.map(t => t.name.text).join(', ')}>` : '');
    const base = this.baseOf(c);
    const virt = this.isVirtualClass(c);
    const skip = this.inheritedFields(c);
    const L: string[] = [`namespace ${ns} {`, `${tp}struct ${name} : ${base.code} {`, `  static constexpr uint32_t ZRT_CID = ${this.s.classIds.get(c)};`];
    const B: string[] = [];
    const jsonFields: string[] = [];
    const dynFields: { raw: string; t: ZT; weak: boolean; opt: boolean }[] = [];
    const fieldInits: string[] = [];
    const isUnionBase = ts.isTypeAliasDeclaration(c) && this.s.unionMembers.has(c);
    const members = isUnionBase ? this.s.commonFields(c as ts.TypeAliasDeclaration) : this.s.ownMembers(c);
    for (const m of members) {
      if (ts.isPropertyDeclaration(m) || ts.isPropertySignature(m) || ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m)) {
        const raw = m.name.getText();
        const fname = this.id(raw);
        const t = this.s.declType(m);
        const weak = ts.isPropertyDeclaration(m) && this.hasDecorator(m, 'weak');
        if (ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m)) {
          dynFields.push({ raw, t, weak: false, opt: false });
          L.push(`  ${this.cpp(t)} ${fname}{};`);
          if (t.k !== 'fn') jsonFields.push(`  zrt::json_field(sb, first, "${raw}", this->${fname});`);
          continue;
        }
        const ft = weak && t.k === 'obj' ? `zrt::Weak<${this.cls(t)}>` : this.cpp(t);
        if (this.isStatic(m)) { L.push(`  static inline ${ft} ${fname}{};`); continue; }
        if (skip.has(raw)) { if (ts.isPropertyDeclaration(m) && m.initializer) fieldInits.push(`  this->${fname} = ${this.conv(m.initializer, t)};`); continue; }
        L.push(`  ${ft} ${fname}{};`);
        dynFields.push({ raw, t, weak, opt: this.optVal(m) });
        if (this.optVal(m)) L.push(`  bool __has_${fname} = false;`);
        if (ts.isPropertyDeclaration(m) && m.initializer) fieldInits.push(`  this->${fname} = ${this.conv(m.initializer, t)};`);
        if (t.k !== 'fn' && !raw.startsWith('#')) jsonFields.push(`  zrt::json_field(sb, first, "${raw}", this->${fname});`);
      } else if (ts.isConstructorDeclaration(m) && m.body && ts.isClassDeclaration(c)) {
        for (const p of m.parameters) {
          if (ts.getCombinedModifierFlags(p) & (ts.ModifierFlags.Public | ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Readonly)) {
            const t = this.s.paramType(p);
            const pn = this.id(p.name.getText());
            L.push(`  ${this.cpp(t)} ${pn}{};`);
            dynFields.push({ raw: p.name.getText(), t, weak: false, opt: false });
            fieldInits.unshift(`  this->${pn} = ${pn};`);
            jsonFields.push(`  zrt::json_field(sb, first, "${p.name.getText()}", this->${pn});`);
          }
        }
      }
    }
    if (ts.isClassDeclaration(c)) {
      const pooled = this.decoratorArg(c, 'pooled');
      if (pooled !== undefined) {
        L.push(`  static void* zrt_take() { return zrt::Pool<${self}, ${pooled}>::take(); }`);
        L.push(`  void zrt_delete() override { this->~${name}(); zrt::Pool<${self}, ${pooled}>::give(this); }`);
      }
      const ctor = c.members.find(ts.isConstructorDeclaration);
      const ps = this.ctorParams(c);
      // inherited constructor of a generic base (`class Item extends Component<ItemProps, S>`): substitute its type args
      let subst: Map<string, ZT> | undefined;
      const ext = !ctor ? c.heritageClauses?.find(h => h.token === this.K.ExtendsKeyword)?.types[0] : undefined;
      if (ext?.typeArguments && base.decl && ts.isClassDeclaration(base.decl) && base.decl.typeParameters)
        subst = new Map(base.decl.typeParameters.map((tp, i) => [tp.name.text, this.s.fromTypeNode(ext.typeArguments![i])] as [string, ZT]));
      L.push(`  ${name}(${this.params(ps, true, subst)});`);
      let superArgs = '';
      let bodyStmts: readonly ts.Statement[] = [];
      if (ctor?.body) {
        bodyStmts = ctor.body.statements;
        const first = bodyStmts[0];
        if (first && ts.isExpressionStatement(first) && ts.isCallExpression(first.expression) && first.expression.expression.kind === this.K.SuperKeyword) {
          const bctor = base.decl && ts.isClassDeclaration(base.decl) ? this.ctorParams(base.decl) : [];
          superArgs = first.expression.arguments.map((a, i) => this.conv(a, bctor[i] ? this.s.paramType(bctor[i]) : this.s.ztypeOf(a))).join(', ');
          bodyStmts = bodyStmts.slice(1);
        }
      } else if (base.decl || this.s.errorBase(c)) {
        superArgs = ps.map((p, i) => this.paramName(p, i)).join(', ');
      }
      const body = this.withCtx({ ret: VOID, inCtor: true, catches: [], breaks: [], self: 'this' }, () => (this.o.dev ? '  zrt::LocFrame __lf;\n' : '') + this.prologue(ps, 1) + bodyStmts.map(st => this.stmt(st, 1)).join(''));
      B.push(`${tp}${self}::${name}(${this.params(ps, false, subst)}) : ${base.code}(${superArgs}) {\n${fieldInits.join('\n')}${fieldInits.length ? '\n' : ''}${body}}`);
    } else {
      L.push(`  ${name}() {}`);
    }
    for (const m of isUnionBase ? [] : this.s.ownMembers(c)) {
      if (ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) {
        if (m.name.getText().includes('Symbol.iterator')) continue;
        const st = this.isStatic(m);
        const abstract = ts.isMethodSignature(m) || (ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Abstract) !== 0;
        const mt = this.tparams(m.typeParameters);
        const rt = this.s.retOf(m);
        const ret = this.cpp(rt);
        const mname = this.id(m.name.getText());
        L.push(`  ${mt}${st ? 'static ' : virt ? 'virtual ' : ''}${ret} ${mname}(${this.params(m.parameters, true)})${abstract ? ' = 0' : ''};`);
        if (!abstract && ts.isMethodDeclaration(m) && m.body) {
          let body: string;
          if (this.s.isAsyncFn(m) || this.s.isGeneratorFn(m)) {
            if (tps?.length || m.typeParameters?.length) this.s.fail(m, 'Z9031', 'generic async methods are not supported yet');
            body = this.frameEntry(m, `${name}_${mname}`, st ? undefined : `zrt::Ref<${self}>`);
          } else body = this.withCtx({ ret: rt, inCtor: false, catches: [], breaks: [], self: 'this' }, () => this.fnBlock(m.parameters, m.body!, 0));
          B.push(`${tp}${mt}${ret} ${self}::${mname}(${this.params(m.parameters, false)}) ${body}`);
        }
      } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
        const get = ts.isGetAccessorDeclaration(m);
        const mname = (get ? 'get_' : 'set_') + this.id(m.name.getText());
        const rt = get ? this.s.declType(m) : VOID;
        L.push(`  ${virt ? 'virtual ' : ''}${this.cpp(rt)} ${mname}(${this.params(m.parameters, true)});`);
        if (m.body) B.push(`${tp}${this.cpp(rt)} ${self}::${mname}(${this.params(m.parameters, false)}) ${this.withCtx({ ret: rt, inCtor: false, catches: [], breaks: [], self: 'this' }, () => this.fnBlock(m.parameters, m.body!, 0))}`);
      }
    }
    const baseIsUser = !!base.decl;
    const errBase = ts.isClassDeclaration(c) && this.s.errorBase(c);
    L.push(`  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID || ${base.code}::zrt_isa(id); }`);
    L.push(`  void zrt_fields(zrt::StrBuilder& sb, bool& first) const;`);
    L.push(`  void zrt_json(zrt::StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }`);
    // console.log: `Name { field: value }` for classes, `{ field: value }` for interfaces and object types
    L.push(`  void zrt_ifields(zrt::InspParts& p, zrt::Insp& in) const override;`);
    if (!errBase) L.push(`  void zrt_inspect(zrt::StrBuilder& sb, zrt::Insp& in) const override { zrt::insp_object(sb, in, this, ${ts.isClassDeclaration(c) && c.name ? JSON.stringify(c.name.text) : 'nullptr'}); }`);
    if (this.s.usesDyn) { const [dl, db] = this.dynAccessors(c, self, tp, base.code, dynFields); L.push(...dl); B.push(...db); }
    B.push(`${tp}void ${self}::zrt_fields(zrt::StrBuilder& sb, bool& first) const {\n${baseIsUser || errBase ? `  ${base.code}::zrt_fields(sb, first);\n` : '  (void)sb; (void)first;\n'}${jsonFields.join('\n')}\n}`);
    const inspFields = jsonFields.map(f => f.replace('zrt::json_field(sb, first,', 'zrt::insp_field(p, in,'));
    B.push(`${tp}void ${self}::zrt_ifields(zrt::InspParts& p, zrt::Insp& in) const {\n${baseIsUser ? `  ${base.code}::zrt_ifields(p, in);\n` : '  (void)p; (void)in;\n'}${inspFields.join('\n')}\n}`);
    L.push('};', '}');
    return [L.join('\n'), `namespace ${ns} {\n${B.join('\n')}\n}`];
  }
  hasDecorator(m: ts.Node, name: string): boolean {
    return (ts.canHaveDecorators(m) ? ts.getDecorators(m) ?? [] : []).some(d => d.expression.getText() === name || d.expression.getText().startsWith(name + '('));
  }
  decoratorArg(m: ts.Node, name: string): string | undefined {
    const d = (ts.canHaveDecorators(m) ? ts.getDecorators(m) ?? [] : []).find(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === name);
    return d && ts.isCallExpression(d.expression) ? d.expression.arguments[0]?.getText() : undefined;
  }

  // ---------- functions ----------
  withCtx<T>(c: Ctx, f: () => T): T {
    const saved = this.ctx;
    this.ctx = c;
    try { return f(); } finally { this.ctx = saved; }
  }
  fnHead(f: ts.FunctionDeclaration, proto: boolean): string {
    return `${this.tparams(f.typeParameters)}${this.cpp(this.s.retOf(f))} ${this.id(f.name!.text)}(${this.params(f.parameters, proto)})`;
  }
  fnBody(f: ts.FunctionDeclaration): string {
    if (this.s.isAsyncFn(f) || this.s.isGeneratorFn(f)) {
      if (f.typeParameters?.length) this.s.fail(f, 'Z9031', 'generic async functions are not supported yet');
      return this.frameEntry(f, this.id(f.name!.text));
    }
    return this.withCtx({ ret: this.s.retOf(f), inCtor: false, catches: [], breaks: [], self: 'this' }, () => this.fnBlock(f.parameters, f.body!, 0));
  }
  fnBlock(ps: readonly ts.ParameterDeclaration[], b: ts.Block, d: number): string {
    // TS proves exhaustive returns (e.g. a switch over a union); C++ still wants a final return
    const tail = this.ctx.ret.k !== 'void' && !this.ctx.inCtor ? `${this.ind(d + 1)}return {};\n` : '';
    return `{\n${this.o.dev ? `${this.ind(d + 1)}zrt::LocFrame __lf;\n` : ''}${this.prologue(ps, d + 1)}${b.statements.map(s => this.stmt(s, d + 1)).join('')}${tail}${this.ind(d)}}`;
  }

  // ---------- async functions and generators: stackless frames ----------
  /**
   * Emits the frame struct + step() for `f`, and returns the entry body that creates and starts it.
   * `selfType` is set for methods (frame keeps the receiver alive).
   */
  frameEntry(f: FnLike, baseName: string, selfType?: string, captures: { name: string; type: string }[] = []): string {
    const ns = this.ns(f.getSourceFile());
    const gen = this.s.isGeneratorFn(f);
    const rt = this.s.retOf(f);
    const el: ZT = gen ? (rt.k === 'gen' ? rt.el : this.s.fail(f, 'Z9032', 'annotate generators with Generator<T>')) : (rt.k === 'promise' ? rt.el : VOID);
    const fname = `__${gen ? 'gen' : 'async'}_${baseName}_${this.tmp++}`;
    const frame: Frame = { kind: gen ? 'gen' : 'async', fields: new Map(), state: 0, awaits: new Map(), el, name: fname };
    f.parameters.forEach((p, i) => {
      if (!ts.isIdentifier(p.name)) this.s.fail(p, 'Z9007', 'destructuring parameters of async functions is not supported yet');
      const sym = this.s.symbolOf(p.name);
      const t = this.cpp(this.s.paramType(p));
      frame.fields.set(this.id(p.name.text), sym && this.s.boxed.has(sym) ? `zrt::Ref<zrt::Cell<${t}>>` : t);
      void i;
    });
    for (const c of captures) frame.fields.set(c.name, c.type);
    if (selfType) frame.fields.set('self', selfType);
    const body = f.body!;
    const stmts = this.withCtx({ ret: el, inCtor: false, catches: [], breaks: [], frame, self: selfType ? 'self' : 'this' }, () =>
      ts.isBlock(body) ? body.statements.map(s => this.stmt(s, 2)).join('') : `    ${this.frameReturn(body)}\n`);
    const baseT = gen ? `zrt::GenFrame<${this.cpp(el)}>` : `zrt::AsyncFrame<${this.val(el)}>`;
    const fields = [...frame.fields].map(([n, t]) => `  ${t} ${n}{};`).join('\n');
    this.frameDefs.push(`namespace ${ns} {\nstruct ${fname} : ${baseT} {\n${fields}\n  ${gen ? 'bool' : 'void'} step() override;\n};\n}`);
    const cases = Array.from({ length: frame.state }, (_, i) => i + 1);
    void cases;
    const end = gen ? '  state = -1;\n  return false;' : '  this->zrt_done();';
    this.frameBodies.push(`namespace ${ns} {\n${gen ? 'bool' : 'void'} ${fname}::step() {\n  switch (state) {\n  case 0:;\n${stmts}  }\n${end}\n}\n}`);
    const assigns = f.parameters.map(p => {
      const n = this.id(p.name.getText());
      const sym = this.s.symbolOf(p.name);
      return sym && this.s.boxed.has(sym) ? `  __f->${n} = zrt::cell<${this.cpp(this.s.paramType(p))}>(${n});\n` : `  __f->${n} = ${n};\n`;
    }).join('') + captures.map(c => `  __f->${c.name} = ${c.name};\n`).join('') + (selfType ? `  __f->self = ${this.ctx.frame && this.ctx.self === 'self' ? 'self' : 'this'};\n` : '');
    return gen ? `{\n  auto __f = zrt::make<${ns}::${fname}>();\n${assigns}  return zrt::Gen<${this.cpp(el)}>(__f);\n}`
      : `{\n  auto __f = zrt::make<${ns}::${fname}>();\n${assigns}  __f->step();\n  return __f->zrt_promise();\n}`;
  }
  frameReturn(e: ts.Expression): string {
    const f = this.ctx.frame!;
    return f.el.k === 'void' ? `${this.expr(e)}; this->zrt_done(); return;` : `this->zrt_resolve(${this.conv(e, f.el)}); return;`;
  }
  /** Declares a frame field (async/gen) or a local; returns the C++ statement prefix. */
  local(name: string, type: string, init: string | undefined, d: number): string {
    const f = this.ctx.frame;
    if (f) {
      const prev = f.fields.get(name);
      if (prev && prev !== type) this.s.fail(this.s.fe.entry, 'Z9033', `'${name}' is declared twice with different types in one async function; rename one`);
      f.fields.set(name, type);
      return init === undefined ? '' : `${this.ind(d)}${name} = ${init};\n`;
    }
    return `${this.ind(d)}${type} ${name}${init === undefined ? '{}' : ` = ${init}`};\n`;
  }
  /** Lowers the awaits/yields of one statement; returns the code to run before it. */
  suspendPoints(s: ts.Statement, d: number): string {
    const f = this.ctx.frame;
    if (!f) return '';
    const I = this.ind(d);
    let out = '';
    const visit = (n: ts.Node) => {
      if (ts.isFunctionLike(n)) return;
      if (ts.isAwaitExpression(n) || ts.isYieldExpression(n)) {
        ts.forEachChild(n, visit);
        this.checkSuspendPosition(n, s);
        if (ts.isAwaitExpression(n)) {
          if (f.kind !== 'async') this.s.fail(n, 'Z9018', 'await is only allowed in async functions');
          const pt = this.s.ztypeOf(n.expression);
          if (pt.k !== 'promise') this.s.fail(n, 'Z9018', 'await needs a Promise');
          const field = this.newTmp('aw');
          f.fields.set(field, this.cpp(pt));
          const st = ++f.state;
          f.awaits.set(n, `${field}.value()`);
          out += `${I}${field} = ${this.expr(n.expression)};\n${I}state = ${st}; zrt::await_(this, ${field}); return;\n  case ${st}:;\n` +
            `${I}if (${field}.rejected()) { zrt::g_err = ${field}.error(); ${this.propagate()}; }\n`;
        } else {
          if (f.kind !== 'gen') this.s.fail(n, 'Z9032', 'yield is only allowed in generators');
          if (!ts.isExpressionStatement(n.parent)) this.s.fail(n, 'Z9032', 'yield must be a statement (its result is not supported)');
          if (n.asteriskToken) this.s.fail(n, 'Z9032', 'yield* is not supported yet');
          const st = ++f.state;
          f.awaits.set(n, '(void)0');
          out += `${I}this->cur = ${n.expression ? this.conv(n.expression, f.el) : `${this.cpp(f.el)}{}`}; state = ${st}; return true;\n  case ${st}:;\n`;
        }
        return;
      }
      ts.forEachChild(n, visit);
    };
    // loop headers are re-evaluated: awaits there need a rewrite we do not support
    if (ts.isWhileStatement(s) || ts.isDoStatement(s)) visit(s.expression);
    else if (ts.isForStatement(s)) { if (s.initializer) visit(s.initializer); for (const x of [s.condition, s.incrementor]) if (x) this.noSuspend(x); }
    else if (ts.isForOfStatement(s)) visit(s.expression);
    else if (ts.isIfStatement(s)) visit(s.expression);
    else if (ts.isSwitchStatement(s)) visit(s.expression);
    else if (ts.isReturnStatement(s) || ts.isExpressionStatement(s) || ts.isVariableStatement(s) || ts.isThrowStatement(s)) visit(s);
    if (ts.isWhileStatement(s) || ts.isDoStatement(s)) this.noSuspend(s.expression);
    return out;
  }
  noSuspend(e: ts.Node) {
    const v = (n: ts.Node): void => { if (ts.isFunctionLike(n)) return; if (ts.isAwaitExpression(n) || ts.isYieldExpression(n)) this.s.fail(n, 'Z9018', 'await/yield in a loop condition is not supported; move it into the loop body'); ts.forEachChild(n, v); };
    v(e);
  }
  checkSuspendPosition(n: ts.Node, s: ts.Statement) {
    for (let p: ts.Node = n; p !== s; p = p.parent) {
      const q = p.parent;
      if (ts.isBinaryExpression(q) && q.right === p && [this.K.AmpersandAmpersandToken, this.K.BarBarToken, this.K.QuestionQuestionToken].includes(q.operatorToken.kind))
        this.s.fail(n, 'Z9018', 'await on the right of &&, || or ?? is not supported; use an if statement');
      if (ts.isConditionalExpression(q) && q.condition !== p) this.s.fail(n, 'Z9018', 'await inside ?: branches is not supported; use an if statement');
    }
  }

  moduleInit(sf: ts.SourceFile): string {
    return this.withCtx({ ret: VOID, inCtor: false, catches: [], breaks: [], self: 'this' }, () => {
      let out = '';
      for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st) ||
          ts.isImportDeclaration(st) || ts.isModuleDeclaration(st)) continue;
        if (ts.isExportDeclaration(st) || ts.isExportAssignment(st)) {
          if (ts.isExportAssignment(st) && this.native.isSpecFile(sf)) continue;
          // `export { X } from './m'`: uses resolve to X's own declaration, nothing to emit
          if (ts.isExportDeclaration(st) && st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) continue;
          this.s.fail(st, 'Z9010', 'only `export` modifiers on declarations are supported');
        }
        if (ts.isClassDeclaration(st)) {
          for (const m of st.members) if (ts.isPropertyDeclaration(m) && this.isStatic(m) && m.initializer)
            out += `  ${this.qual(st)}::${this.id(m.name.getText())} = ${this.conv(m.initializer, this.s.declType(m))};\n`;
          continue;
        }
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            if (!d.initializer) continue;
            if (this.native.isRequire(d.initializer)) continue;
            if (this.hasAwait(d.initializer)) this.s.fail(d, 'Z9018', 'top-level await is not supported; use an async main function');
            if (ts.isIdentifier(d.name)) out += this.line(d) + this.loc(d) + `  ${this.qual(d)} = ${this.check(this.conv(d.initializer, this.s.declType(d)), d.initializer)};\n`;
            else { const tmp = this.newTmp('d'); out += `  auto ${tmp} = ${this.check(this.expr(d.initializer), d.initializer)};\n` + this.destructure(d.name, tmp, this.s.ztypeOf(d.initializer), 1, true); }
          }
          continue;
        }
        out += this.stmt(st, 1);
      }
      return out;
    });
  }
  moduleDeinit(sf: ts.SourceFile): string {
    let out = '';
    // library modules may break their own reference cycles before the leak report (TST-09)
    if (sf.statements.some(s => ts.isFunctionDeclaration(s) && s.name?.text === '__dispose')) out += `  ${this.ns(sf)}::__dispose();\n`;
    for (const st of sf.statements) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) for (const n of this.boundNames(d.name)) out += `  ${this.ns(sf)}::${this.id(n.name)} = ${this.cpp(this.s.declType(n.decl))}{};\n`;
      if (ts.isClassDeclaration(st)) for (const m of st.members) if (ts.isPropertyDeclaration(m) && this.isStatic(m)) out += `  ${this.qual(st)}::${this.id(m.name.getText())} = ${this.cpp(this.s.declType(m))}{};\n`;
    }
    return out;
  }
  boundNames(n: ts.BindingName): { name: string; decl: ts.Declaration }[] {
    if (ts.isIdentifier(n)) return [{ name: n.text, decl: n.parent as ts.Declaration }];
    return n.elements.flatMap(e => ts.isBindingElement(e) ? (ts.isIdentifier(e.name) ? [{ name: e.name.text, decl: e }] : this.boundNames(e.name)) : []);
  }
  hasAwait(n: ts.Node): boolean {
    let r = false;
    const v = (x: ts.Node) => { if (ts.isFunctionLike(x)) return; if (ts.isAwaitExpression(x)) r = true; else ts.forEachChild(x, v); };
    v(n);
    return r;
  }

  // ---------- statements ----------
  line(n: ts.Node): string {
    if (!this.o.debug || this.ctx.frame) return '';
    const sf = n.getSourceFile();
    const l = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    return `#line ${l} "${path.relative(this.o.outDir, sf.fileName)}"\n`;
  }
  ind(d: number) { return '  '.repeat(d); }
  block(b: ts.Block, d: number): string {
    return `{\n${b.statements.map(s => this.stmt(s, d + 1)).join('')}${this.ind(d)}}`;
  }
  body(s: ts.Statement, d: number): string {
    return ts.isBlock(s) ? this.block(s, d) : `{\n${this.stmt(s, d + 1)}${this.ind(d)}}`;
  }
  cond(e: ts.Expression): string {
    const t = this.s.ztypeOf(e);
    this.strictDyn(e, t);
    return t.k === 'bool' ? this.expr(e) : `zrt::truthy(${this.expr(e)})`;
  }
  /** Code that leaves the current function (or jumps to the innermost catch) with zrt::g_err set. */
  propagate(): string {
    const c = this.ctx;
    if (c.catches.length) return `goto ${c.catches[c.catches.length - 1]}`;
    if (c.frame) return c.frame.kind === 'async' ? 'this->zrt_reject(zrt::take_error()); return' : 'state = -1; return false';
    return c.inCtor || c.ret.k === 'void' ? 'return' : 'return {}';
  }
  /** Adds the error check after a call that may throw (statement expression, GCC/Clang). */
  check(code: string, e: ts.Node): string {
    if (!(ts.isCallExpression(e) || ts.isNewExpression(e)) || !this.s.mayThrow(e)) return code;
    const t = this.s.tryZ(e as ts.Expression);
    if (t.k === 'void') return `({ ${code}; if (zrt::g_err.p) { ${this.propagate()}; } })`;
    return `({ auto __r = ${code}; if (zrt::g_err.p) { ${this.propagate()}; } __r; })`;
  }

  stmt(s: ts.Statement, d: number): string {
    const pre = this.suspendPoints(s, d);
    // `else if`: a prefix would break the chain
    const elseIf = ts.isIfStatement(s) && ts.isIfStatement(s.parent) && s.parent.elseStatement === s;
    return pre + (elseIf || ts.isBlock(s) ? '' : this.loc(s)) + this.stmtInner(s, d);
  }
  /** Dev builds: records the statement's source location in the current LocFrame. */
  loc(n: ts.Node): string {
    if (!this.o.dev) return '';
    const sf = n.getSourceFile();
    const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    const lib = path.join(ZINC_ROOT, 'lib') + path.sep;
    const file = sf.fileName.startsWith(lib) ? 'zinc/' + sf.fileName.slice(lib.length) : path.relative(this.s.root, sf.fileName);
    let fn: ts.Node | undefined = n.parent;
    while (fn && !ts.isFunctionLike(fn) && !ts.isClassDeclaration(fn)) fn = fn.parent;
    const name = fn && (fn as ts.NamedDeclaration).name ? (fn as ts.NamedDeclaration).name!.getText() : fn && ts.isConstructorDeclaration(fn) ? 'constructor' : fn ? '<anonymous>' : '<module>';
    const key = `${name} (${file}:${line})`;
    let i = this.locIndex.get(key);
    if (i === undefined) { i = this.locs.length; this.locs.push(key); this.locIndex.set(key, i); }
    return `__lf.loc = ${i};\n`;
  }
  stmtInner(s: ts.Statement, d: number): string {
    const I = this.ind(d);
    const L = this.line(s);
    if (ts.isBlock(s)) return I + this.block(s, d) + '\n';
    if (ts.isEmptyStatement(s)) return '';
    if (ts.isExpressionStatement(s)) {
      if (ts.isYieldExpression(s.expression)) return '';
      return `${L}${I}${this.expr(s.expression)};\n`;
    }
    if (ts.isVariableStatement(s)) return L + this.varList(s.declarationList, d);
    if (ts.isIfStatement(s)) {
      let r = `${L}${I}if (${this.cond(s.expression)}) ${this.body(s.thenStatement, d)}`;
      if (s.elseStatement) r += ts.isIfStatement(s.elseStatement) ? ` else\n${this.stmt(s.elseStatement, d)}` : ` else ${this.body(s.elseStatement, d)}\n`;
      else r += '\n';
      return r;
    }
    if (ts.isWhileStatement(s)) return `${L}${I}while (${this.cond(s.expression)}) ${this.loopBody(s.statement, d)}\n`;
    if (ts.isDoStatement(s)) return `${L}${I}do ${this.loopBody(s.statement, d)} while (${this.cond(s.expression)});\n`;
    if (ts.isForStatement(s)) {
      let init = '';
      if (s.initializer) init = ts.isVariableDeclarationList(s.initializer) ? this.varList(s.initializer, d + 1) : `${this.ind(d + 1)}${this.expr(s.initializer)};\n`;
      const c = s.condition ? this.cond(s.condition) : '';
      const inc = s.incrementor ? this.expr(s.incrementor) : '';
      return `${L}${I}{\n${init}${this.ind(d + 1)}for (; ${c}; ${inc}) ${this.loopBody(s.statement, d + 1)}\n${I}}\n`;
    }
    if (ts.isForOfStatement(s)) return L + this.forOf(s, d);
    if (ts.isBreakStatement(s)) {
      if (s.label) this.s.fail(s, 'Z9011', 'labeled statements are not supported yet');
      const top = this.ctx.breaks[this.ctx.breaks.length - 1];
      return `${I}${top ? `goto ${top}` : 'break'};\n`;
    }
    if (ts.isContinueStatement(s)) {
      if (s.label) this.s.fail(s, 'Z9011', 'labeled statements are not supported yet');
      return `${I}continue;\n`;
    }
    if (ts.isReturnStatement(s)) {
      const f = this.ctx.frame;
      if (f) {
        if (f.kind === 'gen') return `${L}${I}state = -1; return false;\n`;
        return s.expression ? `${L}${I}${this.frameReturn(s.expression)}\n` : `${L}${I}this->zrt_done(); return;\n`;
      }
      if (!s.expression || this.ctx.inCtor) return `${L}${I}return;\n`;
      if (this.ctx.ret.k === 'void') return `${L}${I}${this.expr(s.expression)}; return;\n`;
      return `${L}${I}return ${this.conv(s.expression, this.ctx.ret)};\n`;
    }
    if (ts.isSwitchStatement(s)) return L + this.switchStmt(s, d);
    if (ts.isThrowStatement(s)) {
      const t = this.s.ztypeOf(s.expression);
      if (t.k !== 'obj' || !this.s.inherits(t.decl, this.s.errorDecl)) this.s.fail(s, 'Z1014', 'only Error instances (or subclasses) can be thrown (LNG-15)');
      return `${L}${I}{ zrt::g_err = ${this.expr(s.expression)}; ${this.o.dev ? 'zrt::loc_throw(); ' : ''}${this.propagate()}; }\n`;
    }
    if (ts.isTryStatement(s)) return L + this.tryStmt(s, d);
    if (ts.isFunctionDeclaration(s) && s.name && s.body) {
      if (this.s.isAsyncFn(s) || this.s.isGeneratorFn(s)) return `${L}${I}auto ${this.id(s.name.text)} = ${this.asyncLambda(s)};\n`;
      const ft = this.s.fnType(s) as Extract<ZT, { k: 'fn' }>;
      return `${L}${I}auto ${this.id(s.name.text)} = ${this.lambda(s, ft)};\n`;
    }
    if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) return '';
    if (ts.isClassDeclaration(s)) this.s.fail(s, 'Z9012', 'classes must be declared at module level');
    if (ts.isLabeledStatement(s)) this.s.fail(s, 'Z9011', 'labeled statements are not supported yet');
    return this.s.fail(s, 'Z9000', `statement '${this.K[s.kind]}' is not supported yet`);
  }

  tryStmt(s: ts.TryStatement, d: number): string {
    const I = this.ind(d), I1 = this.ind(d + 1);
    if (this.ctx.frame && s.finallyBlock) this.s.fail(s, 'Z9034', "'finally' inside async functions and generators is not supported yet");
    let out = `${I}{\n`;
    if (s.finallyBlock) {
      const fb = s.finallyBlock;
      const bad = (n: ts.Node): void => { if (ts.isFunctionLike(n)) return; if (ts.isReturnStatement(n) || ts.isBreakStatement(n) || ts.isContinueStatement(n)) this.s.fail(n, 'Z9034', 'return/break/continue inside finally is not supported'); ts.forEachChild(n, bad); };
      bad(fb);
      const body = this.withCtx({ ...this.ctx, catches: [], breaks: [], ret: VOID, inCtor: true }, () => fb.statements.map(x => this.stmt(x, d + 2)).join(''));
      out += `${I1}auto ${this.newTmp('fin')} = zrt::defer([&]() {\n${body}${I1}});\n`;
    }
    if (!s.catchClause) return out + `${I1}${this.block(s.tryBlock, d + 1)}\n${I}}\n`;
    const lab = this.newTmp('catch'), end = this.newTmp('tryend');
    this.ctx.catches.push(lab);
    const tryBody = this.block(s.tryBlock, d + 1);
    this.ctx.catches.pop();
    const cc = s.catchClause;
    if (this.ctx.frame && this.hasAwait(cc.block)) this.s.fail(cc, 'Z9034', 'await inside catch is not supported yet');
    let bind = '';
    if (cc.variableDeclaration) {
      if (!ts.isIdentifier(cc.variableDeclaration.name)) this.s.fail(cc, 'Z9007', 'destructuring a caught error is not supported');
      bind = `${this.ind(d + 2)}zrt::Ref<zrt::Error> ${this.id(cc.variableDeclaration.name.text)} = zrt::take_error();\n`;
    } else bind = `${this.ind(d + 2)}zrt::take_error();\n`;
    const catchBody = cc.block.statements.map(x => this.stmt(x, d + 2)).join('');
    return out + `${I1}${tryBody}\n${I1}goto ${end};\n${I1}${lab}: {\n${bind}${catchBody}${I1}}\n${I1}${end}:;\n${I}}\n`;
  }

  loopBody(s: ts.Statement, d: number): string {
    this.ctx.breaks.push(null);
    const r = this.body(s, d);
    this.ctx.breaks.pop();
    return r;
  }

  varList(l: ts.VariableDeclarationList, d: number): string {
    const using = !!(l.flags & ts.NodeFlags.Using);
    if (using && this.ctx.frame) this.s.fail(l, 'Z9034', "'using' inside async functions and generators is not supported yet");
    let out = '';
    for (const v of l.declarations) {
      const init = v.initializer;
      if (!ts.isIdentifier(v.name)) {
        if (!init) this.s.fail(v, 'Z9007', 'destructuring needs an initializer');
        const src = this.newTmp('d');
        const st = this.s.ztypeOf(init!);
        out += this.local(src, this.cpp(st), this.check(this.expr(init!), init!), d);
        out += this.destructure(v.name, src, st, d);
        continue;
      }
      const name = this.id(v.name.text);
      const t = this.s.declType(v);
      const sym = this.s.symbolOf(v.name)!;
      const value = init ? this.check(this.conv(init, t), init) : undefined;
      if (this.s.boxed.has(sym)) out += this.local(name, `zrt::Ref<zrt::Cell<${this.cpp(t)}>>`, `zrt::cell<${this.cpp(t)}>(${value ?? this.cpp(t) + '{}'})`, d);
      else if (!this.ctx.frame && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && !this.s.isAsyncFn(init) && l.flags & ts.NodeFlags.Const)
        out += `${this.ind(d)}auto ${name} = ${this.expr(init)};\n`;  // zero-alloc: stays a C++ lambda unless it escapes
      else out += this.local(name, this.cpp(t), value, d);
      if (using) out += `${this.ind(d)}auto ${this.newTmp('use')} = zrt::defer([&]() { if (${name}) ${name}->zrt_dispose(); });\n`;
    }
    return out;
  }

  /** Binds the names of a destructuring pattern from `src` (LNG, CMP-06). */
  destructure(pat: ts.BindingName, src: string, srcT: ZT, d: number, global = false): string {
    if (ts.isIdentifier(pat)) return '';
    let out = '';
    pat.elements.forEach((e, idx) => {
      if (!ts.isBindingElement(e)) return;
      if (e.dotDotDotToken) this.s.fail(e, 'Z9016', 'rest elements in destructuring are not supported yet');
      const t = this.s.bindingType(e);
      let access: string;
      if (ts.isObjectBindingPattern(pat)) {
        if (srcT.k !== 'obj') this.s.fail(e, 'Z9007', 'object destructuring needs an object');
        access = `${src}->${this.id((e.propertyName ?? e.name).getText())}`;
      } else access = srcT.k === 'arr' ? `${src}.get(${idx})` : srcT.k === 'tup' ? `${src}.v${idx}` : this.s.fail(e, 'Z9007', 'array destructuring needs an array');
      if (ts.isIdentifier(e.name)) {
        const n = this.id(e.name.text);
        if (global) out += `${this.ind(d)}${this.ns(e.getSourceFile())}::${n} = ${access};\n`;
        else {
          const sym = this.s.symbolOf(e.name);
          out += sym && this.s.boxed.has(sym) ? this.local(n, `zrt::Ref<zrt::Cell<${this.cpp(t)}>>`, `zrt::cell<${this.cpp(t)}>(${access})`, d) : this.local(n, this.cpp(t), access, d);
        }
      } else {
        const tmp = this.newTmp('d');
        out += this.local(tmp, this.cpp(t), access, d) + this.destructure(e.name, tmp, t, d, global);
      }
    });
    return out;
  }

  forOf(s: ts.ForOfStatement, d: number): string {
    const I = this.ind(d), I1 = this.ind(d + 1);
    const t = this.s.ztypeOf(s.expression);
    const c = this.newTmp('c'), i = this.newTmp('i');
    const decl = (s.initializer as ts.VariableDeclarationList).declarations?.[0];
    if (!decl) this.s.fail(s, 'Z9005', 'for-of needs a const/let declaration');
    this.ctx.breaks.push(null);
    let head: string, bind = '';
    const bindTo = (et: ZT, access: string) => {
      if (ts.isIdentifier(decl.name)) {
        const sym = this.s.symbolOf(decl.name);
        const n = this.id(decl.name.text);
        return sym && this.s.boxed.has(sym) ? this.local(n, `zrt::Ref<zrt::Cell<${this.cpp(et)}>>`, `zrt::cell<${this.cpp(et)}>(${access})`, d + 2) : this.local(n, this.cpp(et), access, d + 2);
      }
      const tmp = this.newTmp('d');
      return this.local(tmp, this.cpp(et), access, d + 2) + this.destructure(decl.name, tmp, et, d + 2);
    };
    const prelude = t.k === 'dyn' ? this.local(c, 'zrt::Array<zrt::Dyn>', `zrt::dyn_iter(${this.expr(s.expression)})`, d + 1) : this.local(c, this.cpp(t), this.expr(s.expression), d + 1);
    if (t.k === 'arr' || t.k === 'str' || t.k === 'dyn') {
      const et = t.k === 'arr' ? t.el : t.k === 'dyn' ? DYN : STR;
      head = `for (${this.ctx.frame ? '' : 'int32_t '}${i} = 0; ${i} < ${c}.length(); ${i}++)`;
      if (this.ctx.frame) this.ctx.frame.fields.set(i, 'int32_t');
      bind = bindTo(et, t.k === 'str' ? `${c}.at(${i})` : `${c}.get(${i})`);
    } else if (t.k === 'map' || t.k === 'set') {
      head = `for (${this.ctx.frame ? '' : 'int32_t '}${i} = 0; ${i} < ${c}.slots(); ${i}++)`;
      if (this.ctx.frame) this.ctx.frame.fields.set(i, 'int32_t');
      bind = `${I1}  if (!${c}.live_at(${i})) continue;\n`;
      if (t.k === 'map') {
        if (!ts.isArrayBindingPattern(decl.name) || decl.name.elements.length !== 2) this.s.fail(decl, 'Z9005', 'iterate a Map with `for (const [k, v] of map)`');
        const [k, v] = decl.name.elements.map(e => ts.isBindingElement(e) ? this.id(e.name.getText()) : '_');
        bind += this.local(k, this.cpp(t.key), `${c}.key_at(${i})`, d + 2) + this.local(v, this.cpp(t.val), `${c}.val_at(${i})`, d + 2);
      } else bind += bindTo(t.el, `${c}.key_at(${i})`);
    } else if (t.k === 'gen') {
      head = `while (${c}->step())`;
      bind = bindTo(t.el, `${c}->cur`);
    } else return this.s.fail(s.expression, 'Z9005', 'for-of is supported on arrays, strings, Map, Set and generators');
    const inner = ts.isBlock(s.statement) ? s.statement.statements.map(x => this.stmt(x, d + 2)).join('') : this.stmt(s.statement, d + 2);
    this.ctx.breaks.pop();
    return `${I}{\n${prelude}${I1}${head} {\n${bind}${inner}${I1}}\n${I}}\n`;
  }

  switchStmt(s: ts.SwitchStatement, d: number): string {
    const I = this.ind(d), I1 = this.ind(d + 1);
    const v = this.newTmp('sw'), f = this.newTmp('f'), end = this.newTmp('swend');
    const st = this.s.ztypeOf(s.expression);
    let out = `${I}{\n${this.local(v, this.cpp(st), this.expr(s.expression), d + 1)}${this.local(f, 'bool', 'false', d + 1)}`;
    this.ctx.breaks.push(end);
    const clauses = s.caseBlock.clauses;
    clauses.forEach((cl, idx) => {
      const stmts = cl.statements.map(x => this.stmt(x, d + 2)).join('');
      if (ts.isDefaultClause(cl)) {
        if (idx !== clauses.length - 1) this.s.fail(cl, 'Z9014', "'default' must be the last clause");
        out += `${I1}{\n${I1}  (void)${f};\n${stmts}${I1}}\n`;
      } else {
        out += `${I1}if (${f} || ${v} == ${this.conv(cl.expression, st)}) {\n${I1}  ${f} = true;\n${stmts}${I1}}\n`;
      }
    });
    this.ctx.breaks.pop();
    return out + `${I1}${end}:;\n${I}}\n`;
  }

  // ---------- expressions ----------
  /** Emit `e` converted to `to` (assignment, argument, return: the coercion points of LNG-05). */
  conv(e: ts.Expression, to: ZT | undefined): string {
    if (to?.k === 'dyn') return this.toDynExpr(e);
    const code = this.expr(e, to);
    if (!to) return code;
    if (to.k === 'num' && this.s.isIntLiteral(e) && (isInt(to.m) || isFx(to.m) || to.m === 'f64')) return code;
    if (to.k === 'arr' && ts.isArrayLiteralExpression(e)) return code;  // built with `to` as its element type
    return this.coerce(code, this.s.ztypeOf(e), to, e);
  }
  coerce(code: string, from: ZT, to: ZT, at: ts.Node): string {
    if (from.k === 'dyn' && to.k !== 'dyn') return this.dynConv(code, to, at);
    if (to.k === 'dyn' && from.k !== 'dyn') return this.toDyn(code, from, at);
    if (from.k === 'num' && to.k === 'num') {
      if (from.m === to.m) return code;
      if (isFx(to.m)) return `${NUMC[to.m]}(${isFx(from.m) ? `static_cast<double>(${code})` : code})`;
      if (isFx(from.m)) return isInt(to.m) ? `zrt::cvt<${NUMC[to.m]}>(static_cast<double>(${code}))` : `static_cast<${NUMC[to.m]}>(${code})`;
      if (isInt(to.m)) return isInt(from.m) ? `static_cast<${NUMC[to.m]}>(${code})` : `zrt::cvt<${NUMC[to.m]}>(${code})`;
      if (to.m === 'f32') return `static_cast<float>(${code})`;
      return isInt(from.m) ? `static_cast<double>(${code})` : code;
    }
    if (from.k === 'obj' && to.k === 'obj' && from.decl !== to.decl) {
      if (this.s.inherits(from.decl, to.decl)) return code;
      if (this.s.inherits(to.decl, from.decl)) return `zrt::cast<${this.cls(to)}>(${code})`;
      this.s.fail(at, 'Z9002', `structural conversion from '${this.declName(from.decl)}' to '${this.declName(to.decl)}' is not supported; declare 'implements' or 'extends'`);
    }
    if (from.k === 'arr' && to.k === 'arr' && this.cpp(from) !== this.cpp(to) && !hasTp(from.el) && !hasTp(to.el))
      this.s.fail(at, 'Z9003', `array element types differ (${this.cpp(from.el)} vs ${this.cpp(to.el)}); annotate the element or callback return type`);
    return code;
  }

  numLit(text: string, want: ZT | undefined): string {
    const v = Number(text);
    const m = want?.k === 'num' ? want.m : this.s.numberKind;
    if (isFx(m)) {
      const sh = m === 'fx12' ? 4096 : 65536;
      return `${NUMC[m]}::raw(${Math.floor(v * sh + 0.5) | 0})`;
    }
    if (isInt(m) && Number.isInteger(v)) {
      if (m === 'u32' || m === 'u64' || v > 0x7fffffff) return `${v}${m === 'i64' || m === 'u64' ? 'll' : 'u'}`;
      return String(v);
    }
    let s = String(v);
    if (s === 'Infinity') return 'zrt::Inf';
    if (!/[.eE]/.test(s)) s += '.0';
    return m === 'f32' ? s + 'f' : s;
  }

  expr(e: ts.Expression, want?: ZT): string {
    const K = this.K;
    if (ts.isParenthesizedExpression(e)) return `(${this.expr(e.expression, want)})`;
    if (ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) return this.expr(e.expression, want);
    if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) {
      if (e.type.getText() === 'const') return this.expr(e.expression, want);
      const to = this.s.fromTypeNode(e.type);
      return this.coerce(this.expr(e.expression, to), this.s.ztypeOf(e.expression), to, e);
    }
    if (ts.isAwaitExpression(e) || ts.isYieldExpression(e)) {
      const r = this.ctx.frame?.awaits.get(e);
      if (!r) this.s.fail(e, 'Z9018', 'await/yield is only supported as a statement, initializer, assignment or return value');
      return r!;
    }
    if (ts.isNumericLiteral(e)) return this.numLit(e.text, want);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return this.lit(e.text);
    if (ts.isTemplateExpression(e)) {
      const parts: string[] = [];
      if (e.head.text) parts.push(this.lit(e.head.text));
      for (const sp of e.templateSpans) { this.strictDyn(sp.expression); parts.push(this.expr(sp.expression)); if (sp.literal.text) parts.push(this.lit(sp.literal.text)); }
      return `zrt::cat(${parts.join(', ')})`;
    }
    if (e.kind === K.TrueKeyword) return 'true';
    if (e.kind === K.FalseKeyword) return 'false';
    if (want?.k === 'dyn' && (e.kind === K.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined'))) return e.kind === K.NullKeyword ? 'zrt::Dyn(nullptr)' : 'zrt::Dyn()';
    if (e.kind === K.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')) return want && want.k !== 'null' && want.k !== 'num' && want.k !== 'bool' ? `${this.cpp(want)}()` : 'nullptr';
    if (e.kind === K.ThisKeyword) return this.ctx.self;
    if (ts.isIdentifier(e)) return this.ident(e);
    if (this.isChainTop(e)) return this.chain(e);
    if (ts.isPropertyAccessExpression(e)) return e.questionDotToken ? this.optional(e) : this.prop(e);
    if (ts.isElementAccessExpression(e)) {
      const t = this.s.ztypeOf(e.expression);
      if (t.k === 'dyn') return `zrt::dyn_index(${this.expr(e.expression)}, ${this.toDynExpr(e.argumentExpression)})`;
      if (t.k === 'arr') return `${this.expr(e.expression)}.get(${this.index(e.argumentExpression)})`;
      if (t.k === 'str') return `${this.expr(e.expression)}.at(${this.conv(e.argumentExpression, I32)})`;
      if (t.k === 'tup' && ts.isNumericLiteral(e.argumentExpression)) return `${this.expr(e.expression)}.v${e.argumentExpression.text}`;
      return this.s.fail(e, 'Z9015', 'computed property access is only supported on arrays and strings (use Map)');
    }
    if (ts.isCallExpression(e)) return e.questionDotToken ? this.optionalCall(e) : this.check(this.call(e), e);
    if (ts.isNewExpression(e)) return this.check(this.newExpr(e, want), e);
    if (ts.isArrayLiteralExpression(e)) return this.arrLit(e, want);
    if (ts.isObjectLiteralExpression(e)) return this.objLit(e, want);
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
      if (this.s.isAsyncFn(e) || this.s.isGeneratorFn(e)) return this.asyncLambda(e);
      return this.lambda(e, this.s.fnType(e) as Extract<ZT, { k: 'fn' }>);
    }
    if (ts.isConditionalExpression(e)) {
      const t = this.s.ztypeOf(e);
      const up = (x: ts.Expression) => { const c = this.conv(x, t), xt = this.s.ztypeOf(x); return t.k === 'obj' && xt.k === 'obj' && xt.decl !== t.decl ? `${this.cpp(t)}(${c})` : c; };
      return `(${this.cond(e.condition)} ? ${up(e.whenTrue)} : ${up(e.whenFalse)})`;
    }
    if ((ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) && this.s.ztypeOf(e.operand).k === 'dyn') return this.dynUnary(e);
    if (ts.isPrefixUnaryExpression(e)) {
      const o = e.operand;
      switch (e.operator) {
        case K.ExclamationToken: { const c = this.cond(o); return c.startsWith('zrt::') ? `!${c}` : `!(${c})`; }
        case K.MinusToken: return ts.isNumericLiteral(o) ? this.numLit('-' + o.text, want ?? this.s.ztypeOf(o)) : `-(${this.expr(o, want)})`;
        case K.PlusToken: return this.expr(o, want);
        case K.TildeToken: return `~(${this.toI32(o)})`;
        case K.PlusPlusToken: return `++${this.lval(o)}`;
        case K.MinusMinusToken: return `--${this.lval(o)}`;
      }
    }
    if (ts.isPostfixUnaryExpression(e)) return `${this.lval(e.operand)}${e.operator === K.PlusPlusToken ? '++' : '--'}`;
    if (ts.isBinaryExpression(e)) return this.binary(e, want);
    if (ts.isTypeOfExpression(e)) {
      const t = this.s.ztypeOf(e.expression);
      if (t.k === 'dyn') return `zrt::dyn_typeof(${this.expr(e.expression)})`;
      // static type: a constant (null values of reference types are still 'object')
      const name = ({ num: 'number', bool: 'boolean', str: 'string', void: 'undefined', fn: 'function' } as Record<string, string>)[t.k] ?? 'object';
      return ts.isIdentifier(e.expression) || ts.isPropertyAccessExpression(e.expression) ? this.lit(name) : `((void)(${this.expr(e.expression)}), ${this.lit(name)})`;
    }
    return this.s.fail(e, 'Z9000', `expression '${K[e.kind]}' is not supported yet`);
  }

  ident(e: ts.Identifier): string {
    if (e.text === 'NaN') return this.numRet('zrt::NaN');
    if (e.text === 'Infinity') return this.numRet('zrt::Inf');
    const sym = this.s.symbolOf(e);
    const d = this.s.declOf(e);
    if (!d || !sym) return this.s.fail(e, 'Z9019', `unresolved identifier '${e.text}'`);
    const nat = this.native.valueRef(e, d);
    if (nat) return nat;
    if (this.s.isLib(d)) return this.s.fail(e, 'Z9019', `'${e.text}' cannot be used as a value`);
    if (ts.isFunctionDeclaration(d)) {
      const ft = this.s.fnType(d) as Extract<ZT, { k: 'fn' }>;
      const isCallee = ts.isCallExpression(e.parent) && e.parent.expression === e;
      const name = this.isTop(d) ? this.qual(d) : this.id(e.text);
      if (isCallee) return name;
      const ps = ft.params.map((p, i) => `${this.cpp(p)} a${i}`).join(', ');
      return `[=](${ps}) -> ${this.cpp(ft.ret)} { return ${name}(${ft.params.map((_, i) => 'a' + i).join(', ')}); }`;
    }
    if (ts.isClassDeclaration(d)) return this.qual(d);
    const top = (ts.isVariableDeclaration(d) || ts.isBindingElement(d)) && this.isTopBinding(d);
    let name = top ? `${this.ns(d.getSourceFile())}::${this.id(e.text)}` : this.id(e.text);
    if (this.s.boxed.has(sym)) name = `${name}->v`;
    const declared = this.s.declType(d);
    const now = this.s.ztypeOf(e);
    if (declared.k === 'dyn' && now.k !== 'dyn' && !this.s.isWrite(e)) return this.dynConv(name, now, e);  // DYN-08
    if (declared.k === 'obj' && now.k === 'obj' && now.decl !== declared.decl && !this.s.isWrite(e)) return `zrt::cast<${this.cls(now)}>(${name})`;
    return name;
  }
  isTopBinding(d: ts.Node): boolean {
    let n: ts.Node = d;
    while (ts.isBindingElement(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n = n.parent;
    return this.s.isModuleLevel(n);
  }

  /** Array index: machine integers pass through; fixed-point indices are converted like JS would. */
  index(e: ts.Expression): string {
    const t = this.s.tryZ(e);
    return t.k === 'num' && isFx(t.m) ? this.conv(e, I32) : this.expr(e, I32);
  }
  lval(e: ts.Expression): string {
    if (ts.isElementAccessExpression(e) && this.s.ztypeOf(e.expression).k === 'arr') return `${this.expr(e.expression)}.ref(${this.index(e.argumentExpression)})`;
    if (ts.isParenthesizedExpression(e)) return this.lval(e.expression);
    return this.expr(e);
  }

  /** `f?.(args)`: calls a function value only when it is set. */
  optionalCall(e: ts.CallExpression): string {
    const ft = this.s.ztypeOf(e.expression);
    if (ft.k !== 'fn') return this.s.fail(e, 'Z9035', "'?.()' is supported on function values");
    const f = this.newTmp('f');
    const call = `${f}(${this.args(e.arguments, ft.params)})`;
    if (ft.ret.k === 'void') return `([&]() { auto ${f} = ${this.expr(e.expression)}; if (${f} != nullptr) ${call}; }())`;
    return `([&]() -> ${this.cpp(ft.ret)} { auto ${f} = ${this.expr(e.expression)}; if (${f} == nullptr) return {}; return ${call}; }())`;
  }

  /** Outermost node of an optional chain with more than one link (`a?.b?.c`, `a?.b.c()`, `a?.b()`). */
  isChainTop(e: ts.Expression): boolean {
    if (!(ts.isPropertyAccessExpression(e) || ts.isCallExpression(e) || ts.isElementAccessExpression(e)) || !(e.flags & ts.NodeFlags.OptionalChain)) return false;
    const p = e.parent;
    if ((ts.isPropertyAccessExpression(p) || ts.isCallExpression(p) || ts.isElementAccessExpression(p)) && p.expression === e && (p.flags & ts.NodeFlags.OptionalChain)) return false;
    // single-link forms keep their dedicated emitters
    const inner = e.expression;
    const innerChain = (ts.isPropertyAccessExpression(inner) || ts.isCallExpression(inner) || ts.isElementAccessExpression(inner)) && !!(inner.flags & ts.NodeFlags.OptionalChain);
    return innerChain || (ts.isCallExpression(e) && ts.isPropertyAccessExpression(inner) && !!inner.questionDotToken);
  }
  /**
   * Optional chain (JS semantics): links are evaluated in order into temporaries; a `?.` on a null link returns
   * `fallback` (the `??` right side) or the result type's default. Supports property reads and method calls on objects.
   */
  chain(top: ts.Expression, fallback?: string, resultType?: ZT): string {
    const links: ts.Expression[] = [];
    let n: ts.Expression = top;
    while ((ts.isPropertyAccessExpression(n) || ts.isCallExpression(n) || ts.isElementAccessExpression(n)) && (n.flags & ts.NodeFlags.OptionalChain)) { links.unshift(n); n = n.expression; }
    const t = resultType ?? this.s.ztypeOf(top);
    const isVoid = t.k === 'void';
    const miss = isVoid ? 'return;' : `return ${fallback ?? `${this.cpp(t)}{}`};`;
    const body: string[] = [];
    let cur = this.newTmp('c');
    body.push(`auto ${cur} = ${this.expr(n)};`);
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      const q = (l as ts.PropertyAccessExpression | ts.CallExpression | ts.ElementAccessExpression).questionDotToken;
      if (q) body.push(`if (${cur} == nullptr) ${miss}`);
      let code: string;
      if (ts.isPropertyAccessExpression(l)) {
        const next = links[i + 1];
        if (next && ts.isCallExpression(next) && next.expression === l) {
          // method call on the current object
          const md = this.s.declOf(l.name);
          if (!md || !(ts.isMethodDeclaration(md) || ts.isMethodSignature(md))) return this.s.fail(l, 'Z9035', "this '?.' chain is not supported; split it");
          code = `${cur}->${this.id(l.name.text)}(${this.args(next.arguments, md.parameters.map(p => this.s.paramType(p)))})`;
          i++;
        } else code = this.prop(l, cur);
      } else if (ts.isCallExpression(l)) {
        const ft = this.s.ztypeOf(l.expression);
        if (ft.k !== 'fn') return this.s.fail(l, 'Z9035', "this '?.' chain is not supported; split it");
        code = `${cur}(${this.args(l.arguments, ft.params)})`;
      } else return this.s.fail(l, 'Z9035', "element access in a '?.' chain is not supported yet; split it");
      const last = i === links.length - 1;
      if (last) {
        if (isVoid) { body.push(`${code};`); break; }
        const r = this.newTmp('c');
        body.push(`auto ${r} = ${code};`);
        body.push(fallback !== undefined && refLike(t) ? `return ${r} == nullptr ? ${this.cpp(t)}(${fallback}) : ${this.cpp(t)}(${r});` : `return ${r};`);
      } else { const nx = this.newTmp('c'); body.push(`auto ${nx} = ${code};`); cur = nx; }
    }
    return `([&]() -> ${this.cpp(t)} { ${body.join(' ')} }())`;
  }

  /** `a?.b` (single level): null short-circuits to the default value of the result type. */
  optional(e: ts.PropertyAccessExpression): string {
    const t = this.s.ztypeOf(e);
    const v = this.newTmp('o');
    const inner = this.prop(e, v);
    return `([&]() -> ${this.cpp(t)} { auto ${v} = ${this.expr(e.expression)}; if (${v} == nullptr) return ${this.cpp(t)}{}; return ${inner}; }())`;
  }

  prop(e: ts.PropertyAccessExpression, recvOverride?: string): string {
    const ed = this.s.declOf(e.name);
    if (ed && ts.isEnumMember(ed)) {
      const cv = this.s.checker.getConstantValue(ed);
      if (typeof cv !== 'number') this.s.fail(e, 'Z9028', 'only numeric enums are supported');
      return String(cv);
    }
    const obj = e.expression, name = e.name.text;
    if (ts.isIdentifier(obj)) {
      if (obj.text === 'Math' && (name === 'PI' || name === 'E')) return this.numRet(`zrt::${name}`);
      if (obj.text === 'Number' && name === 'MAX_SAFE_INTEGER') return this.numRet('9007199254740991.0');
      if (obj.text === 'Number' && name === 'EPSILON') return this.numRet('2.220446049250313e-16');
      const nat = this.native.member(e);
      if (nat) return nat;
    }
    const od = this.staticOwner(obj);
    if (od && ts.isClassDeclaration(od)) return `${this.qual(od)}::${this.id(name)}`;
    if (od && ts.isSourceFile(od)) { const md = this.s.declOf(e.name)!; return `${this.ns(od)}::${this.id(name)}${this.s.boxed.has(this.s.symbolOf(e.name)!) ? '->v' : ''}`; void md; }
    const t = this.s.ztypeOf(obj);
    const recv = recvOverride ?? this.expr(obj);
    if (t.k === 'dyn') return `zrt::dyn_get(${recv}, ${this.lit(name)})`;
    if ((t.k === 'arr' || t.k === 'str') && name === 'length') return `${recv}.length()`;
    if ((t.k === 'map' || t.k === 'set') && name === 'size') return `${recv}.size()`;
    const d = this.s.declOf(e.name);
    if (d && ts.isGetAccessorDeclaration(d)) return `${recv}->get_${this.id(name)}()`;
    if (t.k === 'obj') {
      const md = d ?? this.s.memberDecl(t.decl, name);
      if (md && ts.isPropertyDeclaration(md) && this.hasDecorator(md, 'weak')) return `${recv}->${this.id(name)}.get()`;
      return `${recv}->${this.id(name)}`;
    }
    return this.s.fail(e, 'Z9020', `property '${name}' is not supported on this type`);
  }

  args(as: readonly ts.Expression[], ps: ZT[]): string {
    // generic parameters: let C++ deduce from the argument's own type
    return as.map((a, i) => {
      if (ts.isSpreadElement(a)) this.s.fail(a, 'Z9016', 'spread arguments are not supported yet');
      return this.conv(a, ps[i] && hasTp(ps[i]) ? undefined : ps[i]);
    }).join(', ');
  }

  /** Declaration named by `X` or `ns.X` (`import * as ns`), for static members: X.f(), ns.X.f(). */
  staticOwner(obj: ts.Expression): ts.Node | undefined {
    if (ts.isIdentifier(obj)) return this.s.declOf(obj);
    if (ts.isPropertyAccessExpression(obj) && ts.isIdentifier(obj.expression) && this.s.checker.getSymbolAtLocation(obj.expression)?.declarations?.some(ts.isNamespaceImport)) return this.s.declOf(obj.name);
    return undefined;
  }

  call(e: ts.CallExpression): string {
    const c = e.expression;
    if (c.kind === this.K.SuperKeyword) return this.s.fail(e, 'Z9021', 'super(...) must be the first statement of the constructor');
    const nat = this.native.call(e, this);
    if (nat !== undefined) return nat;
    if (ts.isPropertyAccessExpression(c)) {
      const obj = c.expression, name = c.name.text;
      // `import * as gfx from 'zinc:gfx'`: gfx.rect(...) is the plain function call
      if (ts.isIdentifier(obj) && this.s.checker.getSymbolAtLocation(obj)?.declarations?.some(ts.isNamespaceImport)) {
        const fd = this.s.declOf(c.name);
        if (fd && ts.isFunctionDeclaration(fd) && fd.getSourceFile().fileName.endsWith('/lib/gfx.d.ts')) { this.usesGfx = true; return this.hostCall(`zrt::gfx::${fd.name!.text}`, fd, e); }
        if (fd && ts.isFunctionDeclaration(fd) && !this.s.isLib(fd)) return this.genericCall(this.qual(fd), fd, e);
      }
      if (ts.isIdentifier(obj)) {
        const g = obj.text;
        const od = this.s.declOf(obj);
        const isLibGlobal = !od || this.s.isLib(od);
        if (isLibGlobal && g === 'console') return this.consoleCall(name, e);
        if (isLibGlobal && g === 'Math') {
          if (name === 'random') return this.numRet('zrt::math::random()');
          if (name === 'seed') return `zrt::math::seed(${this.conv(e.arguments[0], { k: 'num', m: 'u32' })})`;
          if (name === 'imul' || name === 'clz32') return `zrt::math::${name}(${this.args(e.arguments, [I32, I32])})`;
          if (MATH_FNS.has(name)) {
            if (this.fx) { const nk: ZT = { k: 'num', m: this.s.numberKind }; return `zrt::fxm::${name}(${this.args(e.arguments, [nk, nk])})`; }
            return this.numRet(`zrt::math::${name}(${this.args(e.arguments, [F64, F64])})`);
          }
        }
        if (isLibGlobal && g === 'Number' && ['isNaN', 'isFinite', 'isInteger'].includes(name)) return `zrt::is_${name.slice(2).toLowerCase()}(${this.conv(e.arguments[0], F64)})`;
        if (isLibGlobal && g === 'String' && name === 'fromCharCode') return `zrt::from_char_code(${this.conv(e.arguments[0], I32)})`;
        if (isLibGlobal && (g === 'Date' || g === 'performance') && name === 'now') return this.numRet('zrt::now_ms()');
        if (isLibGlobal && g === 'JSON' && name === 'stringify') return this.s.ztypeOf(e.arguments[0]).k === 'dyn' ? `zrt::dyn_stringify(${this.expr(e.arguments[0])})` : `zrt::json_stringify(${this.expr(e.arguments[0])})`;
        if (isLibGlobal && g === 'JSON' && name === 'parse') return `zrt::json_parse(${this.conv(e.arguments[0], STR)})`;
        if (isLibGlobal && g === 'Array' && name === 'isArray') {
          const at = this.s.ztypeOf(e.arguments[0]);
          return at.k === 'dyn' ? `zrt::dyn_is_array(${this.expr(e.arguments[0])})` : at.k === 'arr' ? 'true' : 'false';
        }
        if (isLibGlobal && g === 'Promise') {
          const pt = this.s.ztypeOf(e) as Extract<ZT, { k: 'promise' }>;
          if (name === 'resolve') return `zrt::Promise<${this.val(pt.el)}>::resolved(${e.arguments[0] ? this.conv(e.arguments[0], pt.el) : ''})`;
          if (name === 'reject') return `zrt::Promise<${this.val(pt.el)}>::rejected(${this.expr(e.arguments[0])})`;
          if (name === 'all') return `zrt::promise_all(${this.expr(e.arguments[0])})`;
        }
      }
      if (obj.kind === this.K.SuperKeyword) {
        const cls = ts.findAncestor(e, ts.isClassDeclaration)!;
        const base = this.baseOf(cls);
        const md = this.s.declOf(c.name) as ts.MethodDeclaration;
        return `${base.code}::${this.id(name)}(${this.args(e.arguments, md.parameters.map(p => this.s.paramType(p)))})`;
      }
      const t = this.s.ztypeOf(obj);
      if (t.k === 'dyn') return this.s.fail(e, 'Z9042', `calling '${name}' through a Dyn value is not supported; narrow it first (typeof/instanceof) or convert it (as T)`);
      if (t.k === 'num') {
        if (name === 'toFixed') return `zrt::to_fixed(${this.conv(obj, F64)}, ${e.arguments[0] ? this.conv(e.arguments[0], I32) : '0'})`;
        if (name === 'toString') return `zrt::cat(${this.expr(obj)})`;
      }
      if (t.k === 'promise' && name === 'then') return `${this.expr(obj)}.then(${this.expr(e.arguments[0])})`;
      if (t.k === 'gen' && name === 'next') this.s.fail(e, 'Z9032', 'iterate generators with for-of');
      if (t.k === 'arr' || t.k === 'str' || t.k === 'map' || t.k === 'set') return this.builtinCall(e, c, t);
      const od = this.staticOwner(obj);
      const md = this.s.declOf(c.name);
      if (od && ts.isSourceFile(od) && md && ts.isFunctionDeclaration(md)) return this.genericCall(this.qual(md), md, e);
      const ps = md && (ts.isMethodDeclaration(md) || ts.isMethodSignature(md)) ? md.parameters.map(p => this.s.paramType(p, this.s.substFor(t, md))) : [];
      const targs = e.typeArguments?.length ? `<${e.typeArguments.map(a => this.cpp(this.s.fromTypeNode(a))).join(', ')}>` : '';
      if (od && ts.isClassDeclaration(od)) return `${this.qual(od)}::${this.id(name)}${targs}(${this.args(e.arguments, ps)})`;
      if (t.k === 'obj') {
        if (md && (ts.isPropertyDeclaration(md) || ts.isPropertySignature(md))) {
          const ft = this.s.declType(md, this.s.substFor(t, md));
          return `${this.expr(obj)}->${this.id(name)}(${this.args(e.arguments, ft.k === 'fn' ? ft.params : [])})`;
        }
        return `${this.expr(obj)}->${this.id(name)}${targs}(${this.args(e.arguments, ps)})`;
      }
      return this.s.fail(e, 'Z9020', `method '${name}' is not supported on this type`);
    }
    const d = this.s.declOf(c);
    if (d && this.s.isLib(d)) {
      const n = (c as ts.Identifier).text;
      const sf = d.getSourceFile();
      if (sf.fileName.endsWith('/lib/gfx.d.ts')) {
        this.usesGfx = true;
        const fd = d as ts.FunctionDeclaration;
        return this.hostCall(`zrt::gfx::${fd.name!.text}`, fd, e);
      }
      switch (n) {
        case 'parseInt': return this.numRet(`zrt::parse_int(${this.conv(e.arguments[0], STR)}${e.arguments[1] ? ', ' + this.conv(e.arguments[1], I32) : ''})`);
        case 'parseFloat': return this.numRet(`zrt::parse_float(${this.conv(e.arguments[0], STR)})`);
        case 'isNaN': return `zrt::is_nan(${this.conv(e.arguments[0], F64)})`;
        case 'setTimeout': case 'setInterval':
          return `zrt::set_timer(${this.expr(e.arguments[0])}, ${this.conv(e.arguments[1], F64)}, ${n === 'setInterval'})`;
        case 'clearTimeout': case 'clearInterval': return `zrt::clear_timer(${this.conv(e.arguments[0], I32)})`;
        case 'unchecked': return this.expr(e.arguments[0]);
        case 'queueMicrotask': return `zrt::microtask(${this.expr(e.arguments[0])})`;
      }
      return this.s.fail(e, 'Z9019', `'${n}' is not implemented by the runtime`);
    }
    if (d && ts.isFunctionDeclaration(d)) return this.genericCall(this.expr(c), d, e);
    const ft = this.s.ztypeOf(c);
    if (ft.k === 'fn') return `${this.expr(c)}(${this.args(e.arguments, ft.params)})`;
    if (ft.k === 'dyn') return this.s.fail(e, 'Z9042', 'calling a Dyn value is not supported; give it a function type');
    return this.s.fail(e, 'Z9000', 'unsupported call');
  }

  /** Calls a runtime-implemented function: `number` crosses the boundary as f64 whatever the profile. */
  hostCall(name: string, d: ts.SignatureDeclaration, e: ts.CallExpression): string {
    const toHost = (t: ZT): ZT => t.k === 'num' && t.m === this.s.numberKind ? F64 : t;
    const ps = d.parameters.map(p => toHost(this.s.paramType(p)));
    // number[] in a non-f64 profile: the host takes f64 arrays
    const nkArr = (t: ZT) => t.k === 'arr' && t.el.k === 'num' && t.el.m === this.s.numberKind && t.el.m !== 'f64';
    const call = ps.some(nkArr)
      ? `${name}(${e.arguments.map((a, i) => nkArr(ps[i]) ? `zrt::to_f64s(${this.expr(a)})` : this.args([a], [ps[i]])).join(', ')})`
      : `${name}(${this.args(e.arguments, ps)})`;
    const r = this.s.retOf(d);
    return r.k === 'num' && r.m === this.s.numberKind && r.m !== 'f64' ? this.numRet(call) : call;
  }

  /** Calls a (possibly generic) function; type arguments are made explicit because C++ cannot deduce them from lambdas. */
  genericCall(callee: string, d: ts.FunctionDeclaration, e: ts.CallExpression): string {
    const tps = d.typeParameters ?? [];
    if (!tps.length) return `${callee}(${this.args(e.arguments, d.parameters.map(p => this.s.paramType(p)))})`;
    const bind = this.s.inferTypeArgs(d, e);
    if (!bind) return `${callee}(${this.args(e.arguments, d.parameters.map(p => this.s.paramType(p)))})`;
    const ps = d.parameters.map(p => this.s.paramType(p, bind));
    return `${callee}<${tps.map(tp => this.cpp(bind.get(tp.name.text)!)).join(', ')}>(${e.arguments.map((a, i) => this.conv(a, ps[i])).join(', ')})`;
  }

  /** console.* (RT-07): one formatter shared with sim; levels, timers, assert. */
  consoleCall(name: string, e: ts.CallExpression): string {
    for (const x of e.arguments) this.strictDyn(x);
    const a = e.arguments.map(x => this.expr(x));
    if (CONSOLE.has(name)) return `zrt::console(zrt::LOG_${name.toUpperCase()}${a.length ? ', ' + a.join(', ') : ''})`;
    if (name === 'time' || name === 'timeEnd' || name === 'timeLog' || name === 'count') return `zrt::console_${name}(${a[0] ?? this.lit('default')})`;
    if (name === 'assert') return `zrt::console_assert(${this.cond(e.arguments[0])}${a.length > 1 ? ', ' + a.slice(1).join(', ') : ''})`;
    if (name === 'table') return `zrt::console_table(${a[0]})`;
    return this.s.fail(e, 'Z9019', `console.${name} is not supported`);
  }

  builtinCall(e: ts.CallExpression, c: ts.PropertyAccessExpression, t: ZT): string {
    const recv = this.expr(c.expression);
    let name = c.name.text;
    const a = e.arguments;
    const cb = (x: ts.Expression) => this.expr(x);
    let args: string[];
    if (t.k === 'arr') {
      switch (name) {
        case 'push': case 'unshift': case 'indexOf': case 'includes': case 'fill':
          if (a.length !== 1) this.s.fail(e, 'Z9022', `${name} takes exactly one argument in the prototype`);
          if (ts.isSpreadElement(a[0])) return `${recv}.push_all(${this.expr(a[0].expression)})`;
          args = [this.conv(a[0], t.el)]; break;
        case 'reduce': args = [cb(a[0]), this.conv(a[1], this.s.ztypeOf(e))]; break;
        case 'map': case 'filter': case 'forEach': case 'find': case 'findIndex': case 'some': case 'every': case 'sort': args = [cb(a[0])]; break;
        case 'concat': args = [this.conv(a[0], t)]; break;
        case 'join': args = a.length ? [this.conv(a[0], STR)] : []; break;
        default: args = a.map(x => this.conv(x, I32));
      }
      if (name === 'sort' && !a.length) this.s.fail(e, 'Z9022', 'sort() needs a comparator in Zinc');
    } else if (t.k === 'str') {
      const numeric = new Set(['charCodeAt', 'at', 'slice', 'substring', 'repeat']);
      args = a.map((x, i) => (numeric.has(name) || ((name === 'padStart' || name === 'padEnd' || name === 'indexOf' || name === 'lastIndexOf') && i === (name === 'indexOf' || name === 'lastIndexOf' ? 1 : 0))) ? this.conv(x, I32) : this.conv(x, STR));
    } else if (t.k === 'map') {
      if (name === 'delete') name = 'del';
      args = name === 'set' ? [this.conv(a[0], t.key), this.conv(a[1], t.val)] : name === 'forEach' ? [cb(a[0])] : a.map(x => this.conv(x, t.key));
    } else {
      if (name === 'delete') name = 'del';
      args = name === 'forEach' ? [cb(a[0])] : a.map(x => this.conv(x, (t as Extract<ZT, { k: 'set' }>).el));
    }
    return `${recv}.${name}(${args.join(', ')})`;
  }

  newExpr(e: ts.NewExpression, want?: ZT): string {
    const d = this.s.declOf(e.expression);
    const ctx = this.s.contextual(e);
    const own = (): ZT => (want && (want.k === 'map' || want.k === 'set' || want.k === 'arr')) ? want : (ctx && (ctx.k === 'map' || ctx.k === 'set')) ? ctx : this.s.ztypeOf(e);
    const name = ts.isIdentifier(e.expression) ? e.expression.text : '';
    if (d && this.s.isLib(d)) {
      if (name === 'Map' || name === 'Set') return `${this.cpp(own())}::make()`;
      if (d && ts.isClassDeclaration(d) && this.s.libModule(d)) {
        const ctor = d.members.find(ts.isConstructorDeclaration);
        return `zrt::make<${this.cls(this.s.ztypeOf(e) as Extract<ZT, { k: 'obj' }>)}>(${this.args(e.arguments ?? [], ctor ? ctor.parameters.map(p => this.s.paramType(p)) : [])})`;
      }
      if (ERROR_CLASSES.has(name)) return `zrt::make<zrt::${name}>(${e.arguments?.[0] ? this.conv(e.arguments[0], STR) : ''})`;
      if (name === 'Promise') {
        const pt = this.s.promiseOfNew(e);
        const ex = e.arguments?.[0];
        if (!ex || !(ts.isArrowFunction(ex) || ts.isFunctionExpression(ex))) return this.s.fail(e, 'Z9036', 'new Promise needs an inline executor function');
        return `zrt::Promise<${this.val(pt.el)}>::create(${this.lambda(ex, this.s.fnType(ex) as Extract<ZT, { k: 'fn' }>)})`;
      }
      return this.s.fail(e, 'Z9023', `'new ${name}' is not supported`);
    }
    if (!d || !ts.isClassDeclaration(d)) return this.s.fail(e, 'Z9023', 'unsupported new');
    const t = this.s.ztypeOf(e) as Extract<ZT, { k: 'obj' }>;
    const subst = t.args.length && d.typeParameters ? new Map(d.typeParameters.map((tp, i) => [tp.name.text, t.args[i]])) : undefined;
    const ps = this.ctorParams(d).map(p => this.s.paramType(p, subst));
    return `zrt::make<${this.cls(t)}>(${this.args(e.arguments ?? [], ps)})`;
  }

  arrLit(e: ts.ArrayLiteralExpression, want?: ZT): string {
    if (want?.k === 'dyn' || (!want && this.s.ztypeOf(e).k === 'dyn')) return `zrt::Dyn(${this.arrLit(e, { k: 'arr', el: DYN })})`;
    const tt = want?.k === 'tup' ? want : this.s.ztypeOf(e);
    if (tt.k === 'tup') return `${this.cpp(tt)}{${e.elements.map((x, i) => this.conv(x, tt.els[i])).join(', ')}}`;
    const ctx = this.s.contextual(e);
    const t = (want?.k === 'arr' ? want : ctx?.k === 'arr' ? ctx : this.s.ztypeOf(e)) as Extract<ZT, { k: 'arr' }>;
    if (t.k !== 'arr') this.s.fail(e, 'Z9001', 'cannot type this array literal');
    const A = this.cpp(t);
    if (e.elements.some(ts.isSpreadElement)) {
      const r = this.newTmp('a');
      const parts = e.elements.map(x => ts.isSpreadElement(x) ? `${r}.push_all(${this.conv(x.expression, t)}); ` : `${r}.push(${this.conv(x, t.el)}); `).join('');
      // explicit return type: an error propagated inside (`return {};`) must not break the lambda's type deduction
      return `([&]() -> ${A} { auto ${r} = ${A}::with_cap(0); ${parts}return ${r}; }())`;
    }
    return e.elements.length ? `${A}::of(${e.elements.map(x => this.conv(x, t.el)).join(', ')})` : `${A}::with_cap(0)`;
  }

  objLit(e: ts.ObjectLiteralExpression, want?: ZT): string {
    if (want?.k === 'dyn' || (!want && this.s.ztypeOf(e).k === 'dyn')) return this.dynObjLit(e);
    let t = this.s.ztypeOf(e);
    if (want?.k === 'obj' && !this.s.unionMembers.has(want.decl as ts.TypeAliasDeclaration)) t = want;
    if (t.k !== 'obj' || ts.isClassDeclaration(t.decl)) return this.s.fail(e, 'Z9004', 'object literals need a named interface or type alias as their type');
    const ot = t;
    const o = this.newTmp('o');
    const sets = e.properties.map(p => {
      if (ts.isSpreadAssignment(p)) {
        const st = this.s.ztypeOf(p.expression);
        if (st.k !== 'obj') this.s.fail(p, 'Z9016', 'object spread needs an object');
        const src = this.newTmp('s');
        const names = this.s.fieldNames(ot.decl).filter(n => this.s.fieldNames((st as Extract<ZT, { k: 'obj' }>).decl).includes(n));
        return `auto ${src} = ${this.expr(p.expression)}; ${names.map(n => `${o}->${this.id(n)} = ${src}->${this.id(n)}; `).join('')}`;
      }
      if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
        const pname = p.name.getText();
        const pd = this.s.memberDecl(ot.decl, pname);
        const pt = pd ? this.s.declType(pd, this.s.substFor(ot, pd)) : undefined;
        const val = ts.isPropertyAssignment(p) ? this.conv(p.initializer, pt) : this.coerce(this.ident(p.name), this.s.ztypeOf(p.name), pt ?? this.s.ztypeOf(p.name), p);
        return `${o}->${this.id(pname)} = ${val}; ${pd && this.optVal(pd) ? `${o}->__has_${this.id(pname)} = true; ` : ''}`;
      }
      if (ts.isMethodDeclaration(p)) return this.s.fail(p, 'Z9016', 'methods in object literals are not supported; use a class');
      return this.s.fail(p, 'Z9016', 'only `key: value` properties are supported in object literals');
    }).join('');
    return `([&]() -> ${this.cpp(ot)} { auto ${o} = zrt::make<${this.cls(ot)}>(); ${sets}return ${o}; }())`;
  }

  lambda(f: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration, ft: Extract<ZT, { k: 'fn' }>): string {
    const executor = f.parameters.length && this.s.executorParam(f.parameters[0]);
    const ps = f.parameters.map((p, i) => {
      if (p.initializer) this.s.fail(p, 'Z9024', 'default values in closures are not supported yet');
      return `${executor ? 'auto' : this.cpp(ft.params[i])} ${this.paramName(p, i)}`;
    });
    // `onFrame(() => ...)`: a callback may ignore trailing parameters of the expected function type
    const ctx = ts.isFunctionDeclaration(f) ? undefined : this.s.checker.getContextualType(f)?.getCallSignatures()[0];
    if (ctx) ctx.getParameters().slice(f.parameters.length).forEach((p, i) => ps.push(`${this.cpp(this.s.fromType(this.s.checker.getTypeOfSymbolAtLocation(p, f), f))} /*unused*/`));
    const fb = f.body!;
    const body = this.withCtx({ ret: ft.ret, inCtor: false, catches: [], breaks: [], self: this.ctx.self }, () => {
      if (ts.isBlock(fb)) return this.fnBlock(f.parameters, fb, 1);
      const pro = this.prologue(f.parameters, 1);
      return ft.ret.k === 'void' ? `{\n${pro}  ${this.expr(fb)};\n}` : `{\n${pro}  return ${this.conv(fb, ft.ret)};\n}`;
    });
    return `[=${this.frameCaptures(f)}](${ps.join(', ')}) -> ${this.cpp(ft.ret)} ${body}`;
  }

  /**
   * A closure created inside an async function or generator reads that function's locals, which live in the frame
   * object: a plain `[=]` would capture the frame's `this` and dangle once the frame is freed. Copy each local the
   * closure uses instead (mutated captures are already shared cells, so copies share them).
   */
  frameCaptures(f: ts.Node): string {
    const host = this.s.fnOf(f);
    if (!host || !(this.s.isAsyncFn(host) || this.s.isGeneratorFn(host))) return '';
    const names = new Set<string>();
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
        const d = this.s.declOf(n);
        if (d && (ts.isVariableDeclaration(d) || ts.isParameter(d) || ts.isBindingElement(d)) && this.s.fnOf(d) === host && !this.isTop(d)) names.add(this.id(n.text));
      }
      ts.forEachChild(n, visit);
    };
    visit(f);
    return [...names].map(x => `, ${x} = ${x}`).join('');
  }

  /** async arrow/function expression: a frame struct plus an entry lambda that copies the captures. */
  asyncLambda(f: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration): string {
    const captures = new Map<string, string>();
    const own = new Set<ts.Node>();
    const collectOwn = (n: ts.Node) => { if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) own.add(n); ts.forEachChild(n, collectOwn); };
    collectOwn(f);
    let usesThis = false;
    const visit = (n: ts.Node) => {
      if (n.kind === this.K.ThisKeyword && !ts.isFunctionExpression(f)) usesThis = true;
      if (ts.isIdentifier(n)) {
        const d = this.s.declOf(n);
        if (d && !own.has(d) && (ts.isVariableDeclaration(d) || ts.isParameter(d) || ts.isBindingElement(d)) && !this.isTopBinding(d) && !this.s.isLib(d)) {
          const sym = this.s.symbolOf(n)!;
          const t = this.cpp(this.s.declType(d));
          captures.set(this.id(n.text), this.s.boxed.has(sym) ? `zrt::Ref<zrt::Cell<${t}>>` : t);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(f.body!);
    let selfType: string | undefined;
    if (usesThis) {
      const cls = ts.findAncestor(f, ts.isClassDeclaration);
      if (!cls) this.s.fail(f, 'Z9031', "'this' outside a class");
      selfType = `zrt::Ref<${this.qual(cls!)}>`;
    }
    const ft = this.s.fnType(f) as Extract<ZT, { k: 'fn' }>;
    const entry = this.frameEntry(f, 'lambda', selfType, [...captures].map(([name, type]) => ({ name, type })));
    const ps = f.parameters.map((p, i) => `${this.cpp(ft.params[i])} ${this.id(p.name.getText())}`).join(', ');
    return `[=${this.frameCaptures(f)}](${ps}) -> ${this.cpp(ft.ret)} ${entry}`;
  }

  toI32(e: ts.Expression): string {
    const t = this.s.ztypeOf(e);
    if (t.k === 'num' && t.m === 'i32') return this.expr(e, I32);
    if (t.k === 'num' && isInt(t.m)) return `static_cast<int32_t>(${this.expr(e, I32)})`;
    if (t.k === 'num' && isFx(t.m)) return `zrt::cvt<int32_t>(static_cast<double>(${this.expr(e)}))`;
    if (t.k === 'dyn') return `zrt::cvt<int32_t>(zrt::dyn_tonum(${this.expr(e)}))`;
    return `zrt::cvt<int32_t>(${this.expr(e)})`;
  }

  binary(e: ts.BinaryExpression, want?: ZT): string {
    const K = this.K, op = e.operatorToken.kind;
    const L = e.left, R = e.right;
    if (op === K.EqualsToken) {
      const od = ts.isPropertyAccessExpression(L) && (ts.isIdentifier(L.expression) || L.expression.kind === K.ThisKeyword) ? this.s.declOf(L.name) : undefined;
      if (od && this.optVal(od)) return `(${this.expr((L as ts.PropertyAccessExpression).expression)}->__has_${this.id((L as ts.PropertyAccessExpression).name.text)} = true, ${this.assign(L, R)})`;
      return this.assign(L, R);
    }
    if (op > K.FirstAssignment && op <= K.LastAssignment) return this.compound(e);
    if (op === K.CommaToken) return `(${this.expr(L)}, ${this.expr(R)})`;
    if (op === K.InstanceOfKeyword) {
      if (ts.isIdentifier(R) && ERROR_CLASSES.has(R.text)) return `zrt::isa<zrt::${R.text}>(${this.expr(L)})`;
      const d = this.s.declOf(R);
      if (!d || !ts.isClassDeclaration(d)) return this.s.fail(R, 'Z9025', 'instanceof needs a class');
      return `zrt::isa<${this.qual(d)}>(${this.expr(L)})`;
    }
    const lt = this.s.ztypeOf(L), rt = this.s.ztypeOf(R);
    if (op === K.AmpersandAmpersandToken || op === K.BarBarToken) {
      if (lt.k === 'bool' && rt.k === 'bool') return `(${this.expr(L)} ${op === K.BarBarToken ? '||' : '&&'} ${this.expr(R)})`;
      const t = this.s.ztypeOf(e), v = this.newTmp('t');
      const pick = op === K.BarBarToken ? `zrt::truthy(${v}) ? ${v} : ${this.conv(R, t)}` : `zrt::truthy(${v}) ? ${this.conv(R, t)} : ${v}`;
      return `([&]() -> ${this.cpp(t)} { ${this.cpp(t)} ${v} = ${this.conv(L, t)}; return ${pick}; }())`;
    }
    if (op === K.QuestionQuestionToken && this.s.ztypeOf(e).k === 'dyn') {
      const v = this.newTmp('t');
      return `([&]() -> zrt::Dyn { zrt::Dyn ${v} = ${this.toDynExpr(L)}; return zrt::dyn_nullish(${v}) ? ${this.toDynExpr(R)} : ${v}; }())`;
    }
    if (op === K.QuestionQuestionToken) {
      const inner = ts.isParenthesizedExpression(L) ? L.expression : L;
      if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression) && inner.expression.name.text === 'get') {
        const mt = this.s.ztypeOf(inner.expression.expression);
        if (mt.k === 'map') return `${this.expr(inner.expression.expression)}.get_or(${this.conv(inner.arguments[0], mt.key)}, ${this.conv(R, mt.val)})`;
      }
      if (this.isChainTop(inner)) return this.chain(inner, this.conv(R, this.s.ztypeOf(e)), this.s.ztypeOf(e));
      if (ts.isPropertyAccessExpression(inner) && inner.questionDotToken) {
        const t = this.s.ztypeOf(e), v = this.newTmp('o');
        return `([&]() -> ${this.cpp(t)} { auto ${v} = ${this.expr(inner.expression)}; if (${v} == nullptr) return ${this.conv(R, t)}; return ${this.prop(inner, v)}; }())`;
      }
      const od = ts.isPropertyAccessExpression(inner) ? this.s.declOf(inner.name) : undefined;
      if (od && this.optVal(od)) {  // `p.label ?? 'x'` on an optional value field: presence bit
        const t = this.s.ztypeOf(e), v = this.newTmp('o'), pa = inner as ts.PropertyAccessExpression;
        return `([&]() -> ${this.cpp(t)} { auto ${v} = ${this.expr(pa.expression)}; return ${v}->__has_${this.id(pa.name.text)} ? ${this.coerce(`${v}->${this.id(pa.name.text)}`, this.s.ztypeOf(pa), t, pa)} : ${this.conv(R, t)}; }())`;
      }
      if (refLike(lt)) {
        const t = this.s.ztypeOf(e), v = this.newTmp('t');
        return `([&]() -> ${this.cpp(t)} { ${this.cpp(t)} ${v} = ${this.expr(L)}; if (${v} == nullptr) return ${this.conv(R, t)}; return ${v}; }())`;
      }
      return this.expr(L);
    }
    if (op === K.InKeyword && rt.k === 'dyn') return `zrt::dyn_has(${this.expr(R)}, ${this.toDynExpr(L)})`;
    if (op === K.InKeyword) this.s.fail(e, 'Z9026', "'in' is not supported; use Map.has");
    const eq = [K.EqualsEqualsToken, K.EqualsEqualsEqualsToken, K.ExclamationEqualsToken, K.ExclamationEqualsEqualsToken].includes(op);
    const cmp = [K.LessThanToken, K.GreaterThanToken, K.LessThanEqualsToken, K.GreaterThanEqualsToken].includes(op);
    const opText = eq ? (op === K.EqualsEqualsToken || op === K.EqualsEqualsEqualsToken ? '==' : '!=') : e.operatorToken.getText();
    if ((eq || cmp) && (lt.k === 'dyn' || rt.k === 'dyn')) return this.dynCompare(e, eq);
    if (eq || cmp) {
      if (lt.k === 'null' || rt.k === 'null') {
        const other = lt.k === 'null' ? R : L;
        const ot = this.s.ztypeOf(other);
        // `m.get(k) === undefined` on a Map of values: absence is `!m.has(k)` (values have no null state)
        let g: ts.Expression = other;
        while (ts.isParenthesizedExpression(g)) g = g.expression;
        if (ts.isCallExpression(g) && ts.isPropertyAccessExpression(g.expression) && g.expression.name.text === 'get' && this.s.ztypeOf(g.expression.expression).k === 'map' && !refLike(ot))
          return `(${opText === '==' ? '!' : ''}${this.expr(g.expression.expression)}.has(${this.args(g.arguments, [(this.s.ztypeOf(g.expression.expression) as Extract<ZT, { k: 'map' }>).key])}))`;
        if (ot.k === 'str') return `(${this.expr(other)}.s ${opText} nullptr)`;
        const od = ts.isPropertyAccessExpression(g) ? this.s.declOf(g.name) : undefined;
        if (od && this.optVal(od) && ts.isPropertyAccessExpression(g)) return `(${opText === '==' ? '!' : ''}${this.expr(g.expression)}->__has_${this.id(g.name.text)})`;
        if (ot.k === 'num' || ot.k === 'bool') this.s.fail(e, 'Z1013', `a '${ot.k}' is never null or undefined here; use Map.has / an optional field / a sentinel`);
        return `(${this.expr(other)} ${opText} nullptr)`;
      }
      if (eq && lt.k !== rt.k) this.s.fail(e, 'Z1013', `comparison between '${lt.k}' and '${rt.k}' is always false; Zinc refuses mixed-type equality (LNG-21)`);
      if (lt.k === 'str' && cmp) return `(zrt::str_cmp(${this.expr(L)}, ${this.expr(R)}) ${opText} 0)`;
      if (isNum(lt) && isNum(rt)) {
        const m = this.s.arith(K.PlusToken, L, lt, R, rt);
        const w: ZT = { k: 'num', m };
        const cast = (x: ts.Expression, xt: ZT) => isNum(xt) && xt.m !== m && !this.s.isIntLiteral(x) ? this.coerce(this.expr(x, w), xt, w, x) : this.expr(x, w);
        return `(${cast(L, lt)} ${opText} ${cast(R, rt)})`;
      }
      return `(${this.expr(L)} ${opText} ${this.expr(R)})`;
    }
    const t = this.s.ztypeOf(e);
    if (t.k === 'dyn') return `zrt::dyn_add(${this.toDynExpr(L)}, ${this.toDynExpr(R)})`;
    if (isNum(t) && (lt.k === 'dyn' || rt.k === 'dyn') && [K.MinusToken, K.AsteriskToken, K.SlashToken, K.PercentToken, K.AsteriskAsteriskToken, K.PlusToken].includes(op)) {
      // DYN-06: ECMAScript ToNumber on the Dyn side, computed in f64
      const d = (x: ts.Expression, xt: ZT) => xt.k === 'dyn' ? `zrt::dyn_tonum(${this.expr(x)})` : this.conv(x, F64);
      const a = d(L, lt), b = d(R, rt);
      return this.numRet(op === K.PercentToken ? `zrt::math::fmod(${a}, ${b})` : op === K.AsteriskAsteriskToken ? `zrt::math::pow(${a}, ${b})` : `(${a} ${ts.tokenToString(op)} ${b})`);
    }
    if (t.k === 'str') {
      const parts: ts.Expression[] = [];
      const flat = (x: ts.Expression) => {
        if (ts.isBinaryExpression(x) && x.operatorToken.kind === K.PlusToken && this.s.ztypeOf(x).k === 'str') { flat(x.left); flat(x.right); }
        else parts.push(x);
      };
      flat(e);
      parts.forEach(p => this.strictDyn(p));
      return `zrt::cat(${parts.map(p => this.expr(p)).join(', ')})`;
    }
    if (!isNum(t)) return this.s.fail(e, 'Z9000', 'unsupported operands');
    return this.numOp(op, L, R, t.m, want);
  }

  /** Numeric operator with Zinc semantics (LNG-05). */
  numOp(op: ts.SyntaxKind, L: ts.Expression, R: ts.Expression, m: NumKind, _want?: ZT): string {
    const K = this.K;
    const lt = this.s.ztypeOf(L), rt = this.s.ztypeOf(R);
    const w: ZT = { k: 'num', m };
    const side = (x: ts.Expression, xt: ZT) => {
      const code = this.expr(x, w);
      if (!isNum(xt) || xt.m === m || this.s.isIntLiteral(x)) return code;
      return this.coerce(code, xt, w, x);
    };
    switch (op) {
      case K.AmpersandToken: case K.BarToken: case K.CaretToken:
        return `(${this.toI32(L)} ${ts.tokenToString(op)} ${this.toI32(R)})`;
      case K.LessThanLessThanToken: return `zrt::shl(${this.toI32(L)}, ${this.toI32(R)})`;
      case K.GreaterThanGreaterThanToken: return `zrt::sar(${this.toI32(L)}, ${this.toI32(R)})`;
      case K.GreaterThanGreaterThanGreaterThanToken: return `zrt::shr(${this.toI32(L)}, ${this.toI32(R)})`;
      case K.AsteriskAsteriskToken: return isFx(m) ? `zrt::fxm::pow(${side(L, lt)}, ${side(R, rt)})` : `zrt::math::pow(${this.conv(L, F64)}, ${this.conv(R, F64)})`;
      case K.SlashToken: {
        if (isFx(m)) return `(${side(L, lt)} / ${side(R, rt)})`;
        const bothInt = isNum(lt) && isNum(rt) && isInt(lt.m) && isInt(rt.m);
        const a = this.coerce(this.expr(L, w), lt, w, L), b = this.coerce(this.expr(R, w), rt, w, R);
        return bothInt ? `zrt::idiv(${a}, ${b})` : `(${a} / ${b})`;
      }
      case K.PercentToken:
        if (isFx(m)) return `(${side(L, lt)} % ${side(R, rt)})`;
        return isInt(m) ? `zrt::imod<${NUMC[m]}>(${side(L, lt)}, ${side(R, rt)})` : `static_cast<${NUMC[m]}>(zrt::math::fmod(${side(L, lt)}, ${side(R, rt)}))`;
      case K.PlusToken: case K.MinusToken: case K.AsteriskToken: {
        const s = ts.tokenToString(op);
        if (m === 'i32' && op === K.AsteriskToken) return `zrt::math::imul(${side(L, lt)}, ${side(R, rt)})`;
        const r = `(${side(L, lt)} ${s} ${side(R, rt)})`;
        // small int kinds promote to int in C++: make the declared width explicit
        return (m === 'i32' || m === 'u32') && ((isNum(lt) && lt.m !== m) || (isNum(rt) && rt.m !== m)) ? `static_cast<${NUMC[m]}>${r}` : r;
      }
    }
    return this.s.fail(L.parent, 'Z9000', `operator '${ts.tokenToString(op)}' is not supported`);
  }

  assign(L: ts.Expression, R: ts.Expression): string {
    const lt = this.s.ztypeOf(L);
    if (ts.isPropertyAccessExpression(L) && this.s.ztypeOf(L.expression).k === 'dyn') return `zrt::dyn_set(${this.expr(L.expression)}, ${this.lit(L.name.text)}, ${this.toDynExpr(R)})`;
    if (ts.isElementAccessExpression(L) && this.s.ztypeOf(L.expression).k === 'dyn') return `zrt::dyn_set_index(${this.expr(L.expression)}, ${this.toDynExpr(L.argumentExpression)}, ${this.toDynExpr(R)})`;
    if (ts.isPropertyAccessExpression(L)) {
      const d = this.s.declOf(L.name);
      const rt = this.s.ztypeOf(L.expression);
      if ((rt.k === 'arr') && L.name.text === 'length') return `${this.expr(L.expression)}.set_length(${this.conv(R, I32)})`;
      if (d && ts.isSetAccessorDeclaration(d)) return `${this.expr(L.expression)}->set_${this.id(L.name.text)}(${this.conv(R, this.s.paramType(d.parameters[0]))})`;
      if (d && ts.isGetAccessorDeclaration(d)) {
        const setter = (d.parent as ts.ClassDeclaration).members.find(m => ts.isSetAccessorDeclaration(m) && m.name.getText() === L.name.text) as ts.SetAccessorDeclaration | undefined;
        if (setter) return `${this.expr(L.expression)}->set_${this.id(L.name.text)}(${this.conv(R, this.s.paramType(setter.parameters[0]))})`;
      }
      if (d && ts.isPropertyDeclaration(d) && this.hasDecorator(d, 'weak')) return `${this.expr(L.expression)}->${this.id(L.name.text)} = ${this.conv(R, lt)}`;
    }
    if (ts.isElementAccessExpression(L)) {
      const at = this.s.ztypeOf(L.expression);
      if (at.k === 'arr') return `${this.expr(L.expression)}.set(${this.index(L.argumentExpression)}, ${this.conv(R, at.el)})`;
    }
    if (ts.isArrayLiteralExpression(L) || ts.isObjectLiteralExpression(L)) this.s.fail(L, 'Z9007', 'destructuring assignment is not supported yet; use a declaration');
    return `${this.expr(L)} = ${this.conv(R, lt)}`;
  }

  compound(e: ts.BinaryExpression): string {
    const K = this.K;
    const op = e.operatorToken.kind;
    const lt = this.s.ztypeOf(e.left);
    if (op === K.QuestionQuestionEqualsToken || op === K.BarBarEqualsToken || op === K.AmpersandAmpersandEqualsToken) {
      const lv = this.lval(e.left);
      const test = op === K.QuestionQuestionEqualsToken ? (refLike(lt) ? `${lv} == nullptr` : 'false') : op === K.BarBarEqualsToken ? `!zrt::truthy(${lv})` : `zrt::truthy(${lv})`;
      return `((${test}) ? (${lv} = ${this.conv(e.right, lt)}) : ${lv})`;
    }
    const base: Record<number, ts.SyntaxKind> = {
      [K.PlusEqualsToken]: K.PlusToken, [K.MinusEqualsToken]: K.MinusToken, [K.AsteriskEqualsToken]: K.AsteriskToken,
      [K.SlashEqualsToken]: K.SlashToken, [K.PercentEqualsToken]: K.PercentToken, [K.AmpersandEqualsToken]: K.AmpersandToken,
      [K.BarEqualsToken]: K.BarToken, [K.CaretEqualsToken]: K.CaretToken, [K.LessThanLessThanEqualsToken]: K.LessThanLessThanToken,
      [K.GreaterThanGreaterThanEqualsToken]: K.GreaterThanGreaterThanToken, [K.GreaterThanGreaterThanGreaterThanEqualsToken]: K.GreaterThanGreaterThanGreaterThanToken,
      [K.AsteriskAsteriskEqualsToken]: K.AsteriskAsteriskToken,
    };
    const bop = base[op];
    if (bop === undefined) return this.s.fail(e, 'Z9027', `operator '${e.operatorToken.getText()}' is not supported yet`);
    if (lt.k === 'dyn') {
      const ch = ({ [K.PlusToken]: '+', [K.MinusToken]: '-', [K.AsteriskToken]: '*', [K.SlashToken]: '/', [K.PercentToken]: '%', [K.AsteriskAsteriskToken]: 'p' } as Record<number, string>)[bop];
      if (!ch) return this.s.fail(e, 'Z9027', `operator '${e.operatorToken.getText()}' is not supported on Dyn`);
      const target = this.dynTarget(e.left);
      if (target) return `zrt::dyn_update(${target}, [&](const zrt::Dyn& __x) { return zrt::dyn_arith('${ch}', __x, ${this.toDynExpr(e.right)}); }, false)`;
      const lv = this.lval(e.left);
      return `${lv} = zrt::dyn_arith('${ch}', ${lv}, ${this.toDynExpr(e.right)})`;
    }
    if (isNum(lt) && this.s.ztypeOf(e.right).k === 'dyn') {
      if (![K.PlusToken, K.MinusToken, K.AsteriskToken, K.SlashToken].includes(bop)) return this.s.fail(e, 'Z9027', `operator '${e.operatorToken.getText()}' with a Dyn operand is not supported; convert it first`);
      return `${this.lval(e.left)} ${ts.tokenToString(bop)}= ${this.conv(e.right, lt)}`;
    }
    if (ts.isPropertyAccessExpression(e.left)) {
      const d = this.s.declOf(e.left.name);
      if (d && (ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d))) this.s.fail(e, 'Z9027', 'compound assignment to an accessor is not supported');
    }
    const lv = this.lval(e.left);
    if (lt.k === 'str' && bop === K.PlusToken) return `${lv} = zrt::cat(${lv}, ${this.expr(e.right)})`;
    if (!isNum(lt)) return this.s.fail(e, 'Z9000', 'unsupported compound assignment');
    const rt = this.s.ztypeOf(e.right);
    const m = this.s.arith(bop, e.left, lt, e.right, rt);
    const simple = [K.PlusToken, K.MinusToken].includes(bop) || (bop === K.AsteriskToken && !isInt(lt.m));
    if (simple && m === lt.m) return `${lv} ${ts.tokenToString(bop)}= ${this.conv(e.right, lt)}`;
    // general path: lhs = convert(lhs op rhs)
    const val = this.numOp(bop, e.left, e.right, m);
    return `${lv} = ${this.coerce(val, { k: 'num', m }, lt, e)}`;
  }

  // ---------- Dyn (section 9) ----------
  /** DYN-01: in the strict profile an `unknown` is only compared, passed on, or narrowed. */
  strictDyn(e: ts.Expression, t = this.s.tryZ(e)) {
    if (t.k === 'dyn' && this.s.typing === 'strict') this.s.fail(e, 'Z1016', "an 'unknown' value must be narrowed (typeof/instanceof) before this use in the strict typing profile (DYN-01)");
  }
  /** `e` as a Dyn value. */
  toDynExpr(e: ts.Expression): string {
    let x = e;
    while (ts.isParenthesizedExpression(x)) x = x.expression;
    if (x.kind === this.K.NullKeyword) return 'zrt::Dyn(nullptr)';
    if (ts.isIdentifier(x) && x.text === 'undefined') return 'zrt::Dyn()';
    if (ts.isArrayLiteralExpression(x)) return this.arrLit(x, DYN);
    if (ts.isObjectLiteralExpression(x)) return this.objLit(x, DYN);
    const from = this.s.ztypeOf(e);
    const code = this.expr(e, DYN);
    return from.k === 'dyn' ? code : this.toDyn(code, from, e);
  }
  /** Static value -> Dyn (boxing, no copy: arrays must already hold Dyn). */
  toDyn(code: string, from: ZT, at: ts.Node): string {
    switch (from.k) {
      case 'num': case 'bool': case 'str': case 'obj': return `zrt::Dyn(${code})`;
      case 'null': return 'zrt::Dyn(nullptr)';
      case 'void': return `((void)(${code}), zrt::Dyn())`;
      case 'arr':
        if (from.el.k === 'dyn') return `zrt::Dyn(${code})`;
        return this.s.fail(at, 'Z9040', `a typed array (${this.cpp(from)}) cannot become Dyn without a copy that would break aliasing; declare it any[]`);
    }
    return this.s.fail(at, 'Z9041', `a value of type '${from.k}' cannot become Dyn (only primitives, objects and any[])`);
  }
  /** DYN-07: checked Dyn -> static conversion; failure is an uncaught TypeError. */
  dynConv(code: string, to: ZT, at: ts.Node): string {
    if (to.k === 'num') return this.coerce(`zrt::dyn_to_num(${code})`, F64, to, at);
    return this.shapeConv(code, this.s.dynShape(to, at), to);
  }
  shapeConv(code: string, sh: DynShape, t: ZT): string {
    switch (sh.k) {
      case 'd': return code;
      case 'n': return this.coerce(`zrt::dyn_to_num(${code})`, F64, t, this.s.fe.entry);
      case 's': return `zrt::dyn_to_str(${code})`;
      case 'b': return `zrt::dyn_to_bool(${code})`;
      case 'a': {
        const el = (t as Extract<ZT, { k: 'arr' }>).el;
        if (sh.el.k === 'd') return `zrt::dyn_to_arr(${code})`;
        return `zrt::dyn_to_arr_of<${this.cpp(el)}>(${code}, [](const zrt::Dyn& __e) { return ${this.shapeConv('__e', sh.el, el)}; })`;
      }
      case 'c': return `zrt::dyn_to_obj<${this.qual(sh.decl)}>(${code}, ${JSON.stringify(sh.name)})`;
      case 'o': return `${this.dynStructFn(sh)}(${code})`;
    }
  }
  /** Dyn -> plain interface: a new struct whose fields are read with dyn_get and checked (same order as sim/zinc.mjs). */
  dynStructFn(sh: Extract<DynShape, { k: 'o' }>): string {
    let f = this.dynFns.get(sh.decl);
    if (f) return f;
    f = `__dyn_to_${this.id(sh.name)}${this.s.classIds.get(sh.decl) ?? ''}`;
    this.dynFns.set(sh.decl, f);
    const S = this.qual(sh.decl);
    const lines = sh.fields.map(fd => {
      const m = this.s.memberDecl(sh.decl, fd.name)!;
      const ft = this.s.declType(m);
      const fn = this.id(fd.name);
      const conv = this.shapeConv('__v', fd.shape, ft);
      const has = this.optVal(m) ? ` r->__has_${fn} = true;` : '';
      return fd.opt ? `  { zrt::Dyn __v = zrt::dyn_get(d, ${this.lit(fd.name)}); if (!zrt::dyn_is_undef(__v)) { r->${fn} = ${conv};${has} } }`
        : `  { zrt::Dyn __v = zrt::dyn_get(d, ${this.lit(fd.name)}); r->${fn} = ${conv}; }`;
    });
    this.dynFnDefs.push(`static zrt::Ref<${S}> ${f}(const zrt::Dyn& d) {\n  if (zrt::dyn_nullish(d)) return nullptr;\n  zrt::dyn_need_obj(d, ${JSON.stringify(sh.name)});\n  auto r = zrt::make<${S}>();\n${lines.join('\n')}\n  return r;\n}`);
    return f;
  }
  /** ===, ==, <, ... with a Dyn operand (DYN-06). */
  dynCompare(e: ts.BinaryExpression, eq: boolean): string {
    const K = this.K, op = e.operatorToken.kind, L = e.left, R = e.right;
    if (!eq) {
      const fn = ({ [K.LessThanToken]: 'lt', [K.GreaterThanToken]: 'gt', [K.LessThanEqualsToken]: 'le', [K.GreaterThanEqualsToken]: 'ge' } as Record<number, string>)[op];
      return `zrt::dyn_${fn}(${this.toDynExpr(L)}, ${this.toDynExpr(R)})`;
    }
    const strict = op === K.EqualsEqualsEqualsToken || op === K.ExclamationEqualsEqualsToken;
    const neg = op === K.ExclamationEqualsToken || op === K.ExclamationEqualsEqualsToken;
    const nil = (x: ts.Expression) => x.kind === K.NullKeyword ? 'null' : ts.isIdentifier(x) && x.text === 'undefined' ? 'undef' : undefined;
    const n = nil(L) ?? nil(R);
    const r = n ? `zrt::${strict ? (n === 'null' ? 'dyn_is_null' : 'dyn_is_undef') : 'dyn_nullish'}(${this.toDynExpr(nil(L) ? R : L)})`
      : `zrt::${strict ? 'dyn_seq' : 'dyn_leq'}(${this.toDynExpr(L)}, ${this.toDynExpr(R)})`;
    if (!strict) this.strictDyn(L), this.strictDyn(R);
    return neg ? `!${r}` : r;
  }
  /** `o.k` / `o[k]` with a Dyn receiver, as `o, key` arguments of dyn_update; undefined otherwise. */
  dynTarget(e: ts.Expression): string | undefined {
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isPropertyAccessExpression(e) && this.s.ztypeOf(e.expression).k === 'dyn') return `${this.expr(e.expression)}, zrt::Dyn(${this.lit(e.name.text)})`;
    if (ts.isElementAccessExpression(e) && this.s.ztypeOf(e.expression).k === 'dyn') return `${this.expr(e.expression)}, ${this.toDynExpr(e.argumentExpression)}`;
    return undefined;
  }
  /** -d, +d, ++d, d-- on Dyn. */
  dynUnary(e: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression): string {
    const K = this.K, o = e.operand;
    if (e.operator === K.MinusToken) return this.numRet(`(-zrt::dyn_tonum(${this.expr(o)}))`);
    if (e.operator === K.PlusToken) return this.numRet(`zrt::dyn_tonum(${this.expr(o)})`);
    if (e.operator === K.ExclamationToken) { this.strictDyn(o); return `!zrt::truthy(${this.expr(o)})`; }
    if (e.operator === K.TildeToken) return `~(${this.toI32(o)})`;
    const delta = e.operator === K.PlusPlusToken ? 1 : -1, post = ts.isPostfixUnaryExpression(e);
    const target = this.dynTarget(o);
    if (target) return `zrt::dyn_update(${target}, [&](const zrt::Dyn& __x) { return zrt::Dyn(zrt::dyn_tonum(__x) + ${delta}); }, ${post})`;
    return `zrt::dyn_${post ? 'post' : 'pre'}(${this.lval(o)}, ${delta})`;
  }
  /** Object literal typed any: a dynamic object, keys in source order (computed keys allowed, DYN-05). */
  dynObjLit(e: ts.ObjectLiteralExpression): string {
    const o = this.newTmp('o');
    const sets = e.properties.map(p => {
      if (ts.isPropertyAssignment(p) && ts.isComputedPropertyName(p.name)) return `zrt::dyn_set_index(${o}, ${this.toDynExpr(p.name.expression)}, ${this.toDynExpr(p.initializer)}); `;
      if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
        const key = ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name) ? p.name.text : p.name.getText();
        return `zrt::dyn_set(${o}, ${this.lit(key)}, ${this.toDynExpr(ts.isPropertyAssignment(p) ? p.initializer : p.name)}); `;
      }
      return this.s.fail(p, 'Z9016', 'only `key: value` properties are supported in a Dyn object literal');
    }).join('');
    return `([&]() { zrt::Dyn ${o} = zrt::dyn_obj(); ${sets}return ${o}; }())`;
  }
  /** Fields readable/writable through Dyn (DYN-04): zrt_get/zrt_set overrides, only when the program uses Dyn. */
  dynAccessors(c: Cls, self: string, tp: string, baseCode: string, fields: { raw: string; t: ZT; weak: boolean; opt: boolean }[]): [string[], string[]] {
    const get: string[] = [], set: string[] = [];
    for (const f of fields) {
      if (f.raw.startsWith('#') || hasTp(f.t)) continue;
      const ok = ['num', 'bool', 'str', 'obj', 'dyn'].includes(f.t.k) || (f.t.k === 'arr' && f.t.el.k === 'dyn');
      if (!ok) continue;
      const fn = this.id(f.raw), key = `zrt::key_is(k, ${JSON.stringify(f.raw)}, ${Buffer.byteLength(f.raw)})`;
      const val = f.weak ? `this->${fn}.get()` : `this->${fn}`;
      const boxed = f.t.k === 'dyn' ? val : `zrt::Dyn(${val})`;
      get.push(`  if (${key}) { out = ${f.opt ? `this->__has_${fn} ? ${boxed} : zrt::Dyn()` : boxed}; return true; }`);
      if (f.weak) continue;
      let conv: string;
      try { conv = f.t.k === 'dyn' ? 'v' : this.dynConv('v', f.t, c); } catch { continue; }
      set.push(`  if (${key}) { this->${fn} = ${conv};${f.opt ? ` this->__has_${fn} = true;` : ''} return true; }`);
    }
    const L = ['  bool zrt_get(const zrt::String& k, zrt::Dyn& out) const override;', '  bool zrt_set(const zrt::String& k, const zrt::Dyn& v) override;'];
    const B = [
      `${tp}bool ${self}::zrt_get(const zrt::String& k, zrt::Dyn& out) const {\n${get.join('\n')}${get.length ? '\n' : ''}  return ${baseCode}::zrt_get(k, out);\n}`,
      `${tp}bool ${self}::zrt_set(const zrt::String& k, const zrt::Dyn& v) {\n${set.join('\n')}${set.length ? '\n' : ''}  return ${baseCode}::zrt_set(k, v);\n}`,
    ];
    return [L, B];
  }
}
