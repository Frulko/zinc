// C++17 emitter (CMP-09). Walks the checked TS AST directly (HIR/MIR deferred, docs/decisions/0004).
// Output: one translation unit `zinc_main.cpp` that includes runtime/zrt.h.
import * as path from 'node:path';
import { ts } from './frontend.ts';
import { Sema, type ZT, type NumKind, isNum, isInt, I32, F64, STR, VOID } from './sema.ts';

const NUMC: Record<NumKind, string> = {
  f64: 'double', f32: 'float', i8: 'int8_t', i16: 'int16_t', i32: 'int32_t', i64: 'int64_t',
  u8: 'uint8_t', u16: 'uint16_t', u32: 'uint32_t', u64: 'uint64_t', isize: 'zrt::isize', usize: 'zrt::usize',
};
const CPP_KEYWORDS = new Set(('alignas alignof and and_eq asm auto bitand bitor bool break case catch char char16_t char32_t class compl const ' +
  'constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if ' +
  'inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast return ' +
  'short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union ' +
  'unsigned using virtual void volatile wchar_t while xor xor_eq main zrt std NULL errno assert').split(' '));
const MATH_F64 = new Set(['abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan2', 'exp', 'log', 'hypot', 'min', 'max', 'fround']);
const GFX_MODULE = 'zinc:gfx';

export interface CppOptions { debug: boolean; title: string; width: number; height: number; outDir: string }
export interface CppResult { code: string; usesGfx: boolean }

type Cls = ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

export function emitCpp(sema: Sema, opts: CppOptions): CppResult {
  return new CppEmitter(sema, opts).run();
}

class CppEmitter {
  K = ts.SyntaxKind;
  lits: string[] = [];
  litIndex = new Map<string, number>();
  tmp = 0;
  breaks: (string | null)[] = [];
  inCtor = false;
  retType: ZT = VOID;
  usesGfx = false;

  s: Sema;
  o: CppOptions;
  constructor(s: Sema, o: CppOptions) { this.s = s; this.o = o; }

  // ---------- naming ----------
  id(n: string): string {
    const x = n.replace(/^#/, 'p_').replace(/\$/g, '_S_');
    return CPP_KEYWORDS.has(x) ? x + '_' : x;
  }
  ns(sf: ts.SourceFile): string {
    const rel = path.relative(this.s.root, sf.fileName).replace(/\.[cm]?[jt]sx?$/, '');
    return 'm_' + rel.replace(/[^A-Za-z0-9]/g, '_');
  }
  isTop(d: ts.Node): boolean {
    return ts.isSourceFile(d.parent) || this.s.isModuleLevel(d);
  }
  qual(d: ts.Declaration): string {
    const name = (d as ts.NamedDeclaration).name?.getText() ?? '_';
    return `${this.ns(d.getSourceFile())}::${this.id(name)}`;
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
      case 'tp': return t.name;
    }
  }
  tparams(tps: ts.NodeArray<ts.TypeParameterDeclaration> | undefined): string {
    return tps?.length ? `template<${tps.map(t => 'typename ' + t.name.text).join(', ')}> ` : '';
  }
  newTmp(p: string) { return `__${p}${this.tmp++}`; }

  // ---------- string literal pool (constant-initialized, immortal: MEM-05) ----------
  lit(v: string): string {
    let i = this.litIndex.get(v);
    if (i === undefined) {
      i = this.lits.length;
      this.litIndex.set(v, i);
      const bytes = Buffer.from(v, 'utf8');
      let c = '';
      for (const b of bytes) c += b >= 0x20 && b < 0x7f && b !== 0x22 && b !== 0x5c && b !== 0x3f ? String.fromCharCode(b) : '\\' + b.toString(8).padStart(3, '0');
      const ascii = bytes.every(b => b < 0x80) ? 1 : 0;
      this.lits.push(`static zrt::StrObj zs${i} = {zrt::IMMORTAL, ${bytes.length}, ${v.length}, ${ascii}, "${c}", nullptr};`);
    }
    return `zrt::String(&zs${i})`;
  }

