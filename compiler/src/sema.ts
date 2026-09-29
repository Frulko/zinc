// Sema: Zinc types (ZT) on top of the TypeScript checker.
// Machine types are read syntactically from annotations: the checker erases `type i32 = number` (spec §7 pitfall).
import * as path from 'node:path';
import { ts, ZINC_ROOT, type Diag, type Frontend } from './frontend.ts';

export type NumKind = 'f64' | 'f32' | 'fx12' | 'fx16' | 'i8' | 'i16' | 'i32' | 'i64' | 'u8' | 'u16' | 'u32' | 'u64' | 'isize' | 'usize';
export type ZT =
  | { k: 'num'; m: NumKind }
  | { k: 'bool' } | { k: 'str' } | { k: 'void' } | { k: 'null' }
  | { k: 'arr'; el: ZT }
  | { k: 'map'; key: ZT; val: ZT }
  | { k: 'set'; el: ZT }
  | { k: 'obj'; decl: ts.Node; args: ZT[] }
  /** dyn: the `DynFunction` intrinsic, (args: Dyn[]) => Dyn; a typed function passed there gets an adapter */
  | { k: 'fn'; params: ZT[]; ret: ZT; dyn?: true }
  | { k: 'promise'; el: ZT }
  | { k: 'gen'; el: ZT }
  | { k: 'tup'; els: ZT[] }
  | { k: 'tp'; name: string }
  /** the dynamic value of the gradual profile (section 9): `any`, `unknown`, untyped JSON */
  | { k: 'dyn' };

export const MACHINE: ReadonlySet<string> = new Set(['i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'fx12', 'fx16', 'isize', 'usize']);
export const F64: ZT = { k: 'num', m: 'f64' };
export const I32: ZT = { k: 'num', m: 'i32' };
export const BOOL: ZT = { k: 'bool' };
export const STR: ZT = { k: 'str' };
export const VOID: ZT = { k: 'void' };
export const DYN: ZT = { k: 'dyn' };
/** `DynFunction` (lib/zinc.d.ts): any function, called with an array of Dyn arguments (zinc:script host functions). */
export const DYNFN: ZT = { k: 'fn', params: [{ k: 'arr', el: DYN }], ret: DYN, dyn: true };
export const isDynFn = (t: ZT): boolean => t.k === 'fn' && !!t.dyn;

export const isFx = (m: NumKind) => m === 'fx12' || m === 'fx16';
export const isInt = (m: NumKind) => m !== 'f64' && m !== 'f32' && !isFx(m);
export const isNum = (t: ZT): t is { k: 'num'; m: NumKind } => t.k === 'num';
export function zeq(a: ZT, b: ZT): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'num': return a.m === (b as typeof a).m;
    case 'arr': case 'set': case 'promise': case 'gen': return zeq(a.el, (b as typeof a).el);
    case 'map': return zeq(a.key, (b as typeof a).key) && zeq(a.val, (b as typeof a).val);
    case 'obj': return a.decl === (b as typeof a).decl && a.args.length === (b as typeof a).args.length && a.args.every((x, i) => zeq(x, (b as typeof a).args[i]));
    case 'fn': return a.params.length === (b as typeof a).params.length && a.params.every((x, i) => zeq(x, (b as typeof a).params[i])) && zeq(a.ret, (b as typeof a).ret);
    case 'tp': return a.name === (b as typeof a).name;
    case 'tup': return a.els.length === (b as typeof a).els.length && a.els.every((x, i) => zeq(x, (b as typeof a).els[i]));
    default: return true;
  }
}
export const hasTypeParam = (t: ZT): boolean => t.k === 'tp' || (t.k === 'arr' || t.k === 'set' || t.k === 'promise' || t.k === 'gen' ? hasTypeParam(t.el) : t.k === 'map' ? hasTypeParam(t.key) || hasTypeParam(t.val) : t.k === 'fn' ? t.params.some(hasTypeParam) || hasTypeParam(t.ret) : t.k === 'obj' ? t.args.some(hasTypeParam) : t.k === 'tup' ? t.els.some(hasTypeParam) : false);
export const ERROR_CLASSES = new Set(['Error', 'TypeError', 'RangeError']);

export class ZincError extends Error {
  diag: Diag;
  constructor(diag: Diag) { super(diag.message); this.diag = diag; }
}

export interface SemaOptions { numberKind: NumKind; typing: 'strict' | 'gradual'; warnFloat: boolean; noFloat: boolean; heap0: boolean }

type CallTargets = { fns: ts.Node[]; dynamic: boolean };

export class Sema {
  checker: ts.TypeChecker;
  /** `number` representation for the active profile (LNG-03). */
  numberKind: NumKind;
  typing: 'strict' | 'gradual';
  opts: SemaOptions;
  boxed = new Set<ts.Symbol>();
  loopI32 = new Set<ts.Symbol>();
  classIds = new Map<ts.Node, number>();
  /** Classes in an inheritance relation (need virtual dispatch, LNG-08). */
  hierarchy = new Set<ts.Node>();
  warnings: Diag[] = [];
  /** lib `interface Error`: the static type of every thrown value (LNG-15). */
  errorDecl: ts.InterfaceDeclaration;
  /** Discriminated unions: alias -> members, member -> alias (LNG-11). */
  unionMembers = new Map<ts.TypeAliasDeclaration, ts.Node[]>();
  unionOf = new Map<ts.Node, ts.TypeAliasDeclaration>();
  /** Structs synthesized for anonymous object literal / inline object types. */
  anon: ts.Node[] = [];
  /** Function-likes that may complete by throwing (RT-05 error returns are only emitted where needed). */
  throwing = new Set<ts.Node>();
  anyLambdaThrows = false;
  hasThrow = false;
  /** The program mentions any/unknown, JSON.parse or is JavaScript: classes get Dyn property tables. */
  usesDyn = false;
  private methodsByName = new Map<string, ts.Node[]>();
  private targetCache = new Map<ts.Node, CallTargets>();

  fe: Frontend;
  root: string;

