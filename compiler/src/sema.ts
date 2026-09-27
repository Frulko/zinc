// Sema: Zinc types (ZT) on top of the TypeScript checker.
// Machine types are read syntactically from annotations: the checker erases `type i32 = number` (spec §7 pitfall).
import * as path from 'node:path';
import { ts, type Diag, type Frontend } from './frontend.ts';

export type NumKind = 'f64' | 'f32' | 'i8' | 'i16' | 'i32' | 'i64' | 'u8' | 'u16' | 'u32' | 'u64' | 'isize' | 'usize';
export type ZT =
  | { k: 'num'; m: NumKind }
  | { k: 'bool' } | { k: 'str' } | { k: 'void' } | { k: 'null' }
  | { k: 'arr'; el: ZT }
  | { k: 'map'; key: ZT; val: ZT }
  | { k: 'set'; el: ZT }
  | { k: 'obj'; decl: ts.Declaration; args: ZT[] }
  | { k: 'fn'; params: ZT[]; ret: ZT }
  | { k: 'tp'; name: string };

export const MACHINE: ReadonlySet<string> = new Set(['i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'isize', 'usize']);
export const F64: ZT = { k: 'num', m: 'f64' };
export const I32: ZT = { k: 'num', m: 'i32' };
export const BOOL: ZT = { k: 'bool' };
export const STR: ZT = { k: 'str' };
export const VOID: ZT = { k: 'void' };

export const isInt = (m: NumKind) => m !== 'f64' && m !== 'f32';
export const isNum = (t: ZT): t is { k: 'num'; m: NumKind } => t.k === 'num';

export class ZincError extends Error {
  diag: Diag;
  constructor(diag: Diag) { super(diag.message); this.diag = diag; }
}

export class Sema {
  checker: ts.TypeChecker;
  /** `number` representation for the active profile (LNG-03). */
  numberKind: NumKind = 'f64';
  typing: 'strict' | 'gradual' = 'gradual';
  boxed = new Set<ts.Symbol>();
  loopI32 = new Set<ts.Symbol>();
  classIds = new Map<ts.Declaration, number>();
  /** Declarations whose methods are overridden somewhere (need virtual dispatch, LNG-08). */
  hierarchy = new Set<ts.Declaration>();
  diags: Diag[] = [];

  fe: Frontend;
  root: string;

  constructor(fe: Frontend, root: string) {
    this.fe = fe;
    this.root = root;
    this.checker = fe.checker;
    this.analyze();
  }

  // ---------- diagnostics (CMP-05, CMP-14) ----------
  diag(node: ts.Node, code: string, message: string, severity: 'error' | 'warning' = 'error'): Diag {
    const sf = node.getSourceFile();
    const lc = sf.getLineAndCharacterOfPosition(node.getStart());
    return { file: path.relative(process.cwd(), sf.fileName), line: lc.line + 1, col: lc.character + 1, code, severity, message };
  }
  fail(node: ts.Node, code: string, message: string): never { throw new ZincError(this.diag(node, code, message)); }

  // ---------- whole-program pre-pass ----------
  private analyze() {
    const captured = new Set<ts.Symbol>();
    const written = new Set<ts.Symbol>();
    let cid = 1;
    const visit = (n: ts.Node) => {
      this.forbid(n);
      if (ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n)) {
        this.classIds.set(n, cid++);
        if (ts.isClassDeclaration(n)) {
          const base = this.baseClass(n);
          if (base) { this.hierarchy.add(n); this.hierarchy.add(base); for (let b = this.baseClass(base); b; b = this.baseClass(b)) this.hierarchy.add(b); }
        }
      }
      if (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type)) this.classIds.set(n, cid++);
      if (ts.isIdentifier(n)) {
        const sym = this.symbolOf(n);
        const decl = sym?.valueDeclaration;
        if (sym && decl && (ts.isVariableDeclaration(decl) || ts.isParameter(decl)) && !this.isModuleLevel(decl)) {
          if (this.fnOf(n) !== this.fnOf(decl)) captured.add(sym);
          if (this.isWrite(n)) written.add(sym);
        }
      }
      if (ts.isForStatement(n)) this.loopCounter(n);
      ts.forEachChild(n, visit);
    };
    for (const sf of this.fe.sources) visit(sf);
    for (const s of captured) if (written.has(s)) this.boxed.add(s);
  }

  /** Forbidden constructs (CMP-05, section 7). */
  private forbid(n: ts.Node) {
    const Z = (code: string, msg: string): never => this.fail(n, code, msg);
    if (ts.isVariableDeclarationList(n) && !(n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using)))
      Z('Z1001', "'var' is not supported; use 'let' or 'const'");
    if (ts.isIdentifier(n) && n.text === 'arguments' && !ts.isPropertyAccessExpression(n.parent)) Z('Z1002', "'arguments' is not supported; use rest-free explicit parameters");
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
  }

  /** LNG-04 (cheap form): `for (let i = <int>; i <op> <int expr>; i++|i--|i+=<int>)` with no other writes → i32. */
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
    const bound = this.ztypeOf(c.right);
    if (!(this.isIntLiteral(c.right) || (isNum(bound) && (bound.m === 'i32' || bound.m === 'i16' || bound.m === 'i8' || bound.m === 'u8' || bound.m === 'u16')))) return;
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
  isModuleLevel(d: ts.Node): boolean {
    let p = d.parent;
    while (p && (ts.isVariableDeclarationList(p) || ts.isVariableStatement(p))) p = p.parent;
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
  implemented(c: ts.ClassLikeDeclaration): ts.Declaration[] {
    const h = c.heritageClauses?.find(h => h.token === ts.SyntaxKind.ImplementsKeyword);
    return (h?.types ?? []).map(t => this.declOf(t.expression)).filter((d): d is ts.Declaration => !!d);
  }
  inherits(c: ts.Declaration, target: ts.Declaration): boolean {
    if (c === target) return true;
    if (!ts.isClassDeclaration(c)) return false;
    const b = this.baseClass(c);
    if (b && this.inherits(b, target)) return true;
    return this.implemented(c).some(i => this.inherits(i, target));
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
    if (ts.isUnionTypeNode(t)) {
      const rest = t.types.filter(x => !(x.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword)));
      if (rest.length === 1) return this.fromTypeNode(rest[0], subst);
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
      const d = this.declOf(t.typeName);
      if (d) {
        if (ts.isTypeParameterDeclaration(d)) return { k: 'tp', name };
        if (ts.isEnumDeclaration(d)) return I32;
        if (ts.isTypeAliasDeclaration(d)) {
          if (ts.isTypeLiteralNode(d.type)) return { k: 'obj', decl: d, args };
          if (!this.isLib(d)) return this.fromTypeNode(d.type, subst);
        }
        if (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d)) {
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
    if (f & ts.TypeFlags.TypeParameter) return { k: 'tp', name: type.symbol?.name ?? 'T' };
    if (type.isUnion()) {
      const rest = type.types.filter(t => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.BooleanLike)) return BOOL;
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.EnumLike)) return I32;
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.NumberLike)) return { k: 'num', m: this.numberKind };
      if (rest.length && rest.every(t => t.flags & ts.TypeFlags.StringLike)) return STR;
      if (rest.length === 1) return this.fromType(rest[0], at);
      this.fail(at, 'Z9001', `union type '${this.checker.typeToString(type)}' is not supported yet (only T | null)`);
    }
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) this.fail(at, 'Z1006', "'any'/'unknown' need the Dyn type, not implemented in the prototype (DYN-02)");
    const sym = type.getSymbol() ?? type.aliasSymbol;
    const args = (this.checker.getTypeArguments?.(type as ts.TypeReference) ?? []).map(a => this.fromType(a, at));
    if (sym) {
      if (sym.name === 'Array' || sym.name === 'ReadonlyArray') return { k: 'arr', el: args[0] ?? F64 };
      if (sym.name === 'Map') return { k: 'map', key: args[0], val: args[1] };
      if (sym.name === 'Set') return { k: 'set', el: args[0] };
      const d = sym.declarations?.[0];
      if (d && !this.isLib(d) && (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d))) return { k: 'obj', decl: d, args };
      if (d && ts.isTypeLiteralNode(d) && ts.isTypeAliasDeclaration(d.parent)) return { k: 'obj', decl: d.parent, args: [] };
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

  paramType(p: ts.ParameterDeclaration, subst?: Map<string, ZT>): ZT {
    if (p.type) return this.fromTypeNode(p.type, subst);
    const ctx = this.callbackParam(p);
    if (ctx) return ctx;
    return this.fromType(this.checker.getTypeAtLocation(p), p);
  }

  /** Callback parameter types for builtin methods keep machine element types (a.map(x => ...) on i32[]). */
  private callbackParam(p: ts.ParameterDeclaration): ZT | undefined {
    const fn = p.parent;
    if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || !ts.isCallExpression(fn.parent)) return undefined;
    const call = fn.parent;
    if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
    const argIdx = call.arguments.indexOf(fn);
    const recv = this.ztypeOf(call.expression.expression);
    const idx = fn.parameters.indexOf(p);
    const m = call.expression.name.text;
    if (recv.k === 'arr') {
      if (m === 'reduce') return idx === 0 ? (call.arguments[1] ? this.ztypeOf(call.arguments[1]) : undefined) : idx === 1 ? recv.el : I32;
      if (m === 'sort') return recv.el;
      if (argIdx === 0) return idx === 0 ? recv.el : I32;
    }
    if (recv.k === 'map' && m === 'forEach') return idx === 0 ? recv.val : recv.key;
    if (recv.k === 'set' && m === 'forEach') return recv.el;
    return undefined;
  }

  // ---------- declared types ----------
  declType(d: ts.Declaration, subst?: Map<string, ZT>): ZT {
    if (ts.isVariableDeclaration(d)) {
      if (d.type) return this.fromTypeNode(d.type, subst);
      const sym = ts.isIdentifier(d.name) ? this.symbolOf(d.name) : undefined;
      if (sym && this.loopI32.has(sym)) return I32;
      if (ts.isVariableDeclarationList(d.parent) && ts.isForOfStatement(d.parent.parent)) return this.forOfElem(d.parent.parent);
      const isConst = ts.isVariableDeclarationList(d.parent) && !!(d.parent.flags & ts.NodeFlags.Const);
      if (d.initializer) {
        const t = this.ztypeOf(d.initializer);
        if (t.k === 'null') return this.fromType(this.checker.getTypeAtLocation(d), d);
        // mutable locals widen to `number` unless proven integral (LNG-04)
        if (!isConst && isNum(t)) return { k: 'num', m: this.numberKind };
        return t;
      }
      return this.fromType(this.checker.getTypeAtLocation(d), d);
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
    if (ts.isGetAccessorDeclaration(d)) return d.type ? this.fromTypeNode(d.type, subst) : this.retOf(d);
    if (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d) || ts.isMethodSignature(d)) return this.fnType(d, subst);
    if (ts.isEnumMember(d)) return I32;
    if (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d)) return { k: 'obj', decl: d, args: [] };
    return this.fromType(this.checker.getTypeAtLocation(d), d);
  }

  fnType(d: ts.SignatureDeclaration, subst?: Map<string, ZT>): ZT {
    return { k: 'fn', params: d.parameters.map(p => this.paramType(p, subst)), ret: this.retOf(d, subst) };
  }
  retOf(d: ts.SignatureDeclaration, subst?: Map<string, ZT>): ZT {
    if (d.type) return this.fromTypeNode(d.type, subst);
    if ((ts.isArrowFunction(d)) && !ts.isBlock(d.body)) {
      const t = this.ztypeOf(d.body);
      const sig = this.checker.getSignatureFromDeclaration(d);
      if (sig && sig.getReturnType().flags & ts.TypeFlags.Void) return VOID;
      return t.k === 'null' ? this.fromType(sig!.getReturnType(), d) : t;
    }
    const sig = this.checker.getSignatureFromDeclaration(d);
    return sig ? this.fromType(sig.getReturnType(), d) : VOID;
  }

  forOfElem(f: ts.ForOfStatement): ZT {
    const t = this.ztypeOf(f.expression);
    if (t.k === 'arr' || t.k === 'set') return t.el;
    if (t.k === 'str') return STR;
    return this.fail(f.expression, 'Z9005', 'for-of is supported on arrays, strings, Map and Set');
  }

  /** Type-parameter substitution for a member accessed through `recv`. */
  substFor(recv: ZT, member: ts.Declaration): Map<string, ZT> | undefined {
    if (recv.k !== 'obj' || !recv.args.length) return undefined;
    const owner = member.parent as ts.ClassLikeDeclaration | ts.InterfaceDeclaration;
    const tps = owner?.typeParameters;
    if (!tps) return undefined;
    return new Map(tps.map((tp, i) => [tp.name.text, recv.args[i]]));
  }

  // ---------- expression types ----------
  ztypeOf(e: ts.Expression): ZT {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) return this.ztypeOf(e.expression);
    if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) {
      return ts.isSatisfiesExpression(e) || e.type.kind === ts.SyntaxKind.TypeReference && (e.type as ts.TypeReferenceNode).typeName.getText() === 'const'
        ? this.ztypeOf(e.expression) : this.fromTypeNode(e.type);
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
      if (d && !this.isLib(d)) {
        if (ts.isFunctionDeclaration(d)) return this.fnType(d);
        const declared = this.declType(d);
        // narrowing by instanceof/discriminant: use the checker's narrowed class if it differs
        if (declared.k === 'obj') {
          const narrowed = this.fromTypeSafe(this.checker.getTypeAtLocation(e), e);
          if (narrowed?.k === 'obj' && narrowed.decl !== declared.decl) return narrowed;
        }
        return declared;
      }
    }
    if (ts.isPropertyAccessExpression(e)) {
      const recv = this.tryZ(e.expression);
      const name = e.name.text;
      if ((recv.k === 'arr' || recv.k === 'str') && name === 'length') return I32;
      if ((recv.k === 'map' || recv.k === 'set') && name === 'size') return I32;
      const d = this.declOf(e.name);
      if (d && !this.isLib(d)) {
        if (ts.isEnumMember(d)) return I32;
        return this.declType(d, this.substFor(recv, d));
      }
      if (d && this.isLib(d) && (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) && d.type && ts.isTypeReferenceNode(d.type) && MACHINE.has(d.type.typeName.getText()))
        return this.fromTypeNode(d.type);
    }
    if (ts.isElementAccessExpression(e)) {
      const recv = this.ztypeOf(e.expression);
      if (recv.k === 'arr') return recv.el;
      if (recv.k === 'str') return STR;
    }
    if (ts.isCallExpression(e)) {
      const c = e.expression;
      if (ts.isPropertyAccessExpression(c)) {
        const recv = this.tryZ(c.expression);
        const lib = this.libMemberType(recv, c.name.text, e);
        if (lib) return lib;
        const d = this.declOf(c.name);
        if (d && !this.isLib(d) && (ts.isMethodDeclaration(d) || ts.isMethodSignature(d)) && !d.typeParameters)
          return this.retOf(d, this.substFor(recv, d));
        if (d && this.isLib(d) && (ts.isMethodSignature(d) || ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d)) && d.type && ts.isTypeReferenceNode(d.type) && MACHINE.has(d.type.typeName.getText()))
          return this.fromTypeNode(d.type);
      } else {
        const d = this.declOf(c);
        if (d && ts.isFunctionDeclaration(d) && !d.typeParameters && (!this.isLib(d) || (d.type && ts.isTypeReferenceNode(d.type) && MACHINE.has(d.type.typeName.getText()))))
          return this.retOf(d);
        const ft = this.ztypeOf(c);
        if (ft.k === 'fn' && !(d && ts.isFunctionDeclaration(d))) return ft.ret;
      }
    }
    if (ts.isNewExpression(e)) {
      const d = this.declOf(e.expression);
      if (d && ts.isClassDeclaration(d) && !this.isLib(d)) {
        const t = this.fromType(this.checker.getTypeAtLocation(e), e);
        return t;
      }
    }
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return this.fnType(e);
    if (ts.isPrefixUnaryExpression(e)) {
      if (e.operator === ts.SyntaxKind.ExclamationToken) return BOOL;
      if (e.operator === ts.SyntaxKind.TildeToken) return I32;
      return this.ztypeOf(e.operand);
    }
    if (ts.isPostfixUnaryExpression(e)) return this.ztypeOf(e.operand);
    if (ts.isBinaryExpression(e)) return this.binaryType(e);
    if (ts.isConditionalExpression(e)) {
      const a = this.ztypeOf(e.whenTrue), b = this.ztypeOf(e.whenFalse);
      if (isNum(a) && isNum(b)) return a.m === b.m ? a : { k: 'num', m: this.numberKind };
      return a.k === 'null' ? b : a;
    }
    if (ts.isObjectLiteralExpression(e)) {
      const ctx = this.contextual(e) ?? this.fromTypeSafe(this.checker.getContextualType(e) ?? this.checker.getTypeAtLocation(e), e);
      if (ctx?.k === 'obj') return ctx;
    }
    if (ts.isArrayLiteralExpression(e)) {
      const ctx = this.contextual(e);
      if (ctx?.k === 'arr') return ctx;
    }
    return this.fromType(this.checker.getTypeAtLocation(e), e);
  }

  /** Receiver type, or `void` for library globals such as Math and console. */
  tryZ(e: ts.Expression): ZT {
    try { return this.ztypeOf(e); } catch (err) { if (err instanceof ZincError) return VOID; throw err; }
  }

  private fromTypeSafe(t: ts.Type, at: ts.Node): ZT | undefined {
    try { return this.fromType(t, at); } catch { return undefined; }
  }

  /** Expected type from the syntactic context (declaration annotation, return type, parameter). */
  contextual(e: ts.Expression): ZT | undefined {
    const p = e.parent;
    if (ts.isVariableDeclaration(p) && p.type) return this.fromTypeNode(p.type);
    if (ts.isPropertyDeclaration(p) && p.type) return this.fromTypeNode(p.type);
    if (ts.isReturnStatement(p)) {
      const fn = this.fnOf(p) as ts.SignatureDeclaration | undefined;
      if (fn?.type) return this.fromTypeNode(fn.type);
    }
    if (ts.isBinaryExpression(p) && p.right === e && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return this.ztypeOf(p.left);
    if (ts.isParenthesizedExpression(p)) return this.contextual(p);
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
      if (l.k === 'null') return r;
      if (isNum(l) && isNum(r) && l.m !== r.m) return { k: 'num', m: this.numberKind };
      return l;
    }
    const l = this.ztypeOf(e.left), r = this.ztypeOf(e.right);
    if (op === K.PlusToken && (l.k === 'str' || r.k === 'str')) return STR;
    const m = this.arith(op, e.left, l, e.right, r);
    return { k: 'num', m };
  }

  /** Numeric result kind of an arithmetic/bitwise operator (LNG-05). */
  arith(op: ts.SyntaxKind, le: ts.Expression, l: ZT, re: ts.Expression, r: ZT): NumKind {
    const K = ts.SyntaxKind;
    if ([K.AmpersandToken, K.BarToken, K.CaretToken, K.LessThanLessThanToken, K.GreaterThanGreaterThanToken].includes(op)) return 'i32';
    if (op === K.GreaterThanGreaterThanGreaterThanToken) return 'u32';
    if (op === K.SlashToken || op === K.AsteriskAsteriskToken) return this.numberKind === 'f32' ? 'f32' : 'f64';
    const lm = isNum(l) ? l.m : this.numberKind, rm = isNum(r) ? r.m : this.numberKind;
    const llit = this.isIntLiteral(le), rlit = this.isIntLiteral(re);
    const a = llit && isInt(rm) ? rm : lm, b = rlit && isInt(lm) ? lm : rm;
    if (a === 'f64' || b === 'f64') return 'f64';
    if (a === 'f32' || b === 'f32') return 'f32';
    const wide = (m: NumKind): NumKind => (m === 'i8' || m === 'i16' || m === 'u8' || m === 'u16') ? 'i32' : m === 'isize' ? 'i64' : m === 'usize' ? 'u64' : m;
    const x = wide(a), y = wide(b);
    if (x === y) return x;
    if (x === 'i64' || y === 'i64') return 'i64';
    return 'f64';  // mixed signedness: exact in f64, like JS
  }

  /** Result types of builtin members that carry element/machine types. */
  libMemberType(recv: ZT, name: string, call: ts.CallExpression): ZT | undefined {
    if (recv.k === 'arr') {
      switch (name) {
        case 'pop': case 'shift': case 'at': case 'find': return recv.el;
        case 'slice': case 'splice': case 'filter': case 'sort': case 'reverse': case 'concat': case 'fill': return recv;
        case 'map': {
          const cb = this.ztypeOf(call.arguments[0]);
          return { k: 'arr', el: cb.k === 'fn' ? cb.ret : F64 };
        }
        case 'reduce': return this.ztypeOf(call.arguments[1]);
        case 'push': case 'unshift': case 'indexOf': case 'findIndex': return I32;
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
    return undefined;
  }
}