  // ---------- program ----------
  run(): CppResult {
    const classes: Cls[] = [];
    const fns: ts.FunctionDeclaration[] = [];
    const globals: ts.VariableDeclaration[] = [];
    for (const sf of this.s.fe.sources) {
      for (const st of sf.statements) {
        if (ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || (ts.isTypeAliasDeclaration(st) && ts.isTypeLiteralNode(st.type))) classes.push(st);
        else if (ts.isFunctionDeclaration(st) && st.body) fns.push(st);
        else if (ts.isVariableStatement(st)) globals.push(...st.declarationList.declarations);
        else if (ts.isImportDeclaration(st) && (st.moduleSpecifier as ts.StringLiteral).text === GFX_MODULE) this.usesGfx = true;
      }
    }
    const ordered = this.topo(classes);
    const decls: string[] = [], defs: string[] = [], protos: string[] = [], bodies: string[] = [], inits: string[] = [];

    for (const c of ordered) decls.push(`namespace ${this.ns(c.getSourceFile())} { ${this.tparams(c.typeParameters)}struct ${this.id(c.name!.text)}; }`);
    for (const c of ordered) { const [d, b] = this.classDef(c); defs.push(d); bodies.push(b); }
    const gl: string[] = [];
    for (const g of globals) {
      if (!ts.isIdentifier(g.name)) this.s.fail(g, 'Z9007', 'destructuring is not supported yet');
      gl.push(`namespace ${this.ns(g.getSourceFile())} { ${this.cpp(this.s.declType(g))} ${this.id(g.name.text)}{}; }`);
    }
    for (const f of fns) {
      protos.push(`namespace ${this.ns(f.getSourceFile())} { ${this.fnHead(f, true)}; }`);
      bodies.push(`namespace ${this.ns(f.getSourceFile())} {\n${this.fnHead(f, false)} ${this.fnBody(f)}\n}`);
    }
    const mains: string[] = [], deinits: string[] = [];
    for (const sf of this.s.fe.sources) {
      const ns = this.ns(sf);
      inits.push(`namespace ${ns} {\nvoid __init() {\n${this.moduleInit(sf)}}\nvoid __deinit() {\n${this.moduleDeinit(sf)}}\n}`);
      mains.push(`  ${ns}::__init();`);
      deinits.unshift(`  ${ns}::__deinit();`);
    }
    const main = [
      'int main() {',
      `  HalConfig cfg = {${this.o.width}, ${this.o.height}, ${JSON.stringify(this.o.title)}, ${this.usesGfx ? 1 : 0}};`,
      '  zrt::start(cfg);', ...mains, '  zrt::run_loop();', ...deinits, '  zrt::finish();', '  return 0;', '}',
    ];
    const code = ['// Generated by zinc. Do not edit.', '#include "zrt.h"', '', ...this.lits, '', ...decls, '', ...defs, '', ...gl, '', ...protos, '', ...bodies, '', ...inits, '', ...main, ''].join('\n');
    return { code, usesGfx: this.usesGfx };
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
  bases(c: Cls): ts.Declaration[] {
    if (ts.isTypeAliasDeclaration(c)) return [];
    const out: ts.Declaration[] = [];
    for (const h of c.heritageClauses ?? []) for (const t of h.types) { const d = this.s.declOf(t.expression); if (d) out.push(d); }
    return out;
  }
  baseOf(c: Cls): { code: string; decl?: ts.Declaration } {
    if (ts.isTypeAliasDeclaration(c)) return { code: 'zrt::Object' };
    const hs = c.heritageClauses ?? [];
    const all = hs.flatMap(h => h.types.map(t => ({ t, ext: h.token === this.K.ExtendsKeyword })));
    if (ts.isClassDeclaration(c) && all.length > 1) this.s.fail(c, 'Z9008', 'a class may extend one class or implement one interface in the prototype');
    if (ts.isInterfaceDeclaration(c) && all.length > 1) this.s.fail(c, 'Z9008', 'an interface may extend one interface in the prototype');
    if (!all.length) return { code: 'zrt::Object' };
    const t = all[0].t;
    const d = this.s.declOf(t.expression)!;
    const args = (t.typeArguments ?? []).map(a => this.cpp(this.s.fromTypeNode(a)));
    return { code: this.qual(d) + (args.length ? `<${args.join(', ')}>` : ''), decl: d };
  }
  members(c: Cls): readonly ts.Node[] {
    if (ts.isTypeAliasDeclaration(c)) return (c.type as ts.TypeLiteralNode).members;
    return c.members;
  }
  isVirtualClass(c: Cls): boolean {
    return ts.isInterfaceDeclaration(c) || this.s.hierarchy.has(c) || (ts.isClassDeclaration(c) && this.s.implemented(c).length > 0);
  }
  isStatic(m: ts.Node) { return !!ts.getCombinedModifierFlags(m as ts.Declaration) && (ts.getCombinedModifierFlags(m as ts.Declaration) & ts.ModifierFlags.Static) !== 0; }
  interfaceFieldNames(c: Cls): Set<string> {
    const names = new Set<string>();
    if (!ts.isClassDeclaration(c)) return names;
    for (const i of this.s.implemented(c)) if (ts.isInterfaceDeclaration(i)) for (const m of i.members) if (ts.isPropertySignature(m)) names.add(m.name.getText());
    return names;
  }
  ctorParams(c: ts.ClassDeclaration): readonly ts.ParameterDeclaration[] {
    const ctor = c.members.find(ts.isConstructorDeclaration);
    if (ctor) return ctor.parameters;
    const b = this.s.baseClass(c);
    return b ? this.ctorParams(b) : [];
  }
  params(ps: readonly ts.ParameterDeclaration[], withDefaults: boolean, subst?: Map<string, ZT>): string {
    return ps.map(p => {
      if (!ts.isIdentifier(p.name)) this.s.fail(p, 'Z9007', 'destructuring parameters are not supported yet');
      if (p.dotDotDotToken) this.s.fail(p, 'Z9009', 'rest parameters are not supported yet');
      const t = this.s.paramType(p, subst);
      let s = `${this.cpp(t)} ${this.id(p.name.text)}`;
      if (withDefaults && p.initializer) s += ` = ${this.conv(p.initializer, t)}`;
      else if (withDefaults && p.questionToken) s += ` = ${this.cpp(t)}()`;
      return s;
    }).join(', ');
  }

  // ---------- classes ----------
  classDef(c: Cls): [string, string] {
    const name = this.id(c.name!.text);
    const ns = this.ns(c.getSourceFile());
    const tp = this.tparams(c.typeParameters);
    const self = name + (c.typeParameters?.length ? `<${c.typeParameters.map(t => t.name.text).join(', ')}>` : '');
    const base = this.baseOf(c);
    const virt = this.isVirtualClass(c);
    const skip = this.interfaceFieldNames(c);
    const L: string[] = [`namespace ${ns} {`, `${tp}struct ${name} : ${base.code} {`, `  static constexpr uint32_t ZRT_CID = ${this.s.classIds.get(c)};`];
    const B: string[] = [];
    const jsonFields: string[] = [];
    const fieldInits: string[] = [];
    const prefix = `${tp}`;
    let hasCtor = false;
    for (const m of this.members(c)) {
      if (ts.isPropertyDeclaration(m) || ts.isPropertySignature(m)) {
        const fname = this.id(m.name.getText());
        const t = this.s.declType(m);
        if (this.isStatic(m)) {
          L.push(`  static inline ${this.cpp(t)} ${fname}{};`);
          continue;
        }
        if (skip.has(m.name.getText())) { if (ts.isPropertyDeclaration(m) && m.initializer) fieldInits.push(`  this->${fname} = ${this.conv(m.initializer, t)};`); continue; }
        L.push(`  ${this.cpp(t)} ${fname}{};`);
        if (ts.isPropertyDeclaration(m) && m.initializer) fieldInits.push(`  this->${fname} = ${this.conv(m.initializer, t)};`);
        if (t.k !== 'fn' && !m.name.getText().startsWith('#')) jsonFields.push(`  zrt::json_field(sb, first, "${m.name.getText()}", this->${fname});`);
      } else if (ts.isConstructorDeclaration(m) && m.body && ts.isClassDeclaration(c)) {
        hasCtor = true;
        for (const p of m.parameters) {
          if (ts.getCombinedModifierFlags(p) & (ts.ModifierFlags.Public | ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Readonly)) {
            const t = this.s.paramType(p);
            const pn = this.id(p.name.getText());
            L.push(`  ${this.cpp(t)} ${pn}{};`);
            fieldInits.unshift(`  this->${pn} = ${pn};`);
            jsonFields.push(`  zrt::json_field(sb, first, "${p.name.getText()}", this->${pn});`);
          }
        }
      }
    }
    if (ts.isClassDeclaration(c)) {
      const ctor = c.members.find(ts.isConstructorDeclaration);
      const ps = this.ctorParams(c);
      L.push(`  ${name}(${this.params(ps, true)});`);
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
      } else if (base.decl) {
        superArgs = ps.map(p => this.id(p.name.getText())).join(', ');
      }
      this.inCtor = true; this.retType = VOID;
      const body = bodyStmts.map(st => this.stmt(st, 1)).join('');
      this.inCtor = false;
      B.push(`${prefix}${self}::${name}(${this.params(ps, false)}) : ${base.code}(${superArgs}) {\n${fieldInits.join('\n')}${fieldInits.length ? '\n' : ''}${body}}`);
      void hasCtor;
    } else {
      L.push(`  ${name}() {}`);
    }
    for (const m of this.members(c)) {
      if (ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) {
        const st = this.isStatic(m);
        const abstract = ts.isMethodSignature(m) || (ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Abstract) !== 0;
        const mt = this.tparams(m.typeParameters);
        const ret = this.cpp(this.s.retOf(m));
        const mname = this.id(m.name.getText());
        L.push(`  ${mt}${st ? 'static ' : virt ? 'virtual ' : ''}${ret} ${mname}(${this.params(m.parameters, true)})${abstract ? ' = 0' : ''};`);
        if (!abstract && ts.isMethodDeclaration(m) && m.body) {
          this.retType = this.s.retOf(m);
          B.push(`${prefix}${mt}${ret} ${self}::${mname}(${this.params(m.parameters, false)}) ${this.block(m.body, 0)}`);
        }
      } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
        const get = ts.isGetAccessorDeclaration(m);
        const mname = (get ? 'get_' : 'set_') + this.id(m.name.getText());
        const ret = get ? this.cpp(this.s.declType(m)) : 'void';
        L.push(`  ${virt ? 'virtual ' : ''}${ret} ${mname}(${this.params(m.parameters, true)});`);
        this.retType = get ? this.s.declType(m) : VOID;
        if (m.body) B.push(`${prefix}${ret} ${self}::${mname}(${this.params(m.parameters, false)}) ${this.block(m.body, 0)}`);
      }
    }
    const baseIsUser = !!base.decl;
    L.push(`  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID || ${base.code}::zrt_isa(id); }`);
    L.push(`  void zrt_fields(zrt::StrBuilder& sb, bool& first) const;`);
    L.push(`  void zrt_json(zrt::StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }`);
    B.push(`${prefix}void ${self}::zrt_fields(zrt::StrBuilder& sb, bool& first) const {\n${baseIsUser ? `  ${base.code}::zrt_fields(sb, first);\n` : '  (void)sb; (void)first;\n'}${jsonFields.join('\n')}\n}`);
    L.push('};', '}');
    return [L.join('\n'), `namespace ${ns} {\n${B.join('\n')}\n}`];
  }

  // ---------- functions ----------
  fnHead(f: ts.FunctionDeclaration, proto: boolean): string {
    return `${this.tparams(f.typeParameters)}${this.cpp(this.s.retOf(f))} ${this.id(f.name!.text)}(${this.params(f.parameters, proto)})`;
  }
  fnBody(f: ts.FunctionDeclaration): string {
    this.retType = this.s.retOf(f);
    return this.block(f.body!, 0);
  }

  moduleInit(sf: ts.SourceFile): string {
    let out = '';
    this.retType = VOID;
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st) ||
        ts.isImportDeclaration(st) || ts.isModuleDeclaration(st)) continue;
      if (ts.isExportDeclaration(st) || ts.isExportAssignment(st)) this.s.fail(st, 'Z9010', 'only `export` modifiers on declarations are supported');
      if (ts.isClassDeclaration(st)) {
        for (const m of st.members) if (ts.isPropertyDeclaration(m) && this.isStatic(m) && m.initializer)
          out += `  ${this.qual(st)}::${this.id(m.name.getText())} = ${this.conv(m.initializer, this.s.declType(m))};\n`;
        continue;
      }
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (d.initializer) out += this.line(d) + `  ${this.qual(d)} = ${this.conv(d.initializer, this.s.declType(d))};\n`;
        }
        continue;
      }
      out += this.stmt(st, 1);
    }
    return out;
  }
  moduleDeinit(sf: ts.SourceFile): string {
    let out = '';
    for (const st of sf.statements) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) out += `  ${this.qual(d)} = ${this.cpp(this.s.declType(d))}{};\n`;
      if (ts.isClassDeclaration(st)) for (const m of st.members) if (ts.isPropertyDeclaration(m) && this.isStatic(m)) out += `  ${this.qual(st)}::${this.id(m.name.getText())} = ${this.cpp(this.s.declType(m))}{};\n`;
    }
    return out;
  }

  // ---------- statements ----------
  line(n: ts.Node): string {
    if (!this.o.debug) return '';
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
    return t.k === 'bool' ? this.expr(e) : `zrt::truthy(${this.expr(e)})`;
  }

  stmt(s: ts.Statement, d: number): string {
    const I = this.ind(d);
    const L = this.line(s);
    if (ts.isBlock(s)) return I + this.block(s, d) + '\n';
    if (ts.isEmptyStatement(s)) return '';
    if (ts.isExpressionStatement(s)) return `${L}${I}${this.expr(s.expression)};\n`;
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
      const top = this.breaks[this.breaks.length - 1];
      return `${I}${top ? `goto ${top}` : 'break'};\n`;
    }
    if (ts.isContinueStatement(s)) {
      if (s.label) this.s.fail(s, 'Z9011', 'labeled statements are not supported yet');
      return `${I}continue;\n`;
    }
    if (ts.isReturnStatement(s)) {
      if (!s.expression || this.inCtor) return `${L}${I}return;\n`;
      if (this.retType.k === 'void') return `${L}${I}${this.expr(s.expression)}; return;\n`;
      return `${L}${I}return ${this.conv(s.expression, this.retType)};\n`;
    }
    if (ts.isSwitchStatement(s)) return L + this.switchStmt(s, d);
    if (ts.isThrowStatement(s)) {
      // ponytail: throw panics with the .ts position; try/catch via error returns (RT-05) comes later.
      const e = s.expression;
      let msg = this.lit('Error');
      if (ts.isNewExpression(e) && e.arguments?.length) msg = `zrt::cat(${this.lit((e.expression.getText()) + ': ')}, ${this.expr(e.arguments[0])})`;
      else if (this.s.ztypeOf(e).k === 'str') msg = this.expr(e);
      const sf = s.getSourceFile();
      const line = sf.getLineAndCharacterOfPosition(s.getStart()).line + 1;
      return `${L}${I}zrt::panic_at(zrt::cat(${msg}).ptr(), ${JSON.stringify(path.relative(process.cwd(), sf.fileName))}, ${line});\n`;
    }
    if (ts.isTryStatement(s)) this.s.fail(s, 'Z9006', 'try/catch is not supported yet (throw panics)');
    if (ts.isFunctionDeclaration(s) && s.name && s.body) {
      const ft = this.s.fnType(s) as Extract<ZT, { k: 'fn' }>;
      return `${L}${I}auto ${this.id(s.name.text)} = ${this.lambda(s, ft)};\n`;
    }
    if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) return '';
    if (ts.isClassDeclaration(s)) this.s.fail(s, 'Z9012', 'classes must be declared at module level');
    if (ts.isLabeledStatement(s)) this.s.fail(s, 'Z9011', 'labeled statements are not supported yet');
    return this.s.fail(s, 'Z9000', `statement '${this.K[s.kind]}' is not supported yet`);
  }

  loopBody(s: ts.Statement, d: number): string {
    this.breaks.push(null);
    const r = this.body(s, d);
    this.breaks.pop();
    return r;
  }

  varList(l: ts.VariableDeclarationList, d: number): string {
    if (l.flags & ts.NodeFlags.Using) this.s.fail(l, 'Z9013', "'using' declarations are not supported yet");
    let out = '';
    for (const v of l.declarations) {
      if (!ts.isIdentifier(v.name)) this.s.fail(v, 'Z9007', 'destructuring is not supported yet');
      const name = this.id(v.name.text);
      const t = this.s.declType(v);
      const sym = this.s.symbolOf(v.name)!;
      const init = v.initializer;
      if (this.s.boxed.has(sym)) out += `${this.ind(d)}auto ${name} = zrt::cell<${this.cpp(t)}>(${init ? this.conv(init, t) : this.cpp(t) + '{}'});\n`;
      else if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && l.flags & ts.NodeFlags.Const)
        out += `${this.ind(d)}auto ${name} = ${this.expr(init)};\n`;  // zero-alloc: stays a C++ lambda unless it escapes
      else out += `${this.ind(d)}${this.cpp(t)} ${name}${init ? ' = ' + this.conv(init, t) : '{}'};\n`;
    }
    return out;
  }

  forOf(s: ts.ForOfStatement, d: number): string {
    const I = this.ind(d), I1 = this.ind(d + 1);
    const t = this.s.ztypeOf(s.expression);
    const c = this.newTmp('c'), i = this.newTmp('i');
    const decl = (s.initializer as ts.VariableDeclarationList).declarations?.[0];
    if (!decl) this.s.fail(s, 'Z9005', 'for-of needs a const/let declaration');
    this.breaks.push(null);
    let head: string, bind: string;
    if (t.k === 'arr' || t.k === 'str') {
      if (!ts.isIdentifier(decl.name)) this.s.fail(decl, 'Z9007', 'destructuring is only supported for Map entries');
      const et = t.k === 'arr' ? t.el : STR;
      head = `for (int32_t ${i} = 0; ${i} < ${c}.length(); ${i}++)`;
      bind = `${I1}  ${this.cpp(et)} ${this.id(decl.name.text)} = ${t.k === 'arr' ? `${c}.get(${i})` : `${c}.at(${i})`};\n`;
    } else if (t.k === 'map' || t.k === 'set') {
      head = `for (int32_t ${i} = 0; ${i} < ${c}.slots(); ${i}++)`;
      bind = `${I1}  if (!${c}.live_at(${i})) continue;\n`;
      if (t.k === 'map') {
        if (!ts.isArrayBindingPattern(decl.name) || decl.name.elements.length !== 2) this.s.fail(decl, 'Z9005', 'iterate a Map with `for (const [k, v] of map)`');
        const [k, v] = decl.name.elements.map(e => ts.isBindingElement(e) ? this.id(e.name.getText()) : '_');
        bind += `${I1}  ${this.cpp(t.key)} ${k} = ${c}.key_at(${i});\n${I1}  ${this.cpp(t.val)} ${v} = ${c}.val_at(${i});\n`;
      } else {
        bind += `${I1}  ${this.cpp(t.el)} ${this.id(decl.name.getText())} = ${c}.key_at(${i});\n`;
      }
    } else return this.s.fail(s.expression, 'Z9005', 'for-of is supported on arrays, strings, Map and Set');
    const inner = ts.isBlock(s.statement) ? s.statement.statements.map(x => this.stmt(x, d + 2)).join('') : this.stmt(s.statement, d + 2);
    this.breaks.pop();
    return `${I}{\n${I1}auto ${c} = ${this.expr(s.expression)};\n${I1}${head} {\n${bind}${inner}${I1}}\n${I}}\n`;
  }

  switchStmt(s: ts.SwitchStatement, d: number): string {
    const I = this.ind(d), I1 = this.ind(d + 1);
    const v = this.newTmp('sw'), f = this.newTmp('f'), end = this.newTmp('swend');
    const st = this.s.ztypeOf(s.expression);
    let out = `${I}{\n${I1}auto ${v} = ${this.expr(s.expression)};\n${I1}bool ${f} = false;\n`;
    this.breaks.push(end);
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
    this.breaks.pop();
    return out + `${I1}${end}:;\n${I}}\n`;
  }

  // ---------- expressions ----------
  /** Emit `e` converted to `to` (assignment, argument, return: the coercion points of LNG-05). */
  conv(e: ts.Expression, to: ZT | undefined): string {
    const code = this.expr(e, to);
    if (!to) return code;
    return this.coerce(code, this.s.ztypeOf(e), to, e);
  }
  coerce(code: string, from: ZT, to: ZT, at: ts.Node): string {
    if (from.k === 'num' && to.k === 'num') {
      if (from.m === to.m) return code;
      if (isInt(to.m)) return isInt(from.m) ? `static_cast<${NUMC[to.m]}>(${code})` : `zrt::cvt<${NUMC[to.m]}>(${code})`;
      if (to.m === 'f32') return `static_cast<float>(${code})`;
      return isInt(from.m) ? `static_cast<double>(${code})` : code;
    }
    if (from.k === 'obj' && to.k === 'obj' && from.decl !== to.decl) {
      if (this.s.inherits(from.decl, to.decl)) return code;
      if (this.s.inherits(to.decl, from.decl)) return `zrt::cast<${this.cls(to)}>(${code})`;
      this.s.fail(at, 'Z9002', `structural conversion from '${(from.decl as ts.NamedDeclaration).name?.getText()}' to '${(to.decl as ts.NamedDeclaration).name?.getText()}' is not supported; declare 'implements' or 'extends'`);
    }
    if (from.k === 'arr' && to.k === 'arr' && this.cpp(from) !== this.cpp(to) && from.el.k !== 'tp' && to.el.k !== 'tp')
      this.s.fail(at, 'Z9003', `array element types differ (${this.cpp(from.el)} vs ${this.cpp(to.el)}); annotate the element or callback return type`);
    return code;
  }

  numLit(text: string, want: ZT | undefined): string {
    const v = Number(text);
    if (want?.k === 'num' && isInt(want.m) && Number.isInteger(v)) {
      if (want.m === 'u32' || want.m === 'u64' || v > 0x7fffffff) return `${v}u`.replace(/u$/, want.m === 'i64' || want.m === 'u64' ? 'll' : 'u');
      return String(v);
    }
    let s = String(v);
    if (!/[.eE]/.test(s)) s += '.0';
    if (s === 'Infinity') return 'zrt::Inf';
    return want?.k === 'num' && want.m === 'f32' ? s + 'f' : s;
  }

  expr(e: ts.Expression, want?: ZT): string {
    const K = this.K;
    if (ts.isParenthesizedExpression(e)) return `(${this.expr(e.expression, want)})`;
    if (ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) return this.expr(e.expression, want);
    if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) {
      if (e.type.getText() === 'const') return this.expr(e.expression, want);
      return this.coerce(this.expr(e.expression, this.s.fromTypeNode(e.type)), this.s.ztypeOf(e.expression), this.s.fromTypeNode(e.type), e);
    }
    if (ts.isNumericLiteral(e)) return this.numLit(e.text, want);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return this.lit(e.text);
    if (ts.isTemplateExpression(e)) {
      const parts: string[] = [];
      if (e.head.text) parts.push(this.lit(e.head.text));
      for (const sp of e.templateSpans) { parts.push(this.expr(sp.expression)); if (sp.literal.text) parts.push(this.lit(sp.literal.text)); }
      return `zrt::cat(${parts.join(', ')})`;
    }
    if (e.kind === K.TrueKeyword) return 'true';
    if (e.kind === K.FalseKeyword) return 'false';
    if (e.kind === K.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')) return want && want.k !== 'null' && want.k !== 'num' && want.k !== 'bool' ? `${this.cpp(want)}()` : 'nullptr';
    if (e.kind === K.ThisKeyword) return 'this';
    if (ts.isIdentifier(e)) return this.ident(e);
    if (ts.isPropertyAccessExpression(e)) return this.prop(e);
    if (ts.isElementAccessExpression(e)) {
      const t = this.s.ztypeOf(e.expression);
      if (t.k === 'arr') return `${this.expr(e.expression)}.get(${this.expr(e.argumentExpression, I32)})`;
      if (t.k === 'str') return `${this.expr(e.expression)}.at(${this.conv(e.argumentExpression, I32)})`;
      return this.s.fail(e, 'Z9015', 'computed property access is only supported on arrays and strings (use Map)');
    }
    if (ts.isCallExpression(e)) return this.call(e);
    if (ts.isNewExpression(e)) return this.newExpr(e, want);
    if (ts.isArrayLiteralExpression(e)) {
      const ctx = this.s.contextual(e);
      const t = (want?.k === 'arr' ? want : ctx?.k === 'arr' ? ctx : this.s.ztypeOf(e)) as Extract<ZT, { k: 'arr' }>;
      if (t.k !== 'arr') this.s.fail(e, 'Z9001', 'cannot type this array literal');
      if (e.elements.some(ts.isSpreadElement)) this.s.fail(e, 'Z9016', 'spread is not supported yet');
      const A = this.cpp(t);
      return e.elements.length ? `${A}::of(${e.elements.map(x => this.conv(x, t.el)).join(', ')})` : `${A}::with_cap(0)`;
    }
    if (ts.isObjectLiteralExpression(e)) return this.objLit(e, want);
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return this.lambda(e, this.s.fnType(e) as Extract<ZT, { k: 'fn' }>);
    if (ts.isConditionalExpression(e)) {
      const t = this.s.ztypeOf(e);
      return `(${this.cond(e.condition)} ? ${this.conv(e.whenTrue, t)} : ${this.conv(e.whenFalse, t)})`;
    }
    if (ts.isPrefixUnaryExpression(e)) {
      const o = e.operand;
      switch (e.operator) {
        case K.ExclamationToken: return `!${this.cond(o).startsWith('zrt::') ? this.cond(o) : `(${this.cond(o)})`}`;
        case K.MinusToken: return ts.isNumericLiteral(o) ? '-' + this.numLit(o.text, want) : `-(${this.expr(o, want)})`;
        case K.PlusToken: return this.expr(o, want);
        case K.TildeToken: return `~(${this.toI32(o)})`;
        case K.PlusPlusToken: return `++${this.lval(o)}`;
        case K.MinusMinusToken: return `--${this.lval(o)}`;
      }
    }
    if (ts.isPostfixUnaryExpression(e)) return `${this.lval(e.operand)}${e.operator === K.PlusPlusToken ? '++' : '--'}`;
    if (ts.isBinaryExpression(e)) return this.binary(e, want);
    if (ts.isTypeOfExpression(e)) this.s.fail(e, 'Z9017', "'typeof' at runtime needs Dyn (not implemented)");
    if (ts.isAwaitExpression(e)) this.s.fail(e, 'Z9018', 'async/await is not supported yet');
    return this.s.fail(e, 'Z9000', `expression '${K[e.kind]}' is not supported yet`);
  }

  ident(e: ts.Identifier): string {
    if (e.text === 'NaN') return 'zrt::NaN';
    if (e.text === 'Infinity') return 'zrt::Inf';
    const sym = this.s.symbolOf(e);
    const d = this.s.declOf(e);
    if (!d || !sym) return this.s.fail(e, 'Z9019', `unresolved identifier '${e.text}'`);
    if (this.s.isLib(d)) return this.s.fail(e, 'Z9019', `'${e.text}' cannot be used as a value`);
    if (ts.isFunctionDeclaration(d)) {
      const ft = this.s.fnType(d) as Extract<ZT, { k: 'fn' }>;
      const isCallee = ts.isCallExpression(e.parent) && e.parent.expression === e;
      const name = this.isTop(d) ? this.qual(d) : this.id(e.text);
      if (isCallee) return name;
      // function used as a value: wrap in a lambda (becomes Fn when stored)
      const ps = ft.params.map((p, i) => `${this.cpp(p)} a${i}`).join(', ');
      return `[=](${ps}) -> ${this.cpp(ft.ret)} { return ${name}(${ft.params.map((_, i) => 'a' + i).join(', ')}); }`;
    }
    if (ts.isClassDeclaration(d)) return this.qual(d);
    let name = (ts.isVariableDeclaration(d) && this.s.isModuleLevel(d)) ? this.qual(d) : this.id(e.text);
    if (this.s.boxed.has(sym)) name = `${name}->v`;
    const declared = this.s.declType(d);
    const now = this.s.ztypeOf(e);
    if (declared.k === 'obj' && now.k === 'obj' && now.decl !== declared.decl && !this.isAssignTarget(e)) return `zrt::cast<${this.cls(now)}>(${name})`;
    return name;
  }
  isAssignTarget(e: ts.Node) { return this.s.isWrite(e); }

  lval(e: ts.Expression): string {
    if (ts.isElementAccessExpression(e) && this.s.ztypeOf(e.expression).k === 'arr') return `${this.expr(e.expression)}.ref(${this.expr(e.argumentExpression, I32)})`;
    if (ts.isParenthesizedExpression(e)) return this.lval(e.expression);
    return this.expr(e);
  }

  prop(e: ts.PropertyAccessExpression): string {
    const cv = this.s.checker.getConstantValue(e as ts.PropertyAccessExpression);
    if (typeof cv === 'number') return String(cv);
    const obj = e.expression, name = e.name.text;
    if (ts.isIdentifier(obj)) {
      if (obj.text === 'Math' && (name === 'PI' || name === 'E')) return `zrt::${name}`;
      if (obj.text === 'Number' && name === 'MAX_SAFE_INTEGER') return '9007199254740991.0';
      if (obj.text === 'Number' && name === 'EPSILON') return '2.220446049250313e-16';
    }
    const od = ts.isIdentifier(obj) ? this.s.declOf(obj) : undefined;
    if (od && ts.isClassDeclaration(od)) return `${this.qual(od)}::${this.id(name)}`;
    const t = this.s.ztypeOf(obj);
    const recv = this.expr(obj);
    if ((t.k === 'arr' || t.k === 'str') && name === 'length') return `${recv}.length()`;
    if ((t.k === 'map' || t.k === 'set') && name === 'size') return `${recv}.size()`;
    const d = this.s.declOf(e.name);
    if (d && ts.isGetAccessorDeclaration(d)) return `${recv}->get_${this.id(name)}()`;
    if (t.k === 'obj') return `${recv}->${this.id(name)}`;
    return this.s.fail(e, 'Z9020', `property '${name}' is not supported on this type`);
  }

  args(as: readonly ts.Expression[], ps: ZT[]): string {
    return as.map((a, i) => this.conv(a, ps[i])).join(', ');
  }

  call(e: ts.CallExpression): string {
    const c = e.expression;
    if (c.kind === this.K.SuperKeyword) return this.s.fail(e, 'Z9021', 'super(...) must be the first statement of the constructor');
    if (ts.isPropertyAccessExpression(c)) {
      const obj = c.expression, name = c.name.text;
      if (ts.isIdentifier(obj)) {
        const g = obj.text;
        const od = this.s.declOf(obj);
        const isLibGlobal = !od || this.s.isLib(od);
        if (isLibGlobal && g === 'console' && name === 'log') return `zrt::log(${e.arguments.map(a => this.expr(a)).join(', ')})`;
        if (isLibGlobal && g === 'Math') {
          if (name === 'random') return 'zrt::math::random()';
          if (name === 'seed') return `zrt::math::seed(${this.conv(e.arguments[0], { k: 'num', m: 'u32' })})`;
          if (name === 'imul' || name === 'clz32') return `zrt::math::${name}(${this.args(e.arguments, [I32, I32])})`;
          if (MATH_F64.has(name)) return `zrt::math::${name}(${this.args(e.arguments, [F64, F64])})`;
        }
        if (isLibGlobal && g === 'Number' && ['isNaN', 'isFinite', 'isInteger'].includes(name)) return `zrt::is_${name.slice(2).toLowerCase()}(${this.conv(e.arguments[0], F64)})`;
        if (isLibGlobal && g === 'String' && name === 'fromCharCode') return `zrt::from_char_code(${this.conv(e.arguments[0], I32)})`;
        if (isLibGlobal && (g === 'Date' || g === 'performance') && name === 'now') return 'zrt::now_ms()';
      }
      if (obj.kind === this.K.SuperKeyword) {
        const cls = ts.findAncestor(e, ts.isClassDeclaration)!;
        const base = this.baseOf(cls);
        const md = this.s.declOf(c.name) as ts.MethodDeclaration;
        return `${base.code}::${this.id(name)}(${this.args(e.arguments, md.parameters.map(p => this.s.paramType(p)))})`;
      }
      const t = this.s.ztypeOf(obj);
      if (t.k === 'num') {
        if (name === 'toFixed') return `zrt::to_fixed(${this.expr(obj)}, ${e.arguments[0] ? this.conv(e.arguments[0], I32) : '0'})`;
        if (name === 'toString') return `zrt::cat(${this.expr(obj)})`;
      }
      if (t.k === 'arr' || t.k === 'str' || t.k === 'map' || t.k === 'set') return this.builtinCall(e, c, t);
      const od = ts.isIdentifier(obj) ? this.s.declOf(obj) : undefined;
      const md = this.s.declOf(c.name);
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
      if (ts.isModuleDeclaration(d.parent?.parent) && (d.parent.parent as ts.ModuleDeclaration).name.getText().includes(GFX_MODULE) || sf.fileName.endsWith('gfx.d.ts')) {
        this.usesGfx = true;
        const fd = d as ts.FunctionDeclaration;
        return `zrt::gfx::${n}(${this.args(e.arguments, fd.parameters.map(p => this.s.paramType(p)))})`;
      }
      switch (n) {
        case 'parseInt': return `zrt::parse_int(${this.conv(e.arguments[0], STR)}${e.arguments[1] ? ', ' + this.conv(e.arguments[1], I32) : ''})`;
        case 'parseFloat': return `zrt::parse_float(${this.conv(e.arguments[0], STR)})`;
        case 'isNaN': return `zrt::is_nan(${this.conv(e.arguments[0], F64)})`;
        case 'setTimeout': case 'setInterval':
          return `zrt::set_timer(${this.expr(e.arguments[0])}, ${this.conv(e.arguments[1], F64)}, ${n === 'setInterval'})`;
        case 'clearTimeout': case 'clearInterval': return `zrt::clear_timer(${this.conv(e.arguments[0], I32)})`;
        case 'unchecked': return this.expr(e.arguments[0]);
      }
      return this.s.fail(e, 'Z9019', `'${n}' is not implemented by the runtime`);
    }
    const targs = e.typeArguments?.length ? `<${e.typeArguments.map(a => this.cpp(this.s.fromTypeNode(a))).join(', ')}>` : '';
    if (d && ts.isFunctionDeclaration(d)) return `${this.expr(c)}${targs}(${this.args(e.arguments, d.parameters.map(p => this.s.paramType(p)))})`;
    const ft = this.s.ztypeOf(c);
    if (ft.k === 'fn') return `${this.expr(c)}(${this.args(e.arguments, ft.params)})`;
    return this.s.fail(e, 'Z9000', 'unsupported call');
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
      args = a.map((x, i) => (numeric.has(name) || ((name === 'padStart' || name === 'padEnd' || name === 'indexOf') && i === (name === 'indexOf' ? 1 : 0))) ? this.conv(x, I32) : this.conv(x, STR));
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
      return this.s.fail(e, 'Z9023', `'new ${name}' is only supported in 'throw'`);
    }
    if (!d || !ts.isClassDeclaration(d)) return this.s.fail(e, 'Z9023', 'unsupported new');
    const t = this.s.ztypeOf(e) as Extract<ZT, { k: 'obj' }>;
    const subst = t.args.length && d.typeParameters ? new Map(d.typeParameters.map((tp, i) => [tp.name.text, t.args[i]])) : undefined;
    const ps = this.ctorParams(d).map(p => this.s.paramType(p, subst));
    return `zrt::make<${this.cls(t)}>(${this.args(e.arguments ?? [], ps)})`;
  }

  objLit(e: ts.ObjectLiteralExpression, want?: ZT): string {
    let t = want?.k === 'obj' ? want : this.s.contextual(e);
    if (!t || t.k !== 'obj') {
      const ct = this.s.checker.getContextualType(e);
      if (ct) t = this.s.fromType(ct, e);
    }
    if (!t || t.k !== 'obj' || ts.isClassDeclaration(t.decl)) return this.s.fail(e, 'Z9004', 'object literals need a named interface or type alias as their type');
    const ot = t;
    const o = this.newTmp('o');
    const sets = e.properties.map(p => {
      if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
        const pname = p.name.getText();
        const pd = this.findMember(ot.decl, pname);
        const pt = pd ? this.s.declType(pd, this.s.substFor(ot, pd)) : undefined;
        const val = ts.isPropertyAssignment(p) ? this.conv(p.initializer, pt) : this.coerce(this.ident(p.name), this.s.ztypeOf(p.name), pt ?? this.s.ztypeOf(p.name), p);
        return `${o}->${this.id(pname)} = ${val}; `;
      }
      return this.s.fail(p, 'Z9016', 'only `key: value` properties are supported in object literals');
    }).join('');
    return `([&]() { auto ${o} = zrt::make<${this.cls(ot)}>(); ${sets}return ${o}; }())`;
  }
  findMember(d: ts.Declaration, name: string): ts.Declaration | undefined {
    const ms = ts.isTypeAliasDeclaration(d) ? (d.type as ts.TypeLiteralNode).members : ts.isInterfaceDeclaration(d) ? d.members : [];
    const m = ms.find(m => m.name?.getText() === name);
    if (m) return m;
    if (ts.isInterfaceDeclaration(d)) for (const b of this.bases(d)) { const r = this.findMember(b, name); if (r) return r; }
    return undefined;
  }

  lambda(f: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration, ft: Extract<ZT, { k: 'fn' }>): string {
    const ps = f.parameters.map((p, i) => {
      if (p.initializer) this.s.fail(p, 'Z9024', 'default values in closures are not supported yet');
      return `${this.cpp(ft.params[i])} ${this.id(p.name.getText())}`;
    }).join(', ');
    const saved = this.retType, savedB = this.breaks, savedC = this.inCtor;
    this.retType = ft.ret; this.breaks = []; this.inCtor = false;
    let body: string;
    const fb = f.body!;
    if (ts.isBlock(fb)) body = this.block(fb, 1);
    else body = ft.ret.k === 'void' ? `{ ${this.expr(fb)}; }` : `{ return ${this.conv(fb, ft.ret)}; }`;
    this.retType = saved; this.breaks = savedB; this.inCtor = savedC;
    return `[=](${ps}) -> ${this.cpp(ft.ret)} ${body}`;
  }

  toI32(e: ts.Expression): string {
    const t = this.s.ztypeOf(e);
    if (t.k === 'num' && t.m === 'i32') return this.expr(e, I32);
    if (t.k === 'num' && isInt(t.m)) return `static_cast<int32_t>(${this.expr(e, I32)})`;
    return `zrt::cvt<int32_t>(${this.expr(e)})`;
  }

  binary(e: ts.BinaryExpression, want?: ZT): string {
    const K = this.K, op = e.operatorToken.kind;
    const L = e.left, R = e.right;
    if (op === K.EqualsToken) return this.assign(L, R);
    if (op > K.FirstAssignment && op <= K.LastAssignment) return this.compound(e);
    if (op === K.CommaToken) return `(${this.expr(L)}, ${this.expr(R)})`;
    const lt = this.s.ztypeOf(L), rt = this.s.ztypeOf(R);
    if (op === K.AmpersandAmpersandToken || op === K.BarBarToken) {
      if (lt.k === 'bool' && rt.k === 'bool') return `(${this.expr(L)} ${op === K.BarBarToken ? '||' : '&&'} ${this.expr(R)})`;
      const t = this.s.ztypeOf(e), v = this.newTmp('t');
      const pick = op === K.BarBarToken ? `zrt::truthy(${v}) ? ${v} : ${this.conv(R, t)}` : `zrt::truthy(${v}) ? ${this.conv(R, t)} : ${v}`;
      return `([&]() -> ${this.cpp(t)} { ${this.cpp(t)} ${v} = ${this.conv(L, t)}; return ${pick}; }())`;
    }
    if (op === K.QuestionQuestionToken) {
      const inner = ts.isParenthesizedExpression(L) ? L.expression : L;
      if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression) && inner.expression.name.text === 'get') {
        const mt = this.s.ztypeOf(inner.expression.expression);
        if (mt.k === 'map') return `${this.expr(inner.expression.expression)}.get_or(${this.conv(inner.arguments[0], mt.key)}, ${this.conv(R, mt.val)})`;
      }
      if (lt.k === 'obj' || lt.k === 'fn' || lt.k === 'arr') {
        const t = this.s.ztypeOf(e), v = this.newTmp('t');
        return `([&]() -> ${this.cpp(t)} { ${this.cpp(t)} ${v} = ${this.expr(L)}; return ${v} == nullptr ? ${this.conv(R, t)} : ${v}; }())`;
      }
      return this.expr(L);
    }
    if (op === K.InstanceOfKeyword) {
      const d = this.s.declOf(R);
      if (!d || !ts.isClassDeclaration(d)) return this.s.fail(R, 'Z9025', 'instanceof needs a class');
      return `zrt::isa<${this.qual(d)}>(${this.expr(L)})`;
    }
    if (op === K.InKeyword) this.s.fail(e, 'Z9026', "'in' is not supported; use Map.has");
    const eq = [K.EqualsEqualsToken, K.EqualsEqualsEqualsToken, K.ExclamationEqualsToken, K.ExclamationEqualsEqualsToken].includes(op);
    const cmp = [K.LessThanToken, K.GreaterThanToken, K.LessThanEqualsToken, K.GreaterThanEqualsToken].includes(op);
    const opText = eq ? (op === K.EqualsEqualsToken || op === K.EqualsEqualsEqualsToken ? '==' : '!=') : e.operatorToken.getText();
    if (eq || cmp) {
      if (lt.k === 'null' || rt.k === 'null') {
        const other = lt.k === 'null' ? R : L;
        const ot = this.s.ztypeOf(other);
        if (ot.k === 'str') return `(${this.expr(other)}.s ${opText} nullptr)`;
        if (ot.k === 'num' || ot.k === 'bool') return opText === '==' ? 'false' : 'true';
        return `(${this.expr(other)} ${opText} nullptr)`;
      }
      if (eq && lt.k !== rt.k) this.s.fail(e, 'Z1013', `comparison between '${lt.k}' and '${rt.k}' is always false; Zinc refuses mixed-type equality (LNG-21)`);
      if (lt.k === 'str' && cmp) return `(zrt::str_cmp(${this.expr(L)}, ${this.expr(R)}) ${opText} 0)`;
      if (isNum(lt) && isNum(rt)) {
        const m = this.s.arith(K.PlusToken, L, lt, R, rt);
        const w: ZT = { k: 'num', m };
        const cast = (x: ts.Expression, xt: ZT) => isNum(xt) && xt.m !== m && !this.s.isIntLiteral(x) ? `static_cast<${NUMC[m]}>(${this.expr(x, w)})` : this.expr(x, w);
        return `(${cast(L, lt)} ${opText} ${cast(R, rt)})`;
      }
      return `(${this.expr(L)} ${opText} ${this.expr(R)})`;
    }
    const t = this.s.ztypeOf(e);
    if (t.k === 'str') {
      const parts: ts.Expression[] = [];
      const flat = (x: ts.Expression) => {
        if (ts.isBinaryExpression(x) && x.operatorToken.kind === K.PlusToken && this.s.ztypeOf(x).k === 'str') { flat(x.left); flat(x.right); }
        else parts.push(x);
      };
      flat(e);
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
      return `static_cast<${NUMC[m]}>(${code})`;
    };
    switch (op) {
      case K.AmpersandToken: case K.BarToken: case K.CaretToken:
        return `(${this.toI32(L)} ${ts.tokenToString(op)} ${this.toI32(R)})`;
      case K.LessThanLessThanToken: return `zrt::shl(${this.toI32(L)}, ${this.toI32(R)})`;
      case K.GreaterThanGreaterThanToken: return `zrt::sar(${this.toI32(L)}, ${this.toI32(R)})`;
      case K.GreaterThanGreaterThanGreaterThanToken: return `zrt::shr(${this.toI32(L)}, ${this.toI32(R)})`;
      case K.AsteriskAsteriskToken: return `zrt::math::pow(${this.expr(L, F64)}, ${this.expr(R, F64)})`;
      case K.SlashToken: {
        const bothInt = isNum(lt) && isNum(rt) && isInt(lt.m) && isInt(rt.m);
        const fl: ZT = { k: 'num', m: m === 'f32' ? 'f32' : 'f64' };
        const a = `static_cast<${NUMC[fl.m as NumKind]}>(${this.expr(L, fl)})`, b = this.expr(R, fl);
        return bothInt ? `zrt::idiv(${a}, ${b})` : `(${a} / ${b})`;
      }
      case K.PercentToken:
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
    if (ts.isPropertyAccessExpression(L)) {
      const d = this.s.declOf(L.name);
      const rt = this.s.ztypeOf(L.expression);
      if ((rt.k === 'arr') && L.name.text === 'length') return `${this.expr(L.expression)}.set_length(${this.conv(R, I32)})`;
      if (d && ts.isSetAccessorDeclaration(d)) return `${this.expr(L.expression)}->set_${this.id(L.name.text)}(${this.conv(R, this.s.paramType(d.parameters[0]))})`;
      if (d && ts.isGetAccessorDeclaration(d)) {
        const setter = (d.parent as ts.ClassDeclaration).members.find(m => ts.isSetAccessorDeclaration(m) && m.name.getText() === L.name.text) as ts.SetAccessorDeclaration | undefined;
        if (setter) return `${this.expr(L.expression)}->set_${this.id(L.name.text)}(${this.conv(R, this.s.paramType(setter.parameters[0]))})`;
      }
    }
    if (ts.isElementAccessExpression(L)) {
      const at = this.s.ztypeOf(L.expression);
      if (at.k === 'arr') return `${this.expr(L.expression)}.set(${this.expr(L.argumentExpression, I32)}, ${this.conv(R, at.el)})`;
    }
    return `${this.expr(L)} = ${this.conv(R, lt)}`;
  }

  compound(e: ts.BinaryExpression): string {
    const K = this.K;
    const op = e.operatorToken.kind;
    const lt = this.s.ztypeOf(e.left);
    const base: Record<number, ts.SyntaxKind> = {
      [K.PlusEqualsToken]: K.PlusToken, [K.MinusEqualsToken]: K.MinusToken, [K.AsteriskEqualsToken]: K.AsteriskToken,
      [K.SlashEqualsToken]: K.SlashToken, [K.PercentEqualsToken]: K.PercentToken, [K.AmpersandEqualsToken]: K.AmpersandToken,
      [K.BarEqualsToken]: K.BarToken, [K.CaretEqualsToken]: K.CaretToken, [K.LessThanLessThanEqualsToken]: K.LessThanLessThanToken,
      [K.GreaterThanGreaterThanEqualsToken]: K.GreaterThanGreaterThanToken, [K.GreaterThanGreaterThanGreaterThanEqualsToken]: K.GreaterThanGreaterThanGreaterThanToken,
      [K.AsteriskAsteriskEqualsToken]: K.AsteriskAsteriskToken,
    };
    const bop = base[op];
    if (bop === undefined) return this.s.fail(e, 'Z9027', `operator '${e.operatorToken.getText()}' is not supported yet`);
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
}