  constructor(fe: Frontend, root: string, opts: SemaOptions) {
    this.fe = fe;
    this.root = root;
    this.opts = opts;
    this.numberKind = opts.numberKind;
    this.typing = opts.typing;
    this.checker = fe.checker;
    const lib = fe.program.getSourceFiles().find(f => f.fileName.endsWith('lib/zinc.d.ts'))!;
    this.errorDecl = lib.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'Error')!;
    this.analyze();
  }

  // ---------- diagnostics (CMP-05, CMP-14) ----------
  diag(node: ts.Node, code: string, message: string, severity: 'error' | 'warning' = 'error'): Diag {
    const sf = node.getSourceFile();
    const lc = sf.getLineAndCharacterOfPosition(node.getStart());
    return { file: path.relative(process.cwd(), sf.fileName), line: lc.line + 1, col: lc.character + 1, code, severity, message };
  }
  fail(node: ts.Node, code: string, message: string): never { throw new ZincError(this.diag(node, code, message)); }
  warn(node: ts.Node, code: string, message: string) { this.warnings.push(this.diag(node, code, message, 'warning')); }

  // ---------- whole-program pre-pass ----------
  private analyze() {
    const captured = new Set<ts.Symbol>();
    const written = new Set<ts.Symbol>();
    const calls: (ts.CallExpression | ts.NewExpression | ts.PropertyAccessExpression | ts.BinaryExpression)[] = [];
    const iterations: ts.ForOfStatement[] = [];
    let cid = 1;
    const visit = (n: ts.Node) => {
      this.forbid(n);
      if (n.kind === ts.SyntaxKind.AnyKeyword || n.kind === ts.SyntaxKind.UnknownKeyword || (ts.isPropertyAccessExpression(n) && n.getText() === 'JSON.parse')) this.usesDyn = true;
      if (ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n)) {
        this.classIds.set(n, cid++);
        if (ts.isClassDeclaration(n)) {
          const base = this.baseClass(n);
          if (base || this.errorBase(n)) { this.hierarchy.add(n); if (base) this.hierarchy.add(base); for (let b = base && this.baseClass(base); b; b = this.baseClass(b)) this.hierarchy.add(b); }
        }
        for (const m of n.members) if ((ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) && m.name) {
          const l = this.methodsByName.get(m.name.getText()) ?? [];
          l.push(m);
          this.methodsByName.set(m.name.getText(), l);
        }
      }
      if (ts.isTypeAliasDeclaration(n)) this.registerAlias(n, () => cid++);
      if (ts.isObjectLiteralExpression(n) && !this.isLib(n) && n.properties.every(p => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && n.properties.length > 0) {
        const ct = this.checker.getContextualType(n);
        const named = ct && (this.dynContext(n, ct) || ct.aliasSymbol || (ct.getSymbol()?.declarations ?? []).some(d => ts.isInterfaceDeclaration(d) || ts.isTypeLiteralNode(d) || ts.isClassDeclaration(d)) || ct.isUnion() || this.checker.isTupleType(ct));
        if (!named) { this.anon.push(n); this.classIds.set(n, cid++); }
      }
      if (ts.isTypeLiteralNode(n) && !ts.isTypeAliasDeclaration(n.parent) && !ts.isUnionTypeNode(n.parent) && !this.isLib(n) && n.members.every(m => ts.isPropertySignature(m))) { this.anon.push(n); this.classIds.set(n, cid++); }
      if (ts.isIdentifier(n)) {
        const sym = this.symbolOf(n);
        const decl = sym?.valueDeclaration;
        if (sym && decl && (ts.isVariableDeclaration(decl) || ts.isParameter(decl) || ts.isBindingElement(decl)) && !this.isModuleLevel(decl)) {
          if (this.fnOf(n) !== this.fnOf(decl)) captured.add(sym);
          if (this.isWrite(n)) written.add(sym);
        }
      }
      if (ts.isForStatement(n)) this.loopCounter(n);
      if (ts.isForOfStatement(n)) iterations.push(n);
      if (ts.isThrowStatement(n)) { this.hasThrow = true; const f = this.fnOf(n); if (f) this.throwing.add(f); }
      if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isPropertyAccessExpression(n) || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken)) calls.push(n);
      if (this.opts.warnFloat && ts.isTypeReferenceNode(n) && (n.typeName.getText() === 'f32' || n.typeName.getText() === 'f64')) {
        if (this.opts.noFloat) this.fail(n, 'Z4001', `'${n.typeName.getText()}' needs software floating point on this target (--no-float)`);
        this.warn(n, 'Z4001', `'${n.typeName.getText()}' is emulated in software on this target (no FPU)`);
      }
      ts.forEachChild(n, visit);
    };
    for (const sf of this.fe.sources) { if (/\.[cm]?js$/.test(sf.fileName)) this.usesDyn = true; visit(sf); }
    for (const s of captured) if (written.has(s)) this.boxed.add(s);
    for (const c of calls) this.callTargets(c);  // registers library functions tagged @throws
    // throw propagation over the call graph (fixpoint)
    if (this.hasThrow) {
      // Generator creation is lazy; errors propagate from iteration, including through callers.
      for (const loop of iterations) {
        const caller = this.fnOf(loop);
        if (caller && !this.isAsyncFn(caller) && this.tryZ(loop.expression).k === 'gen') this.throwing.add(caller);
      }
      let changed = true;
      while (changed) {
        changed = false;
        this.anyLambdaThrows = [...this.throwing].some(f => ts.isArrowFunction(f) || ts.isFunctionExpression(f)) || calls.some(c => ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === 'bind');
        for (const c of calls) {
          const caller = this.fnOf(c);
          if (!caller || this.throwing.has(caller) || this.isAsyncFn(caller)) continue;
          if (this.mayThrow(c)) { this.throwing.add(caller); changed = true; }
        }
      }
    }
  }

  /** An object literal whose contextual type is any/unknown is built as a Dyn object, not a struct. */
  private dynContext(n: ts.Node, ct: ts.Type): boolean {
    if (ct.flags & ts.TypeFlags.Any) return true;
    if (!(ct.flags & ts.TypeFlags.Unknown)) return false;
    const call = n.parent;  // console.log({...}) keeps its anonymous struct
    const d = ts.isCallExpression(call) ? (ts.isPropertyAccessExpression(call.expression) ? this.declOf(call.expression.name) : this.declOf(call.expression)) : undefined;
    return !(d && this.isLib(d));
  }

  private registerAlias(n: ts.TypeAliasDeclaration, nextId: () => number) {
    if (ts.isTypeLiteralNode(n.type)) { this.classIds.set(n, nextId()); return; }
    if (!ts.isUnionTypeNode(n.type)) return;
    const parts = n.type.types.filter(t => !this.isNullish(t));
    const members: ts.Node[] = [];
    for (const p of parts) {
      if (ts.isTypeLiteralNode(p)) members.push(p);
      else if (ts.isTypeReferenceNode(p)) {
        const d = this.declOf(p.typeName);
        if (d && (ts.isInterfaceDeclaration(d) || (ts.isTypeAliasDeclaration(d) && ts.isTypeLiteralNode(d.type))) && !this.isLib(d)) members.push(d);
        else return;
      } else return;
    }
    if (members.length < 2) return;
    this.classIds.set(n, nextId());
    this.unionMembers.set(n, members);
    for (const m of members) {
      if (this.unionOf.has(m)) this.fail(m, 'Z9029', 'a type can belong to one discriminated union in the prototype');
      this.unionOf.set(m, n);
      if (ts.isTypeLiteralNode(m)) this.classIds.set(m, nextId());
    }
  }
  private isNullish(t: ts.TypeNode) {
    return t.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword);
  }

  /** Forbidden constructs (CMP-05, section 7). */
  private forbid(n: ts.Node) {
    const Z = (code: string, msg: string): never => this.fail(n, code, msg);
    if (ts.isVariableDeclarationList(n) && !(n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using)))
      Z('Z1001', "'var' is not supported; use 'let' or 'const'");
    if (ts.isIdentifier(n) && n.text === 'arguments' && !ts.isPropertyAccessExpression(n.parent)) Z('Z1002', "'arguments' is not supported; use explicit parameters");
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'eval') Z('Z1003', "'eval' is not supported");
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'Function' || n.expression.text === 'Proxy' || n.expression.text === 'RegExp'))
      Z('Z1004', `'new ${n.expression.text}' is not supported`);
    if (n.kind === ts.SyntaxKind.WithStatement) Z('Z1005', "'with' is not supported");
    if (n.kind === ts.SyntaxKind.AnyKeyword && this.typing === 'strict') Z('Z1006', "'any' is not allowed in the strict typing profile (DYN-01)");
    if (ts.isDeleteExpression(n)) Z('Z1007', "'delete' on a typed field is not supported");
    if (ts.isRegularExpressionLiteral(n)) Z('Z1008', 'regular expressions are not supported in the prototype');
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) Z('Z1009', "dynamic 'import()' is not supported");
    if (ts.isPropertyAccessExpression(n) && (n.name.text === '__proto__' || (n.name.text === 'prototype' && ts.isBinaryExpression(n.parent) && n.parent.left === n)))
      Z('Z1010', 'prototype mutation is not supported');
    if (ts.isArrayLiteralExpression(n) && n.elements.some(e => e.kind === ts.SyntaxKind.OmittedExpression)) Z('Z1011', 'arrays with holes are not supported');
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Object' && (n.name.text === 'defineProperty' || n.name.text === 'setPrototypeOf'))
      Z('Z1012', `'Object.${n.name.text}' is not supported`);
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'globalThis') Z('Z1015', "'globalThis' is not supported");
  }

  /** LNG-04 (cheap form): `for (let i = <int>; i <op> <int expr>; i++|i--|i+=<int>)` with no other writes -> i32. */
  private loopCounter(f: ts.ForStatement) {
    const init = f.initializer;
    if (!init || !ts.isVariableDeclarationList(init) || init.declarations.length !== 1) return;
    const d = init.declarations[0];
    if (d.type || !d.initializer || !ts.isIdentifier(d.name) || !this.isIntLiteral(d.initializer)) return;
    const sym = this.symbolOf(d.name);
    if (!sym) return;
    const c = f.condition;
    if (!c || !ts.isBinaryExpression(c) || !ts.isIdentifier(c.left) || this.symbolOf(c.left) !== sym) return;
    const op = c.operatorToken.kind;
    if (![ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(op)) return;
    const bound = this.tryZ(c.right);
    if (!(this.isIntLiteral(c.right) || (isNum(bound) && ['i32', 'i16', 'i8', 'u8', 'u16'].includes(bound.m)))) return;
    const inc = f.incrementor;
    const okInc = inc && (
      ((ts.isPostfixUnaryExpression(inc) || ts.isPrefixUnaryExpression(inc)) && ts.isIdentifier(inc.operand) && this.symbolOf(inc.operand) === sym) ||
      (ts.isBinaryExpression(inc) && ts.isIdentifier(inc.left) && this.symbolOf(inc.left) === sym &&
        (inc.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken || inc.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) && this.isIntLiteral(inc.right)));
    if (!okInc) return;
    let otherWrite = false;
    const scan = (n: ts.Node) => { if (ts.isIdentifier(n) && this.symbolOf(n) === sym && this.isWrite(n)) otherWrite = true; ts.forEachChild(n, scan); };
    scan(f.statement);
    if (!otherWrite) this.loopI32.add(sym);
  }

  // ---------- throw analysis ----------
  callTargets(c: ts.CallExpression | ts.NewExpression | ts.PropertyAccessExpression | ts.BinaryExpression): CallTargets {
    let r = this.targetCache.get(c);
    if (r) return r;
    r = { fns: [], dynamic: false };
    if (ts.isPropertyAccessExpression(c) || ts.isBinaryExpression(c)) {
      const property = ts.isPropertyAccessExpression(c) ? c : ts.isPropertyAccessExpression(c.left) ? c.left : undefined;
      const d = property && this.declOf(property.name);
      // Accessors dispatch virtually; conservatively check all accessor entries.
      r.dynamic = !!d && (ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d));
      this.targetCache.set(c, r); return r;
    }
    const fnArgs = (c.arguments ?? []).filter(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    if (ts.isNewExpression(c)) {
      for (let d = this.declOf(c.expression); d && ts.isClassDeclaration(d); d = this.baseClass(d)) {
        const ctor = d.members.find(ts.isConstructorDeclaration);
        if (ctor) r.fns.push(ctor);
      }
      r.fns.push(...fnArgs);
    } else {
      const e = c.expression;
      const d = ts.isPropertyAccessExpression(e) ? this.declOf(e.name) : e.kind === ts.SyntaxKind.SuperKeyword ? undefined : this.declOf(e);
      if (d && this.isLib(d)) {
        r.fns.push(...fnArgs);
        if (ts.getJSDocTags(d).some(t => t.tagName.text === 'throws')) { r.fns.push(d); this.throwing.add(d); this.hasThrow = true; }
      }
      else if (d && ts.isMethodSignature(d) && d.getSourceFile().fileName.endsWith('.spec.ts')) {
        // Native implementations can set g_err themselves or invoke a retained
        // guest callback; their bodies are outside this call graph.
        r.fns.push(d);this.throwing.add(d);this.hasThrow = true;
      }
      else if (d && ts.isFunctionDeclaration(d)) r.fns.push(d);
      else if (d && (ts.isMethodDeclaration(d) || ts.isMethodSignature(d))) r.fns.push(...(this.methodsByName.get(d.name.getText()) ?? []));
      else r.dynamic = true;
    }
    this.targetCache.set(c, r);
    return r;
  }
  /** Whether a call may complete with a pending error (needs a check after it). */
  mayThrow(c: ts.CallExpression | ts.NewExpression | ts.PropertyAccessExpression | ts.BinaryExpression): boolean {
    if (!this.hasThrow) return false;
    const t = this.callTargets(c);
    if (t.fns.some(f => this.throwing.has(f) && !this.isAsyncFn(f) && !this.isGeneratorFn(f))) return true;
    return t.dynamic && ((ts.isPropertyAccessExpression(c) || ts.isBinaryExpression(c)) || this.anyLambdaThrows);
  }
  isAsyncFn(f: ts.Node): boolean {
    return ts.isFunctionLike(f) && !!(ts.getCombinedModifierFlags(f as ts.Declaration) & ts.ModifierFlags.Async);
  }
  isGeneratorFn(f: ts.Node): boolean {
    return (ts.isFunctionDeclaration(f) || ts.isMethodDeclaration(f) || ts.isFunctionExpression(f)) && !!f.asteriskToken;
  }

  // ---------- helpers ----------
  symbolOf(n: ts.Node): ts.Symbol | undefined {
    let s = this.checker.getSymbolAtLocation(n);
    if (s && s.flags & ts.SymbolFlags.Alias) s = this.checker.getAliasedSymbol(s);
    return s;
  }
  declOf(n: ts.Node): ts.Declaration | undefined {
    const s = this.symbolOf(n);
    return s?.valueDeclaration ?? s?.declarations?.[0];
  }
  isLib(n: ts.Node) { return n.getSourceFile().isDeclarationFile; }
  /** `JSON.parse(s)`, `await res.json()`: a standard-library call typed `any` is an `unknown` in the strict profile
   *  (the value must be narrowed or stored as `unknown`, DYN-01). */
  libAnyCall(at: ts.Node | undefined): boolean {
    let e = at;
    while (e && (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e))) e = e.expression;
    if (!e || !ts.isCallExpression(e)) return false;
    const d = this.declOf(ts.isPropertyAccessExpression(e.expression) ? e.expression.name : e.expression);
    return !!d && this.isLib(d);
  }
  /** 'fs' for declarations inside `declare module 'zinc:fs'`. */
  libModule(n: ts.Node): string | undefined {
    if (ts.isClassDeclaration(n) && n.name?.text === 'Arena' && n.getSourceFile().fileName.endsWith('lib/zinc.d.ts')) return 'mem';
    for (let p: ts.Node | undefined = n; p; p = p.parent)
      if (ts.isModuleDeclaration(p) && ts.isStringLiteral(p.name) && p.name.text.startsWith('zinc:')) return p.name.text.slice(5);
    return undefined;
  }
  isModuleLevel(d: ts.Node): boolean {
    let p = d.parent;
    while (p && (ts.isBindingElement(p) || ts.isArrayBindingPattern(p) || ts.isObjectBindingPattern(p) || ts.isVariableDeclaration(p) || ts.isVariableDeclarationList(p) || ts.isVariableStatement(p))) p = p.parent;
    return !!p && ts.isSourceFile(p);
  }
  fnOf(n: ts.Node): ts.Node | undefined {
    for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isClassStaticBlockDeclaration(p)) return p;
    return undefined;
  }
  isWrite(id: ts.Node): boolean {
    let n: ts.Node = id;
    while (ts.isParenthesizedExpression(n.parent)) n = n.parent;
    const p = n.parent;
    if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
    if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
    return false;
  }
  isIntLiteral(e: ts.Expression): boolean {
    if (ts.isParenthesizedExpression(e)) return this.isIntLiteral(e.expression);
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken) return this.isIntLiteral(e.operand);
    if (!ts.isNumericLiteral(e)) return false;
    const v = Number(e.text);
    return Number.isInteger(v) && Math.abs(v) <= 0x7fffffff && !/[.eE]/.test(e.text);
  }
  baseClass(c: ts.ClassLikeDeclaration): ts.ClassDeclaration | undefined {
    const h = c.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
    if (!h) return undefined;
    const d = this.declOf(h.types[0].expression);
    return d && ts.isClassDeclaration(d) ? d : undefined;
  }
  /** 'Error' | 'TypeError' | 'RangeError' when the class directly extends a builtin error. */
  errorBase(c: ts.ClassLikeDeclaration): string | undefined {
    const h = c.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
    const e = h?.types[0].expression;
    if (!e || !ts.isIdentifier(e) || !ERROR_CLASSES.has(e.text)) return undefined;
    const d = this.declOf(e);
    return d && this.isLib(d) ? e.text : undefined;
  }
  implemented(c: ts.ClassLikeDeclaration): ts.Declaration[] {
    const h = c.heritageClauses?.find(h => h.token === ts.SyntaxKind.ImplementsKeyword);
    return (h?.types ?? []).map(t => this.declOf(t.expression)).filter((d): d is ts.Declaration => !!d);
  }
  /** reduce accumulator: the callback's annotated first parameter wins over the initial value's type (`acc: i32` + `0`). */
  reduceAcc(call: ts.CallExpression): ZT | undefined {
    const cb = call.arguments[0];
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && cb.parameters[0]?.type) return this.fromTypeNode(cb.parameters[0].type);
    return call.arguments[1] ? this.ztypeOf(call.arguments[1]) : undefined;
  }
  /** Type of `a ?? b` / `c ? a : b` when both are objects: the same class, else the nearest common base class. */
  commonObj(a: ZT, b: ZT): ZT {
    if (a.k !== 'obj' || b.k !== 'obj' || a.decl === b.decl) return a;
    if (this.inherits(b.decl, a.decl)) return a;
    if (this.inherits(a.decl, b.decl)) return b;
    for (let c: ts.Node | undefined = a.decl; c && ts.isClassDeclaration(c); c = this.baseClass(c as ts.ClassDeclaration))
      if (this.inherits(b.decl, c)) return { k: 'obj', decl: c, args: [] };
    return a;
  }
  inherits(c: ts.Node, target: ts.Node): boolean {
    if (c === target) return true;
    if (this.unionOf.get(c) === target) return true;
    if (ts.isInterfaceDeclaration(c)) return (c.heritageClauses ?? []).some(h => h.types.some(t => { const d = this.declOf(t.expression); return !!d && this.inherits(d, target); }));
    if (!ts.isClassDeclaration(c)) return false;
    if (target === this.errorDecl && this.errorBase(c)) return true;
    const b = this.baseClass(c);
    if (b && this.inherits(b, target)) return true;
    return this.implemented(c).some(i => this.inherits(i, target));
  }

  /** Property signatures/declarations of an object-like declaration, bases first. */
  members(d: ts.Node): ts.Node[] {
    if (ts.isObjectLiteralExpression(d)) return [...d.properties];
    if (ts.isTypeLiteralNode(d)) return [...d.members];
    if (ts.isTypeAliasDeclaration(d)) {
      if (ts.isTypeLiteralNode(d.type)) return [...d.type.members];
      const ms = this.unionMembers.get(d);
      if (ms) return this.commonFields(d);
      return [];
    }
    if (ts.isInterfaceDeclaration(d) || ts.isClassDeclaration(d)) return [...d.members];
    return [];
  }
  /** Fields shared by every member of a discriminated union (stored in the union's base struct). */
  commonFields(alias: ts.TypeAliasDeclaration): ts.Node[] {
    const ms = this.unionMembers.get(alias)!;
    const first = this.ownMembers(ms[0]).filter(m => ts.isPropertySignature(m));
    return first.filter(f => ms.every(m => this.ownMembers(m).some(x => ts.isPropertySignature(x) && x.name.getText() === (f as ts.PropertySignature).name.getText())));
  }
  ownMembers(d: ts.Node): ts.Node[] {
    if (ts.isObjectLiteralExpression(d)) return [...d.properties];
    if (ts.isTypeLiteralNode(d)) return [...d.members];
    if (ts.isTypeAliasDeclaration(d) && ts.isTypeLiteralNode(d.type)) return [...d.type.members];
    if (ts.isInterfaceDeclaration(d) || ts.isClassDeclaration(d)) return [...d.members];
    return [];
  }
  /** Find a member by name through bases, interfaces and unions. */
  memberDecl(d: ts.Node, name: string): ts.Declaration | undefined {
    const m = this.ownMembers(d).find(m => (m as ts.NamedDeclaration).name?.getText() === name) as ts.Declaration | undefined;
    if (m) return m;
    const u = this.unionOf.get(d);
    if (u) { const r = this.commonFields(u).find(f => (f as ts.PropertySignature).name.getText() === name); if (r) return r as ts.Declaration; }
    if (ts.isTypeAliasDeclaration(d) && this.unionMembers.has(d)) return this.memberDecl(this.unionMembers.get(d)![0], name);
    if (ts.isClassDeclaration(d)) {
      const b = this.baseClass(d);
      if (b) return this.memberDecl(b, name);
      if (this.errorBase(d)) return this.memberDecl(this.errorDecl, name);
    }
    if (ts.isInterfaceDeclaration(d)) for (const h of d.heritageClauses ?? []) for (const t of h.types) {
      const b = this.declOf(t.expression);
      const r = b && this.memberDecl(b, name);
      if (r) return r;
    }
    return undefined;
  }
  /** JSON field order: bases first, then declaration order (shared by the C++ and JS emitters). */
  fieldNames(d: ts.Node): string[] {
    const out: string[] = [];
    const u = this.unionOf.get(d);
    if (u) out.push(...this.commonFields(u).map(f => (f as ts.PropertySignature).name.getText()));
    if (ts.isClassDeclaration(d)) { const b = this.baseClass(d); if (b) out.push(...this.fieldNames(b)); }
    if (ts.isInterfaceDeclaration(d)) for (const h of d.heritageClauses ?? []) for (const t of h.types) { const b = this.declOf(t.expression); if (b) out.push(...this.fieldNames(b)); }
    for (const m of this.members(d)) {
      if ((ts.isPropertyDeclaration(m) || ts.isPropertySignature(m) || ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m)) && (ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m) || !(ts.getCombinedModifierFlags(m as ts.Declaration) & ts.ModifierFlags.Static))) {
        const n = m.name.getText();
        if (!n.startsWith('#') && !out.includes(n)) out.push(n);
      }
      if (ts.isConstructorDeclaration(m)) for (const p of m.parameters) if (ts.getCombinedModifierFlags(p) & (ts.ModifierFlags.Public | ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Readonly)) out.push(p.name.getText());
    }
    return out;
  }
  /** Pick the union member an object literal builds (by discriminant literal values). */
  unionMemberFor(alias: ts.TypeAliasDeclaration, lit: ts.ObjectLiteralExpression): ts.Node {
    const names = lit.properties.map(p => p.name?.getText());
    for (const m of this.unionMembers.get(alias)!) {
      const props = this.ownMembers(m).filter(ts.isPropertySignature);
      if (!names.every(n => props.some(p => p.name.getText() === n))) continue;
      const ok = props.every(p => {
        if (!p.type || !ts.isLiteralTypeNode(p.type)) return true;
        const v = lit.properties.find(x => x.name?.getText() === p.name.getText());
        if (!v || !ts.isPropertyAssignment(v)) return !!p.questionToken;
        const init = v.initializer;
        return (ts.isStringLiteral(init) || ts.isNumericLiteral(init)) && ts.isLiteralTypeNode(p.type) && (p.type.literal as ts.LiteralExpression).text === init.text;
      });
      if (ok) return m;
    }
    return this.fail(lit, 'Z9030', 'cannot tell which union member this object literal builds; add the discriminant');
  }

  // ---------- ZT from syntax ----------
  fromTypeNode(t: ts.TypeNode, subst?: Map<string, ZT>): ZT {
    switch (t.kind) {
      case ts.SyntaxKind.NumberKeyword: return { k: 'num', m: this.numberKind };
      case ts.SyntaxKind.BooleanKeyword: return BOOL;
      case ts.SyntaxKind.StringKeyword: return STR;
      case ts.SyntaxKind.VoidKeyword: case ts.SyntaxKind.UndefinedKeyword: return VOID;
      case ts.SyntaxKind.NullKeyword: return { k: 'null' };
    }
    if (ts.isParenthesizedTypeNode(t)) return this.fromTypeNode(t.type, subst);
    if (ts.isLiteralTypeNode(t)) {
      if (t.literal.kind === ts.SyntaxKind.NullKeyword) return { k: 'null' };
      if (ts.isStringLiteral(t.literal)) return STR;
      if (ts.isNumericLiteral(t.literal)) return { k: 'num', m: this.numberKind };
      return BOOL;
    }
    if (ts.isArrayTypeNode(t)) return { k: 'arr', el: this.fromTypeNode(t.elementType, subst) };
    if (ts.isTupleTypeNode(t)) return { k: 'tup', els: t.elements.map(x => this.fromTypeNode(ts.isNamedTupleMember(x) ? x.type : x, subst)) };
    if (ts.isTypeLiteralNode(t) && (this.unionOf.has(t) || this.anon.includes(t))) return { k: 'obj', decl: t, args: [] };
    if (ts.isUnionTypeNode(t)) {
      if (ts.isTypeAliasDeclaration(t.parent) && this.unionMembers.has(t.parent)) return { k: 'obj', decl: t.parent, args: [] };
      const rest = t.types.filter(x => !this.isNullish(x));
      if (rest.length === 1) {
        const inner = this.fromTypeNode(rest[0], subst);
        // numbers and booleans have no null state in the generated code (strings and objects do)
        const optionalField = (ts.isPropertySignature(t.parent) || ts.isPropertyDeclaration(t.parent) || ts.isParameter(t.parent)) && !!(t.parent as ts.PropertySignature).questionToken;
        if (rest.length < t.types.length && (inner.k === 'num' || inner.k === 'bool') && !optionalField && !ts.isParameter(t.parent) && !ts.isPropertySignature(t.parent) && !ts.isPropertyDeclaration(t.parent))
          this.fail(t, 'Z9036', `'${t.getText()}': a nullable ${inner.k === 'num' ? 'number' : 'boolean'} needs a sentinel value (e.g. -1), an optional field (x?: ${rest[0].getText()}), or an object`);
        return inner;
      }
      return this.fromType(this.checker.getTypeFromTypeNode(t), t);
    }
    if (ts.isFunctionTypeNode(t))
      return { k: 'fn', params: t.parameters.map(p => this.paramType(p, subst)), ret: this.fromTypeNode(t.type, subst) };
    if (ts.isTypeReferenceNode(t)) {
      const name = t.typeName.getText();
      if (MACHINE.has(name)) return { k: 'num', m: name as NumKind };
      if (subst?.has(name)) return subst.get(name)!;
      const args = (t.typeArguments ?? []).map(a => this.fromTypeNode(a, subst));
      if (name === 'Array' || name === 'ReadonlyArray') return { k: 'arr', el: args[0] };
      if (name === 'Map') return { k: 'map', key: args[0], val: args[1] };
      if (name === 'Set') return { k: 'set', el: args[0] };
      if (name === 'Promise') return { k: 'promise', el: args[0] ?? VOID };
      if (name === 'Generator' || name === 'IterableIterator' || name === 'Iterable') return { k: 'gen', el: args[0] };
      const d = this.declOf(t.typeName);
      if (d) {
        if (d === this.errorDecl) return { k: 'obj', decl: d, args: [] };
        if (ts.isTypeParameterDeclaration(d)) return { k: 'tp', name };
        if (ts.isEnumDeclaration(d)) return I32;
        if (ts.isTypeAliasDeclaration(d) && name === 'DynFunction' && this.isLib(d)) return DYNFN;
        if (ts.isTypeAliasDeclaration(d)) {
          if (ts.isTypeLiteralNode(d.type) || this.unionMembers.has(d)) return { k: 'obj', decl: d, args };
          if (!this.isLib(d)) return this.fromTypeNode(d.type, subst);
        }
        if (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d)) {
          if (this.isLib(d) && this.libModule(d)) return { k: 'obj', decl: d, args };
          if (this.isLib(d)) return this.fromType(this.checker.getTypeFromTypeNode(t), t);
          return { k: 'obj', decl: d, args };
        }
      }
    }
    return this.fromType(this.checker.getTypeFromTypeNode(t), t);
  }

  // ---------- ZT from checker types ----------
  fromType(type: ts.Type, at: ts.Node): ZT {
    const f = type.flags;
    if (f & (ts.TypeFlags.NumberLike)) return (f & ts.TypeFlags.EnumLike) ? I32 : { k: 'num', m: this.numberKind };
    if (f & ts.TypeFlags.StringLike) return STR;
    if (f & ts.TypeFlags.BooleanLike) return BOOL;
    if (f & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return VOID;
    if (f & ts.TypeFlags.Null) return { k: 'null' };
    if (f & ts.TypeFlags.Never) return VOID;
    if (f & ts.TypeFlags.TypeParameter) return { k: 'tp', name: type.symbol?.name ?? 'T' };
    if (type.aliasSymbol) {
      const ad = type.aliasSymbol.declarations?.[0];
      if (ad && ts.isTypeAliasDeclaration(ad) && this.unionMembers.has(ad)) return { k: 'obj', decl: ad, args: [] };
      if (ad && ts.isTypeAliasDeclaration(ad) && type.aliasSymbol.name === 'DynFunction' && this.isLib(ad)) return DYNFN;
    }
    if (type.isUnion()) {
      const rest = type.types.filter(t => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.BooleanLike)) return BOOL;
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.EnumLike)) return I32;
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.NumberLike)) return { k: 'num', m: this.numberKind };
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.StringLike)) return STR;
      if (rest.length === 1) return this.fromType(rest[0], at);
      // a narrowed subset of one discriminated union
      const zs = rest.map(r => this.fromTypeSafe(r, at));
      const alias = zs[0]?.k === 'obj' ? this.unionOf.get(zs[0].decl) : undefined;
      if (alias && zs.every(z => z?.k === 'obj' && this.unionOf.get(z.decl) === alias)) return { k: 'obj', decl: alias, args: [] };
      this.fail(at, 'Z9001', `union type '${this.checker.typeToString(type)}' is not supported (use T | null or a discriminated union type alias)`);
    }
    if (f & ts.TypeFlags.Any) {
      if (this.typing === 'strict' && !this.libAnyCall(at)) this.fail(at, 'Z1006', "'any' is not allowed in the strict typing profile (DYN-01); annotate the value or narrow an 'unknown'");
      return DYN;
    }
    if (f & ts.TypeFlags.Unknown) return DYN;
    if (this.checker.isTupleType(type)) return { k: 'tup', els: this.checker.getTypeArguments(type as ts.TypeReference).map(a => this.fromType(a, at)) };
    const sym = type.getSymbol() ?? type.aliasSymbol;
    const args = (this.checker.getTypeArguments?.(type as ts.TypeReference) ?? []).map(a => this.fromType(a, at));
    if (sym) {
      if (sym.name === 'Array' || sym.name === 'ReadonlyArray') {
        // `const a = []` with nothing to type its elements: never[] would become Array<void> in C++
        const el = this.checker.getTypeArguments?.(type as ts.TypeReference)?.[0];
        const decl = at && ts.isArrayLiteralExpression(at) ? at.parent : at;
        if (el && el.flags & ts.TypeFlags.Never && decl && (ts.isVariableDeclaration(decl) || ts.isPropertyDeclaration(decl)) && !decl.type)
          this.fail(at!, 'Z9001', 'cannot type the elements of this empty array; annotate it (const a: number[] = [])');
        return { k: 'arr', el: args[0] ?? F64 };
      }
      if (sym.name === 'Map') return { k: 'map', key: args[0], val: args[1] };
      if (sym.name === 'Set') return { k: 'set', el: args[0] };
      if (sym.name === 'Promise') return { k: 'promise', el: args[0] ?? VOID };
      if (sym.name === 'Generator' || sym.name === 'IterableIterator' || sym.name === 'Iterable') return { k: 'gen', el: args[0] };
      const d = sym.declarations?.[0];
      if (d === this.errorDecl) return { k: 'obj', decl: d, args: [] };
      if (d && (!this.isLib(d) || this.libModule(d)) && (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d))) return { k: 'obj', decl: d, args };
      if (d && (ts.isObjectLiteralExpression(d) || ts.isTypeLiteralNode(d)) && this.anon.includes(d)) return { k: 'obj', decl: d, args: [] };
      if (d && ts.isTypeLiteralNode(d)) {
        if (this.unionOf.has(d)) return { k: 'obj', decl: d, args: [] };
        if (ts.isTypeAliasDeclaration(d.parent)) return { k: 'obj', decl: d.parent, args: [] };
      }
      if (type.aliasSymbol) {
        const ad = type.aliasSymbol.declarations?.[0];
        if (ad && ts.isTypeAliasDeclaration(ad) && ts.isTypeLiteralNode(ad.type)) return { k: 'obj', decl: ad, args: [] };
      }
    }
    const sigs = type.getCallSignatures();
    if (sigs.length === 1) {
      const s = sigs[0];
      return { k: 'fn', params: s.getParameters().map(p => this.fromType(this.checker.getTypeOfSymbolAtLocation(p, at), at)), ret: this.fromType(s.getReturnType(), at) };
    }
    if (f & ts.TypeFlags.Object && (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Anonymous)
      this.fail(at, 'Z9004', `anonymous object type '${this.checker.typeToString(type)}' is not supported; declare a named interface or type`);
    return this.fail(at, 'Z9001', `type '${this.checker.typeToString(type)}' is not supported yet`);
  }
  fromTypeSafe(t: ts.Type, at: ts.Node): ZT | undefined {
    try { return this.fromType(t, at); } catch { return undefined; }
  }

  paramType(p: ts.ParameterDeclaration, subst?: Map<string, ZT>): ZT {
    if (p.type) return this.fromTypeNode(p.type, subst);
    const ex = this.executorParam(p);
    if (ex) return ex;
    const ctx = this.callbackParam(p);
    if (ctx) return ctx;
    if (!ts.isIdentifier(p.name)) return this.fromType(this.checker.getTypeAtLocation(p), p);
    return this.fromType(this.checker.getTypeAtLocation(p), p);
  }

  /** `new Promise<T>((resolve, reject) => ...)` parameters. */
  executorParam(p: ts.ParameterDeclaration): ZT | undefined {
    const fn = p.parent;
    if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || !ts.isNewExpression(fn.parent)) return undefined;
    const ne = fn.parent;
    if (!ts.isIdentifier(ne.expression) || ne.expression.text !== 'Promise') return undefined;
    const pt = this.promiseOfNew(ne);
    const idx = fn.parameters.indexOf(p);
    if (idx === 0) return { k: 'fn', params: pt.el.k === 'void' ? [] : [pt.el], ret: VOID };
    return { k: 'fn', params: [{ k: 'obj', decl: this.errorDecl, args: [] }], ret: VOID };
  }
  promiseOfNew(ne: ts.NewExpression): Extract<ZT, { k: 'promise' }> {
    if (ne.typeArguments?.length) return { k: 'promise', el: this.fromTypeNode(ne.typeArguments[0]) };
    const ctx = this.contextual(ne);
    if (ctx?.k === 'promise') return ctx;
    const t = this.fromType(this.checker.getTypeAtLocation(ne), ne);
    return t.k === 'promise' ? t : { k: 'promise', el: VOID };
  }

  /** Callback parameter types for builtin methods keep machine element types (a.map(x => ...) on i32[]). */
  private callbackParam(p: ts.ParameterDeclaration): ZT | undefined {
    const fn = p.parent;
    if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || !ts.isCallExpression(fn.parent)) return undefined;
    const call = fn.parent;
    if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
    const argIdx = call.arguments.indexOf(fn);
    const recv = this.tryZ(call.expression.expression);
    const idx = fn.parameters.indexOf(p);
    const m = call.expression.name.text;
    if (recv.k === 'arr') {
      if (m === 'reduce' || m === 'reduceRight') return idx === 0 ? this.reduceAcc(call) : idx === 1 ? recv.el : I32;
      if (m === 'sort') return recv.el;
      if (argIdx === 0) return idx === 0 ? recv.el : I32;
    }
    if (recv.k === 'map' && m === 'forEach') return idx === 0 ? recv.val : recv.key;
    if (recv.k === 'set' && m === 'forEach') return recv.el;
    if (recv.k === 'promise' && m === 'then') return recv.el;
    return undefined;
  }

  // ---------- declared types ----------
  declType(d: ts.Node, subst?: Map<string, ZT>): ZT {
    if (ts.isVariableDeclaration(d)) {
      if (ts.isCatchClause(d.parent)) return { k: 'obj', decl: this.errorDecl, args: [] };
      if (d.type) return this.fromTypeNode(d.type, subst);
      const sym = ts.isIdentifier(d.name) ? this.symbolOf(d.name) : undefined;
      if (sym && this.loopI32.has(sym)) return I32;
      if (ts.isVariableDeclarationList(d.parent) && ts.isForOfStatement(d.parent.parent)) return this.forOfElem(d.parent.parent);
      const isConst = ts.isVariableDeclarationList(d.parent) && !!(d.parent.flags & (ts.NodeFlags.Const | ts.NodeFlags.Using));
      if (d.initializer) {
        const t = this.ztypeOf(d.initializer);
        if (t.k === 'null') return this.fromType(this.checker.getTypeAtLocation(d), d);
        // mutable locals widen to `number` unless proven integral (LNG-04)
        if (!isConst && isNum(t) && t.m !== this.numberKind && !(ts.isIdentifier(d.name) && this.hasIntAnnotationSource(d.initializer))) return { k: 'num', m: this.numberKind };
        return t;
      }
      return this.fromType(this.checker.getTypeAtLocation(d), d);
    }
    if (ts.isBindingElement(d)) return this.bindingType(d);
    if (ts.isPropertyAssignment(d)) { const t = this.ztypeOf(d.initializer); return isNum(t) && this.isIntLiteral(d.initializer) ? { k: 'num', m: this.numberKind } : t.k === 'null' ? this.fromType(this.checker.getTypeAtLocation(d), d) : t; }
    if (ts.isShorthandPropertyAssignment(d)) {  // `{ count }`: the type of the variable it names
      const v = this.checker.getShorthandAssignmentValueSymbol(d)?.valueDeclaration;
      return v ? this.declType(v) : this.fromType(this.checker.getTypeAtLocation(d.name), d);
    }
    if (ts.isParameter(d)) return this.paramType(d, subst);
    if (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d)) {
      if (d.type) return this.fromTypeNode(d.type, subst);
      if (ts.isPropertyDeclaration(d) && d.initializer) {
        const t = this.ztypeOf(d.initializer);
        return isNum(t) ? { k: 'num', m: this.numberKind } : t;
      }
      return this.fromType(this.checker.getTypeAtLocation(d), d);
    }
    if (ts.isSetAccessorDeclaration(d)) return this.paramType(d.parameters[0], subst);
    if (ts.isGetAccessorDeclaration(d)) return d.type ? this.fromTypeNode(d.type, subst) : this.retOf(d);
    if (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d) || ts.isMethodSignature(d)) return this.fnType(d, subst);
    if (ts.isEnumMember(d)) return I32;
    if (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d)) return { k: 'obj', decl: d, args: [] };
    return this.fromType(this.checker.getTypeAtLocation(d), d);
  }
  /** `let x = someI32` keeps i32 only when the value comes from an explicit machine-typed source. */
  private hasIntAnnotationSource(_e: ts.Expression): boolean { return false; }

  /** Type of a destructured name. */
  bindingType(be: ts.BindingElement): ZT {
    const pat = be.parent;
    const src = this.patternSource(pat);
    if (ts.isObjectBindingPattern(pat)) {
      if (src.k !== 'obj') return this.fail(be, 'Z9007', 'object destructuring needs an object type');
      const name = (be.propertyName ?? be.name).getText();
      const m = this.memberDecl(src.decl, name);
      if (!m) return this.fail(be, 'Z9007', `unknown property '${name}'`);
      return this.declType(m, this.substFor(src, m));
    }
    if (src.k === 'arr') return src.el;
    if (src.k === 'tup') return src.els[pat.elements.indexOf(be)];
    if (src.k === 'map') return pat.elements.indexOf(be) === 0 ? src.key : src.val;  // for (const [k, v] of map)
    return this.fail(be, 'Z9007', 'array destructuring needs an array');
  }
  patternSource(pat: ts.BindingPattern): ZT {
    const p = pat.parent;
    if (ts.isBindingElement(p)) return this.bindingType(p);
    if (ts.isParameter(p)) return this.paramType(p);
    if (ts.isVariableDeclaration(p)) {
      if (p.type) return this.fromTypeNode(p.type);
      if (ts.isVariableDeclarationList(p.parent) && ts.isForOfStatement(p.parent.parent)) {
        const t = this.ztypeOf(p.parent.parent.expression);
        return t.k === 'map' ? t : this.forOfElem(p.parent.parent);
      }
      if (p.initializer) return this.ztypeOf(p.initializer);
    }
    return this.fromType(this.checker.getTypeAtLocation(pat), pat);
  }

  fnType(d: ts.SignatureDeclaration, subst?: Map<string, ZT>): ZT {
    return { k: 'fn', params: d.parameters.map(p => this.paramType(p, subst)), ret: this.retOf(d, subst) };
  }
  retOf(d: ts.SignatureDeclaration, subst?: Map<string, ZT>): ZT {
    if (d.type) return this.fromTypeNode(d.type, subst);
    if (this.isAsyncFn(d)) {
      const sig = this.checker.getSignatureFromDeclaration(d);
      return sig ? this.fromType(sig.getReturnType(), d) : { k: 'promise', el: VOID };
    }
    if ((ts.isArrowFunction(d) || ts.isFunctionExpression(d)) && !this.isAsyncFn(d)) {
      const ctx = this.contextual(d) ?? this.elementContext(d);
      if (ctx?.k === 'fn') return ctx.ret;
    }
    if (ts.isArrowFunction(d) && !ts.isBlock(d.body)) {
      const t = this.ztypeOf(d.body);
      const sig = this.checker.getSignatureFromDeclaration(d);
      if (sig && sig.getReturnType().flags & ts.TypeFlags.Void) return VOID;
      return t.k === 'null' ? this.fromType(sig!.getReturnType(), d) : t;
    }
    const sig = this.checker.getSignatureFromDeclaration(d);
    return sig ? this.fromType(sig.getReturnType(), d) : VOID;
  }

  /** Type arguments of a generic call: explicit, or unified from the argument types (C++ cannot deduce through lambdas). */
  inferTypeArgs(d: ts.FunctionDeclaration | ts.MethodDeclaration, e: ts.CallExpression): Map<string, ZT> | undefined {
    const tps = d.typeParameters ?? [];
    const bind = new Map<string, ZT>();
    if (e.typeArguments?.length) { tps.forEach((tp, i) => bind.set(tp.name.text, this.fromTypeNode(e.typeArguments![i]))); return bind; }
    const unify = (p: ZT, a: ZT) => {
      if (p.k === 'tp') {
        const b = bind.get(p.name);
        if (!b && a.k !== 'null' && a.k !== 'tp') bind.set(p.name, a);
        else if (b && isNum(b) && isNum(a) && b.m !== a.m) bind.set(p.name, { k: 'num', m: this.numberKind });  // f(len, 2.5): T is number, as tsc infers
        return;
      }
      if ((p.k === 'arr' || p.k === 'set' || p.k === 'promise' || p.k === 'gen') && a.k === p.k) unify(p.el, (a as typeof p).el);
      else if (p.k === 'map' && a.k === 'map') { unify(p.key, a.key); unify(p.val, a.val); }
      else if (p.k === 'fn' && a.k === 'fn') { p.params.forEach((x, i) => a.params[i] && unify(x, a.params[i])); unify(p.ret, a.ret); }
      else if (p.k === 'tup' && a.k === 'tup') p.els.forEach((x, i) => a.els[i] && unify(x, a.els[i]));
      else if (p.k === 'obj' && a.k === 'obj') p.args.forEach((x, i) => a.args[i] && unify(x, a.args[i]));
    };
    d.parameters.forEach((p, i) => { if (e.arguments[i] && p.type) unify(this.fromTypeNode(p.type), this.tryZ(e.arguments[i])); });
    return tps.every(tp => bind.has(tp.name.text)) ? bind : undefined;
  }

  forOfElem(f: ts.ForOfStatement): ZT {
    const t = this.ztypeOf(f.expression);
    if (t.k === 'arr' || t.k === 'set' || t.k === 'gen') return t.el;
    if (t.k === 'str') return STR;
    if (t.k === 'dyn') return DYN;
    return this.fail(f.expression, 'Z9005', 'for-of is supported on arrays, strings, Map, Set and generators');
  }

  /** Type-parameter substitution for a member accessed through `recv`. */
  substFor(recv: ZT, member: ts.Node): Map<string, ZT> | undefined {
    if (recv.k !== 'obj') return undefined;
    const owner = (ts.isParameter(member) ? member.parent.parent : member.parent) as ts.ClassLikeDeclaration | ts.InterfaceDeclaration;
    let concrete: Extract<ZT, { k: 'obj' }> | undefined = recv;
    while (concrete && concrete.decl !== owner) concrete = this.baseType(concrete);
    if (!concrete) return undefined;
    const tps = owner?.typeParameters;
    if (!tps) return undefined;
    return new Map(tps.map((tp, i) => [tp.name.text, concrete!.args[i]]));
  }

  baseType(recv: Extract<ZT, { k: 'obj' }>): Extract<ZT, { k: 'obj' }> | undefined {
    if (!ts.isClassDeclaration(recv.decl)) return;
    const base = this.baseClass(recv.decl);
    if (!base) return;
    const bindings = new Map((recv.decl.typeParameters ?? []).map((p, i) => [p.name.text, recv.args[i]]));
    const heritage = recv.decl.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
    return { k: 'obj', decl: base, args: (heritage?.typeArguments ?? []).map(t => this.fromTypeNode(t, bindings)) };
  }

  // ---------- expression types ----------
  ztypeOf(e: ts.Expression): ZT {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) return this.ztypeOf(e.expression);
    if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) {
      return ts.isSatisfiesExpression(e) || e.type.getText() === 'const' ? this.ztypeOf(e.expression) : this.fromTypeNode(e.type);
    }
    if (ts.isAwaitExpression(e)) {
      const t = this.ztypeOf(e.expression);
      return t.k === 'promise' ? t.el : t;
    }
    if (ts.isNumericLiteral(e)) return { k: 'num', m: this.numberKind };
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return STR;
    if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return BOOL;
    if (e.kind === ts.SyntaxKind.NullKeyword) return { k: 'null' };
    if (ts.isIdentifier(e) && e.text === 'undefined') return { k: 'null' };
    if (e.kind === ts.SyntaxKind.ThisKeyword) {
      const cls = ts.findAncestor(e, n => ts.isClassDeclaration(n)) as ts.ClassDeclaration | undefined;
      if (cls) return { k: 'obj', decl: cls, args: (cls.typeParameters ?? []).map(tp => ({ k: 'tp', name: tp.name.text }) as ZT) };
    }
    if (ts.isIdentifier(e)) {
      const d = this.declOf(e);
      if (d && ts.isSourceFile(d)) return VOID;  // `import * as m` namespace
      if (d && !this.isLib(d)) {
        if (ts.isFunctionDeclaration(d)) return this.fnType(d);
        const declared = this.declType(d);
        // DYN-08: after typeof/instanceof the checker's narrowed type is static; the read is a checked conversion
        if (declared.k === 'dyn' && !this.isWrite(e)) {
          const n = this.fromTypeSafe(this.checker.getTypeAtLocation(e), e);
          if (n && n.k !== 'dyn' && n.k !== 'null' && n.k !== 'void') return n;
        }
        // narrowing by instanceof/discriminant: use the checker's narrowed class if it differs
        if (declared.k === 'obj') {
          const narrowed = this.fromTypeSafe(this.checker.getTypeAtLocation(e), e);
          if (narrowed?.k === 'obj' && narrowed.decl !== declared.decl && this.inherits(narrowed.decl, declared.decl)) return narrowed;
        }
        return declared;
      }
    }
    if (ts.isPropertyAccessExpression(e)) {
      const recv = this.tryZ(e.expression);
      const name = e.name.text;
      if (recv.k === 'dyn') return DYN;
      if ((recv.k === 'arr' || recv.k === 'str') && name === 'length') return I32;
      if ((recv.k === 'map' || recv.k === 'set') && name === 'size') return I32;
      const d = this.declOf(e.name) ?? (recv.k === 'obj' ? this.memberDecl(recv.decl, name) : undefined);
      if (d && (!this.isLib(d) || this.libModule(d))) {
        if (ts.isEnumMember(d)) return I32;
        const t = this.declType(d, this.substFor(recv, d));
        // `this.props` in `class Item extends Component<ItemProps, S>`: the checker knows the instantiated type
        if (t.k === 'tp' && !ts.findAncestor(e, n => (ts.isClassDeclaration(n) || ts.isFunctionDeclaration(n)) && !!n.typeParameters?.some(tp => tp.name.text === t.name))) return this.fromType(this.checker.getTypeAtLocation(e), e);
        return t;
      }
      // caught errors: e.message / e.name are strings even where `unknown` would be Dyn (gradual profile)
      if (recv.k === 'obj' && recv.decl === this.errorDecl && (name === 'message' || name === 'name' || name === 'stack')) return STR;
      if (d && this.isLib(d) && (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) && d.type && ts.isTypeReferenceNode(d.type) && MACHINE.has(d.type.typeName.getText()))
        return this.fromTypeNode(d.type);
    }
    if (ts.isElementAccessExpression(e)) {
      const recv = this.ztypeOf(e.expression);
      if (recv.k === 'dyn') return DYN;
      if (recv.k === 'arr') return recv.el;
      if (recv.k === 'str') return STR;
      if (recv.k === 'tup' && ts.isNumericLiteral(e.argumentExpression)) return recv.els[Number(e.argumentExpression.text)];
    }
    if (ts.isCallExpression(e)) {
      const c = e.expression;
      if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === 'Promise' && e.arguments.length) {
        const a = this.ztypeOf(e.arguments[0]);
        if (c.name.text === 'resolve') return a.k === 'promise' ? a : { k: 'promise', el: a };
        if (c.name.text === 'all' && a.k === 'arr' && a.el.k === 'promise') return { k: 'promise', el: { k: 'arr', el: a.el.el } };
      }
      if (ts.isPropertyAccessExpression(c)) {
        const recv = this.tryZ(c.expression);
        if (c.name.text === 'bind' && recv.k === 'fn') {
          const method = ts.isPropertyAccessExpression(c.expression) ? this.declOf(c.expression.name) : undefined;
          if (method && (ts.isMethodDeclaration(method) || ts.isMethodSignature(method)) && !(ts.getCombinedModifierFlags(method) & ts.ModifierFlags.Static)) {
            const receiver = e.arguments[0] && this.tryZ(e.arguments[0]);
            if (!receiver || receiver.k !== 'obj' || !this.inherits(receiver.decl, method.parent as ts.ClassDeclaration | ts.InterfaceDeclaration)) this.fail(e, 'Z9050', 'bound method receiver must implement its declaring class or interface');
          }
          return { ...recv, params: recv.params.slice(Math.max(0, e.arguments.length - 1)) };
        }
        const lib = this.libMemberType(recv, c.name.text, e);
        if (lib) return lib;
        const d = this.declOf(c.name);
        if (d && ts.isFunctionDeclaration(d) && (this.libModule(d) || (!this.isLib(d) && !d.typeParameters))) return this.retOf(d);
        if (d && (!this.isLib(d) || this.libModule(d)) && (ts.isMethodDeclaration(d) || ts.isMethodSignature(d)) && !d.typeParameters)
          return this.retOf(d, this.substFor(recv, d));
        if (d && !this.isLib(d) && (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d))) {
          const ft = this.declType(d, this.substFor(recv, d));
          if (ft.k === 'fn') return ft.ret;
        }
        if (d && this.isLib(d) && (ts.isMethodSignature(d) || ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d)) && d.type && ts.isTypeReferenceNode(d.type) && MACHINE.has(d.type.typeName.getText()))
          return this.fromTypeNode(d.type);
      } else {
        const d = this.declOf(c);
        if (d && ts.isFunctionDeclaration(d) && d.typeParameters && !this.isLib(d)) {
          const bind = this.inferTypeArgs(d, e);
          if (bind) return this.retOf(d, bind);
        }
        if (d && ts.isFunctionDeclaration(d) && !d.typeParameters && (!this.isLib(d) || this.libModule(d) || (d.type && ts.isTypeReferenceNode(d.type) && MACHINE.has(d.type.typeName.getText()))))
          return this.retOf(d);
        const ft = !d || !this.isLib(d) ? this.tryZ(c) : VOID;
        if (ft.k === 'fn' && !(d && ts.isFunctionDeclaration(d))) return ft.ret;
      }
    }
    if (ts.isNewExpression(e)) {
      // new Map<string, i32>() keeps its machine types (the checker only sees number)
      if (ts.isIdentifier(e.expression) && e.typeArguments?.length && this.isLib(this.declOf(e.expression) ?? e)) {
        const a = e.typeArguments.map(x => this.fromTypeNode(x));
        if (e.expression.text === 'Map' && a.length === 2) return { k: 'map', key: a[0], val: a[1] };
        if (e.expression.text === 'Set' && a.length === 1) return { k: 'set', el: a[0] };
        if (e.expression.text === 'Array' && a.length === 1) return { k: 'arr', el: a[0] };
      }
      const d = this.declOf(e.expression);
      if (d && ts.isClassDeclaration(d) && (!this.isLib(d) || this.libModule(d))) return e.typeArguments?.length
        ? { k: 'obj', decl: d, args: e.typeArguments.map(t => this.fromTypeNode(t)) }
        : this.fromType(this.checker.getTypeAtLocation(e), e);
      if (ts.isIdentifier(e.expression) && ERROR_CLASSES.has(e.expression.text)) return { k: 'obj', decl: this.errorDecl, args: [] };
      if (ts.isIdentifier(e.expression) && e.expression.text === 'Promise') return this.promiseOfNew(e);
    }
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return this.fnType(e);
    if (ts.isPrefixUnaryExpression(e)) {
      if (e.operator === ts.SyntaxKind.ExclamationToken) return BOOL;
      if (e.operator === ts.SyntaxKind.TildeToken) return I32;
      const t = this.ztypeOf(e.operand);
      // unary + / - is ToNumber: on a Dyn, a string or a boolean it gives a number
      return (t.k === 'dyn' || t.k === 'str' || t.k === 'bool') && (e.operator === ts.SyntaxKind.MinusToken || e.operator === ts.SyntaxKind.PlusToken) ? { k: 'num', m: this.numberKind } : t;
    }
    if (ts.isPostfixUnaryExpression(e)) return this.ztypeOf(e.operand);
    if (ts.isBinaryExpression(e)) return this.binaryType(e);
    if (ts.isConditionalExpression(e)) {
      const a = this.ztypeOf(e.whenTrue), b = this.ztypeOf(e.whenFalse);
      if (a.k === 'dyn' || b.k === 'dyn') return DYN;
      if (isNum(a) && isNum(b)) {
        if (a.m === b.m) return a;
        // an integer literal branch takes the other branch's integer type (`c ? RED : -1` stays i32)
        if (isInt(a.m) && this.isIntLiteral(e.whenFalse)) return a;
        if (isInt(b.m) && this.isIntLiteral(e.whenTrue)) return b;
        return { k: 'num', m: this.numberKind };
      }
      return a.k === 'null' ? b : this.commonObj(a, b);
    }
    if (ts.isObjectLiteralExpression(e)) {
      // Dyn only from a declared context (`x: any`), not from the checker (console.log's `unknown` parameter)
      const own = this.contextual(e);
      if (own?.k === 'dyn') return DYN;
      const ctx = own ?? this.fromTypeSafe(this.checker.getContextualType(e) ?? this.checker.getTypeAtLocation(e), e);
      if (ctx?.k === 'obj') {
        if (ts.isTypeAliasDeclaration(ctx.decl) && this.unionMembers.has(ctx.decl)) return { k: 'obj', decl: this.unionMemberFor(ctx.decl, e), args: [] };
        return ctx;
      }
    }
    if (ts.isArrayLiteralExpression(e)) {
      const ctx = this.contextual(e);
      if (ctx?.k === 'arr' || ctx?.k === 'tup' || ctx?.k === 'dyn') return ctx;
      const cct = this.checker.getContextualType(e);
      if (cct && this.checker.isTupleType(cct)) { const z = this.fromTypeSafe(cct, e); if (z?.k === 'tup' && !z.els.some(x => x.k === 'dyn')) return z; }
      // no annotation: all elements share one Zinc type (keeps i32/Promise<i32> precision, avoids tuples)
      const els = e.elements.map(x => ts.isSpreadElement(x) ? this.ztypeOf(x.expression) : this.ztypeOf(x)).map((t, i) => ts.isSpreadElement(e.elements[i]) && t.k === 'arr' ? t.el : t);
      if (els.length && els.every(t => zeq(t, els[0])) && els[0].k !== 'null') return { k: 'arr', el: isNum(els[0]) && !e.elements.every(x => !ts.isSpreadElement(x) && this.isIntLiteral(x)) ? els[0] : els[0] };
    }
    return this.fromType(this.checker.getTypeAtLocation(e), e);
  }

  /** Receiver type, or `void` for library globals such as Math and console. */
  tryZ(e: ts.Expression): ZT {
    try { return this.ztypeOf(e); } catch (err) { if (err instanceof ZincError) return VOID; throw err; }
  }

  /** Expected type from the syntactic context (declaration annotation, return type, parameter). */
  /** A closure stored in a typed array (`[() => ...]`, `fns.push(() => ...)`) takes the element type. */
  elementContext(e: ts.Expression): ZT | undefined {
    const p = e.parent;
    let at: ZT | undefined;
    if (ts.isArrayLiteralExpression(p)) at = this.contextual(p);
    else if (ts.isCallExpression(p) && p.arguments.includes(e) && ts.isPropertyAccessExpression(p.expression) && ['push', 'unshift'].includes(p.expression.name.text))
      at = this.tryZ(p.expression.expression);
    return at?.k === 'arr' ? at.el : undefined;
  }
  contextual(e: ts.Expression): ZT | undefined {
    const p = e.parent;
    if (ts.isVariableDeclaration(p) && p.type) return this.fromTypeNode(p.type);
    if (ts.isPropertyDeclaration(p) && p.type) return this.fromTypeNode(p.type);
    if (ts.isReturnStatement(p)) {
      const fn = this.fnOf(p) as ts.SignatureDeclaration | undefined;
      if (fn?.type) {
        const r = this.fromTypeNode(fn.type);
        return r.k === 'promise' && this.isAsyncFn(fn) ? r.el : r;
      }
    }
    if (ts.isBinaryExpression(p) && p.right === e && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return this.ztypeOf(p.left);
    if (ts.isParenthesizedExpression(p)) return this.contextual(p);
    if (ts.isArrayLiteralExpression(p)) {
      const at = this.contextual(p);  // not ztypeOf(p): that one types the elements
      if (at && (at.k === 'dyn' || (at.k === 'arr' && at.el.k === 'dyn'))) return DYN;
    }
    if (ts.isPropertyAssignment(p) && p.initializer === e && ts.isObjectLiteralExpression(p.parent)) {
      const ot = this.tryZ(p.parent);
      if (ot.k === 'dyn') return DYN;
      const m = ot.k === 'obj' ? this.memberDecl(ot.decl, p.name.getText()) : undefined;
      if (m && m !== p) return this.declType(m);  // an untyped literal's own member: its type comes from e itself
    }
    if (ts.isCallExpression(p) && p.arguments.includes(e)) {
      const d = ts.isPropertyAccessExpression(p.expression) ? this.declOf(p.expression.name) : this.declOf(p.expression);
      if (d && !this.isLib(d) && (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d) || ts.isMethodSignature(d))) {
        const prm = d.parameters[p.arguments.indexOf(e)];
        if (prm?.type) {
          const t = this.fromTypeNode(prm.type);
          const generic = !!d.typeParameters?.length || !!(d.parent as ts.ClassDeclaration).typeParameters?.length;
          if (!generic || !hasTypeParam(t)) return t;
          if (t.k === 'fn' && !hasTypeParam(t.ret)) return { k: 'fn', params: [], ret: t.ret };  // only the result type is known
        }
      }
    }
    // `new Blob(['a', blob])`: a constructor parameter typed `unknown[]` makes the literal a Dyn array
    if (ts.isNewExpression(p) && p.arguments?.includes(e)) {
      let c = this.declOf(p.expression) as ts.ClassDeclaration | undefined;
      let ctor: ts.ConstructorDeclaration | undefined;
      while (c && ts.isClassDeclaration(c) && !this.isLib(c) && !(ctor = c.members.find(ts.isConstructorDeclaration))) c = this.baseClass(c);
      const prm = ctor?.parameters[p.arguments.indexOf(e)];
      if (prm?.type && !(c as ts.ClassDeclaration).typeParameters?.length) {
        const t = this.fromTypeNode(prm.type);
        if (t.k === 'dyn' || (t.k === 'arr' && t.el.k === 'dyn')) return t;
      }
    }
    return undefined;
  }

  binaryType(e: ts.BinaryExpression): ZT {
    const K = ts.SyntaxKind, op = e.operatorToken.kind;
    if ([K.LessThanToken, K.GreaterThanToken, K.LessThanEqualsToken, K.GreaterThanEqualsToken, K.EqualsEqualsToken,
      K.EqualsEqualsEqualsToken, K.ExclamationEqualsToken, K.ExclamationEqualsEqualsToken, K.InstanceOfKeyword, K.InKeyword].includes(op)) return BOOL;
    if (op >= K.FirstAssignment && op <= K.LastAssignment) return this.ztypeOf(e.left);
    if (op === K.CommaToken) return this.ztypeOf(e.right);
    if (op === K.AmpersandAmpersandToken || op === K.BarBarToken || op === K.QuestionQuestionToken) {
      const l = this.ztypeOf(e.left), r = this.ztypeOf(e.right);
      if (l.k === 'dyn' || r.k === 'dyn') return DYN;
      if (l.k === 'null') return r;
      if (isNum(l) && isNum(r) && l.m !== r.m) {
        if (isInt(l.m) && this.isIntLiteral(e.right)) return l;  // `count ?? 0` stays i32
        if (isInt(r.m) && this.isIntLiteral(e.left)) return r;
        return { k: 'num', m: this.numberKind };
      }
      return this.commonObj(l, r);
    }
    const l = this.ztypeOf(e.left), r = this.ztypeOf(e.right);
    if (op === K.PlusToken && (l.k === 'str' || r.k === 'str')) return STR;
    if (op === K.PlusToken && (l.k === 'dyn' || r.k === 'dyn')) return DYN;
    const m = this.arith(op, e.left, l, e.right, r);
    return { k: 'num', m };
  }

  /** Numeric result kind of an arithmetic/bitwise operator (LNG-05). */
  arith(op: ts.SyntaxKind, le: ts.Expression, l: ZT, re: ts.Expression, r: ZT): NumKind {
    const K = ts.SyntaxKind;
    if ([K.AmpersandToken, K.BarToken, K.CaretToken, K.LessThanLessThanToken, K.GreaterThanGreaterThanToken].includes(op)) return 'i32';
    if (op === K.GreaterThanGreaterThanGreaterThanToken) return 'u32';
    const lm = isNum(l) ? l.m : this.numberKind, rm = isNum(r) ? r.m : this.numberKind;
    const llit = this.isIntLiteral(le), rlit = this.isIntLiteral(re);
    const a = llit && isInt(rm) ? rm : llit && isFx(rm) ? rm : lm, b = rlit && isInt(lm) ? lm : rlit && isFx(lm) ? lm : rm;
    const floaty = (x: NumKind): NumKind | undefined => (x === 'f64' || x === 'f32' || isFx(x)) ? x : undefined;
    if (op === K.SlashToken || op === K.AsteriskAsteriskToken) {
      if (a === 'f64' || b === 'f64') return 'f64';
      if (a === 'f32' || b === 'f32') return 'f32';
      if (isFx(a)) return a;
      if (isFx(b)) return b;
      return floaty(this.numberKind) ?? 'f64';
    }
    if (a === 'f64' || b === 'f64') return 'f64';
    if (a === 'f32' || b === 'f32') return 'f32';
    if (isFx(a) || isFx(b)) return isFx(a) ? a : b;
    const wide = (m: NumKind): NumKind => (m === 'i8' || m === 'i16' || m === 'u8' || m === 'u16') ? 'i32' : m === 'isize' ? 'i64' : m === 'usize' ? 'u64' : m;
    const x = wide(a), y = wide(b);
    if (x === y) return x;
    if (x === 'i64' || y === 'i64') return 'i64';
    return floaty(this.numberKind) ?? 'f64';  // mixed signedness: exact in the number type, like JS
  }

  /** Result types of builtin members that carry element/machine types. */
  libMemberType(recv: ZT, name: string, call: ts.CallExpression): ZT | undefined {
    if (recv.k === 'arr') {
      switch (name) {
        case 'pop': case 'shift': case 'at': case 'find': case 'findLast': return recv.el;
        case 'slice': case 'splice': case 'filter': case 'sort': case 'reverse': case 'concat': case 'fill': return recv;
        case 'map': {
          const cb = this.ztypeOf(call.arguments[0]);
          return { k: 'arr', el: cb.k === 'fn' ? cb.ret : F64 };
        }
        case 'reduce': case 'reduceRight': return this.reduceAcc(call) ?? this.ztypeOf(call.arguments[1]);
        case 'push': case 'unshift': case 'indexOf': case 'lastIndexOf': case 'findIndex': case 'findLastIndex': return I32;
      }
    }
    if (recv.k === 'map') {
      if (name === 'get') return recv.val;
      if (name === 'set') return recv;
      if (name === 'keys') return { k: 'arr', el: recv.key };
      if (name === 'values') return { k: 'arr', el: recv.val };
    }
    if (recv.k === 'set') {
      if (name === 'add') return recv;
      if (name === 'values') return { k: 'arr', el: recv.el };
    }
    if (recv.k === 'promise') {
      if (name === 'catch' || name === 'finally') return recv;
      if (name === 'then') {
        const callback = this.ztypeOf(call.arguments[0]);
        const value = callback.k === 'fn' ? callback.ret : VOID;
        return value.k === 'promise' ? value : { k: 'promise', el: value };
      }
    }
    return undefined;
  }

  // ---------- DYN-07: how a Dyn value is checked into a static type (shared by both emitters) ----------
  dynShape(t: ZT, at: ts.Node): DynShape {
    switch (t.k) {
      case 'dyn': return { k: 'd' };
      case 'num': return { k: 'n' };
      case 'str': return { k: 's' };
      case 'bool': return { k: 'b' };
      case 'arr': return { k: 'a', el: this.dynShape(t.el, at) };
      case 'obj': {
        const d = t.decl, name = (d as ts.NamedDeclaration).name?.getText() ?? 'object';
        if (ts.isClassDeclaration(d) && !this.isLib(d)) return { k: 'c', name, decl: d };
        if (d === this.errorDecl) return { k: 'c', name: 'Error', decl: d };
        if (t.args.length || this.isLib(d) || this.unionMembers.has(d as ts.TypeAliasDeclaration) || this.unionOf.has(d) || ts.isObjectLiteralExpression(d))
          return this.fail(at, 'Z9041', `a Dyn value cannot be converted to '${name}'; convert it field by field`);
        if (this.members(d).some(m => ts.isMethodSignature(m)) || (ts.isInterfaceDeclaration(d) && d.heritageClauses?.length))
          return this.fail(at, 'Z9041', `a Dyn value cannot be converted to interface '${name}' (it has methods or bases)`);
        const fields = this.fieldNames(d).map(f => {
          const m = this.memberDecl(d, f)!;
          return { name: f, shape: this.dynShape(this.declType(m), at), opt: !!(m as ts.PropertySignature).questionToken };
        });
        return { k: 'o', name, decl: d, fields };
      }
    }
    return this.fail(at, 'Z9041', `a Dyn value cannot be converted to this type (${t.k}); only primitives, arrays, classes and plain interfaces`);
  }

  // ---------- DYN-10: every place where a Dyn value is declared or operated on ----------
  private sites?: DynSite[];
  dynSites(): DynSite[] {
    if (this.sites) return this.sites;
    const out: DynSite[] = [];
    if (!this.usesDyn) return this.sites = out;
    const isDyn = (e: ts.Node | undefined) => !!e && this.tryZ(e as ts.Expression).k === 'dyn';
    const add = (n: ts.Node, kind: DynSite['kind']) => {
      const d = this.diag(n, '', '');
      out.push({ file: d.file, line: d.line, col: d.col, kind, text: n.getText().replace(/\s+/g, ' ').slice(0, 60) });
    };
    const K = ts.SyntaxKind;
    const visit = (n: ts.Node) => {
      try {
        if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isPropertyDeclaration(n) || ts.isPropertySignature(n)) && !ts.isCatchClause(n.parent) && ts.isIdentifier(n.name)) {
          if (this.declType(n).k === 'dyn') add(n.name, 'decl');
          else if (ts.isVariableDeclaration(n) && n.initializer && isDyn(n.initializer)) add(n.initializer, 'conv');
        } else if (ts.isPropertyAccessExpression(n) && isDyn(n.expression)) add(n, this.isWrite(n) || (ts.isBinaryExpression(n.parent) && n.parent.left === n && n.parent.operatorToken.kind === K.EqualsToken) ? 'set' : 'get');
        else if (ts.isElementAccessExpression(n) && isDyn(n.expression)) add(n, 'index');
        else if (ts.isCallExpression(n) && n.expression.getText() === 'JSON.parse') add(n, 'json');
        else if (ts.isTypeOfExpression(n) && isDyn(n.expression)) add(n, 'typeof');
        else if (ts.isForOfStatement(n) && isDyn(n.expression)) add(n.expression, 'iter');
        else if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && n.type.getText() !== 'const' && isDyn(n.expression) && this.fromTypeNode(n.type).k !== 'dyn') add(n, 'cast');
        else if (ts.isBinaryExpression(n) && n.operatorToken.kind !== K.CommaToken && !(n.operatorToken.kind >= K.FirstAssignment && n.operatorToken.kind <= K.LastAssignment) && (isDyn(n.left) || isDyn(n.right))) add(n, 'op');
        else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && isDyn(n.operand) && n.operator !== K.ExclamationToken) add(n, 'op');
        else if (ts.isIdentifier(n) && (n.parent as ts.NamedDeclaration).name !== n && !this.isWrite(n)) {
          const d = this.declOf(n);
          if (d && !this.isLib(d) && (ts.isVariableDeclaration(d) || ts.isParameter(d)) && this.declType(d).k === 'dyn' && this.ztypeOf(n).k !== 'dyn') add(n, 'narrow');
        } else if (ts.isExpression(n) && !ts.isIdentifier(n) && isDyn(n)) {
          const want = this.contextual(n);
          if (want && want.k !== 'dyn') add(n, 'conv');
        }
        if (ts.isIdentifier(n) && (n.parent as ts.NamedDeclaration).name !== n && isDyn(n)) { const want = this.contextual(n); if (want && want.k !== 'dyn') add(n, 'conv'); }
      } catch (e) { if (!(e instanceof ZincError)) throw e; }
      ts.forEachChild(n, visit);
    };
    for (const sf of this.fe.sources) if (!sf.fileName.startsWith(path.join(ZINC_ROOT, 'lib') + path.sep)) visit(sf);
    return this.sites = out;
  }
}

export type DynShape =
  | { k: 'd' | 'n' | 's' | 'b' }
  | { k: 'a'; el: DynShape }
  | { k: 'c'; name: string; decl: ts.Node }
  | { k: 'o'; name: string; decl: ts.Node; fields: { name: string; shape: DynShape; opt: boolean }[] };
export interface DynSite { file: string; line: number; col: number; kind: 'decl' | 'get' | 'set' | 'index' | 'json' | 'typeof' | 'iter' | 'cast' | 'op' | 'narrow' | 'conv'; text: string }
