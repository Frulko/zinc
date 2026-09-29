// HIR (CMP-06): the checked AST lowered into a typed, desugared tree. Every node carries its Zinc type, and the
// decisions the C++ emitter takes implicitly are explicit here: numeric/Dyn conversions at coercion points,
// boxed captures (cells), calls that may throw (status check after the call, RT-05), virtual dispatch,
// for-of/destructuring/`?.`/`??`/templates desugared, async and generator bodies as numbered suspend points.
// It is built from the same Sema queries as emit-cpp.ts; the emitters do not consume it yet (docs/decisions/0013).
import { abiDefault } from './abi.ts';
import * as path from 'node:path';
import { ts, ZINC_ROOT } from './frontend.ts';
import { Sema, ZincError, type ZT, zeq, isNum, I32, BOOL, STR, VOID, DYN, F64 } from './sema.ts';

export type HExpr =
  | { k: 'lit'; t: ZT; v: string }
  | { k: 'var'; t: ZT; name: string; cell?: boolean; global?: boolean }
  | { k: 'field'; t: ZT; obj: HExpr; name: string }
  | { k: 'index'; t: ZT; obj: HExpr; idx: HExpr }
  | { k: 'call'; t: ZT; how: 'static' | 'method' | 'virtual' | 'closure' | 'builtin'; fn: string; recv?: HExpr; args: HExpr[]; check: boolean }
  | { k: 'new'; t: ZT; cls: string; args: HExpr[]; check: boolean }
  | { k: 'bin'; t: ZT; op: string; l: HExpr; r: HExpr }
  | { k: 'un'; t: ZT; op: string; e: HExpr }
  | { k: 'conv'; t: ZT; how: 'num' | 'dyn.box' | 'dyn.check' | 'downcast'; e: HExpr }
  | { k: 'dyn'; t: ZT; op: string; args: HExpr[] }
  | { k: 'cond'; t: ZT; c: HExpr; a: HExpr; b: HExpr }
  | { k: 'concat'; t: ZT; parts: HExpr[] }
  | { k: 'alloc'; t: ZT; what: string; items: { name?: string; v: HExpr }[] }
  | { k: 'lambda'; t: ZT; fn: HFunc }
  | { k: 'assign'; t: ZT; target: HExpr; v: HExpr; post?: boolean }
  | { k: 'suspend'; t: ZT; what: 'await' | 'yield'; e: HExpr; state: number }
  | { k: 'opaque'; t: ZT; text: string };
export type HStmt =
  | { k: 'let'; name: string; t: ZT; init?: HExpr; cell: boolean }
  | { k: 'expr'; e: HExpr }
  | { k: 'if'; c: HExpr; then: HStmt[]; else: HStmt[] }
  | { k: 'loop'; c?: HExpr; body: HStmt[]; step: HStmt[] }
  | { k: 'break' } | { k: 'continue' }
  | { k: 'return'; e?: HExpr }
  | { k: 'throw'; e: HExpr }
  | { k: 'try'; body: HStmt[]; bind?: string; bindCell?: boolean; handler: HStmt[]; fin: HStmt[]; hasCatch: boolean; errorType: ZT }
  | { k: 'opaque'; text: string };
export interface HFunc {
  name: string; params: { name: string; t: ZT; cell: boolean }[]; ret: ZT; body: HStmt[];
  throws: boolean; kind: 'fn' | 'async' | 'gen'; captures: string[]; static?: boolean; captureTypes?: { name: string; t: ZT; cell: boolean }[];
}
export interface HClass { decl: ts.ClassDeclaration; name: string; base?: string; fields: { name: string; t: ZT }[]; methods: HFunc[]; virtual: boolean }
export interface HModule { file: string; globals: HStmt[]; classes: HClass[]; fns: HFunc[]; init: HStmt[]; ordered: HStmt[] }

export function buildHir(s: Sema, nativeCalls?: Map<ts.Node, number>, symbols?: Map<ts.Node, string>): HModule[] {
  const lib = path.join(ZINC_ROOT, 'lib') + path.sep;
  return s.fe.sources.filter(sf => !sf.fileName.startsWith(lib)).map(sf => new Lower(s, nativeCalls, symbols).module(sf));
}

class Lower {
  K = ts.SyntaxKind;
  tmp = 0;
  state = 0;
  s: Sema;
  nativeCalls?: Map<ts.Node, number>;
  symbols?: Map<ts.Node, string>;
  constructor(s: Sema, nativeCalls?: Map<ts.Node, number>, symbols?: Map<ts.Node, string>) { this.s = s; this.nativeCalls = nativeCalls; this.symbols = symbols; }

  module(sf: ts.SourceFile): HModule {
    const m: HModule = { file: path.relative(this.s.root, sf.fileName), globals: [], classes: [], fns: [], init: [], ordered: [] };
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.body) m.fns.push(this.fn(st, this.symbols?.get(st) ?? st.name?.text ?? 'default'));
      else if (ts.isClassDeclaration(st)) {
        m.classes.push(this.cls(st));
        if (this.symbols) for (const property of st.members) {
          const name = this.symbols.get(property);
          if (!ts.isPropertyDeclaration(property) || !name) continue;
          const t = this.s.declType(property);
          const global: HStmt = { k: 'let', name, t, cell: false, init: property.initializer ? this.conv(this.expr(property.initializer, t), t) : undefined };
          m.globals.push(global); m.ordered.push(global);
        }
      }
      else if (ts.isVariableStatement(st)) {
        const ss = this.stmt(st);
        // Destructuring sources are temporaries of module initialization, not persistent globals.
        m.globals.push(...ss.filter(s => !this.symbols || (s.k === 'let' && !s.name.startsWith('%'))));
        m.ordered.push(...ss);
      }
      else if (!ts.isInterfaceDeclaration(st) && !ts.isTypeAliasDeclaration(st) && !ts.isImportDeclaration(st) && !ts.isExportDeclaration(st) && !ts.isEnumDeclaration(st)) { const ss = this.stmt(st); m.init.push(...ss); m.ordered.push(...ss); }
    }
    return m;
  }
  cls(c: ts.ClassDeclaration): HClass {
    const base = this.s.baseClass(c);
    const fieldType = (n: string): ZT => {
      const m = this.s.memberDecl(c, n);
      if (m) return this.s.declType(m);
      for (let owner: ts.ClassDeclaration | undefined = c; owner; owner = this.s.baseClass(owner)) {
        const ctor = owner.members.find(ts.isConstructorDeclaration);
        const p = ctor?.parameters.find(x => x.name.getText() === n && !!(ts.getCombinedModifierFlags(x) & (ts.ModifierFlags.Public | ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Readonly)));
        if (p) return this.s.paramType(p);
      }
      return VOID;
    };
    const fields = this.s.fieldNames(c).map(n => ({ name: n, t: this.safe(() => fieldType(n), VOID) }));
    const methods = c.members.filter((m): m is ts.MethodDeclaration | ts.ConstructorDeclaration => (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) && !!m.body)
      .map(m => this.fn(m, ts.isConstructorDeclaration(m) ? 'constructor' : m.name.getText()));
    const name = this.symbols?.get(c) ?? c.name?.text ?? 'default';
    if (this.symbols) {
      const self: HExpr = { k: 'var', t: { k: 'obj', decl: c, args: [] }, name: 'this' };
      const initializers: HStmt[] = [];
      for (const p of c.members) if (ts.isPropertyDeclaration(p)) {
        if (ts.getCombinedModifierFlags(p) & ts.ModifierFlags.Static) continue;
        if (p.initializer) { const t = this.s.declType(p); initializers.push({ k: 'expr', e: { k: 'assign', t, target: { k: 'field', t, obj: self, name: p.name.getText() }, v: this.conv(this.expr(p.initializer, t), t) } }); }
      }
      let ctor = methods.find(f => f.name === 'constructor');
      if (!ctor) {
        const params = base ? (this.ctorOf(base)?.parameters ?? []).map(p => ({ name: p.name.getText(), t: this.s.paramType(p), cell: false })) : [];
        ctor = { name: 'constructor', params, ret: VOID, body: [], throws: false, kind: 'fn', captures: [] };
        if (base) ctor.body.push({ k: 'expr', e: { k: 'call', t: VOID, how: 'static', fn: 'super', args: params.map(p => ({ k: 'var', t: p.t, name: p.name })), check: false } });
        methods.push(ctor);
      }
      if (base) {
        const first = ctor.body[0];
        if (first?.k !== 'expr' || first.e.k !== 'call' || first.e.fn !== 'super') throw new Error('zinc-vm: derived constructors must call super first');
        const params = this.ctorOf(base)?.parameters ?? [];
        first.e.args = [self, ...first.e.args.map((a,i) => this.conv(a, params[i] ? this.s.paramType(params[i]) : undefined))];
        first.e.fn = `${this.symbols.get(base)}.constructor`;
        ctor.body.splice(1, 0, ...initializers);
      } else ctor.body.unshift(...initializers);
      for (const f of methods) {
        f.name = `${name}.${f.name}`;
        if (!f.static) f.params.unshift({ name: 'this', t: self.t, cell: false });
      }
    }
    return { decl: c, name, base: base?.name?.text ?? this.s.errorBase(c), fields, methods, virtual: this.s.hierarchy.has(c) || this.s.implemented(c).length > 0 };

  }
  fn(f: ts.SignatureDeclaration & { body?: ts.Node }, name: string): HFunc {
    const kind = this.s.isAsyncFn(f) ? 'async' : this.s.isGeneratorFn(f) ? 'gen' : 'fn';
    const saved = this.state;
    this.state = 0;
    const params = f.parameters.map(p => ({ name: p.name.getText(), t: this.safe(() => this.s.paramType(p), DYN), cell: ts.isIdentifier(p.name) && this.boxed(p.name) }));
    const ret = ts.isConstructorDeclaration(f) ? VOID : this.safe(() => this.s.retOf(f), VOID);
    const body: HStmt[] = [];
    if (ts.isConstructorDeclaration(f)) for (const p of f.parameters)  // parameter properties are field stores
      if (ts.getCombinedModifierFlags(p) & (ts.ModifierFlags.Public | ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Readonly))
        body.push({ k: 'expr', e: { k: 'assign', t: this.s.paramType(p), target: { k: 'field', t: this.s.paramType(p), obj: { k: 'var', t: VOID, name: 'this' }, name: p.name.getText() }, v: { k: 'var', t: this.s.paramType(p), name: p.name.getText() } } });
    f.parameters.forEach((p, i) => { if (!ts.isIdentifier(p.name)) body.push(...this.destructure(p.name, { k: 'var', t: params[i].t, name: p.name.getText() })); });
    const b = f.body;
    if (b && ts.isBlock(b)) {
      const first = b.statements[0];
      const sup = first && ts.isExpressionStatement(first) && ts.isCallExpression(first.expression) && first.expression.expression.kind === this.K.SuperKeyword;
      body.splice(0, 0, ...(sup ? this.stmt(first, ret) : []));  // base constructor first, then field stores
      body.push(...b.statements.slice(sup ? 1 : 0).flatMap(x => this.stmt(x, ret)));
    }
    else if (b) body.push(ret.k === 'void' ? { k: 'expr', e: this.expr(b as ts.Expression) } : { k: 'return', e: this.conv(this.expr(b as ts.Expression), ret) });
    const captures = new Set<string>();
    const captureTypes = new Map<string, { name: string; t: ZT; cell: boolean }>();
    if (ts.isArrowFunction(f) || ts.isFunctionExpression(f) || (ts.isFunctionDeclaration(f) && !ts.isSourceFile(f.parent))) {
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n)) {
          const d = this.s.declOf(n);
          if (d && (ts.isVariableDeclaration(d) || ts.isParameter(d)) && !this.s.isModuleLevel(d) && this.s.fnOf(d) !== f && !isInside(d, f)) { captures.add(n.text); captureTypes.set(n.text, { name: n.text, t: this.s.declType(d), cell: this.boxed(n) }); }
        }
        ts.forEachChild(n, visit);
      };
      if (b) visit(b);
    }
    this.state = saved;
    return { name, params, ret, body, throws: this.s.throwing.has(f), kind, captures: [...captures], static: !!(ts.getCombinedModifierFlags(f as ts.Declaration) & ts.ModifierFlags.Static), captureTypes: [...captureTypes.values()] };
  }

  // ---------- statements ----------
  stmt(n: ts.Statement, ret: ZT = VOID): HStmt[] {
    try { return this.stmtInner(n, ret); } catch (e) { if (e instanceof ZincError) return [{ k: 'opaque', text: `${e.diag.code} ${oneLine(n)}` }]; throw e; }
  }
  body(n: ts.Statement, ret: ZT): HStmt[] { return ts.isBlock(n) ? n.statements.flatMap(x => this.stmt(x, ret)) : this.stmt(n, ret); }
  stmtInner(n: ts.Statement, ret: ZT): HStmt[] {
    const K = this.K;
    if (ts.isBlock(n)) return n.statements.flatMap(x => this.stmt(x, ret));
    if (ts.isExpressionStatement(n)) return [{ k: 'expr', e: this.expr(n.expression) }];
    if (ts.isVariableStatement(n)) return this.vars(n.declarationList);
    if (ts.isIfStatement(n)) return [{ k: 'if', c: this.cond(n.expression), then: this.body(n.thenStatement, ret), else: n.elseStatement ? this.body(n.elseStatement, ret) : [] }];
    if (ts.isWhileStatement(n)) return [{ k: 'loop', c: this.cond(n.expression), body: this.body(n.statement, ret), step: [] }];
    if (ts.isDoStatement(n)) return [{ k: 'loop', body: [...this.body(n.statement, ret), { k: 'if', c: { k: 'un', t: BOOL, op: '!', e: this.cond(n.expression) }, then: [{ k: 'break' }], else: [] }], step: [] }];
    if (ts.isForStatement(n)) {
      const init = !n.initializer ? [] : ts.isVariableDeclarationList(n.initializer) ? this.vars(n.initializer) : [{ k: 'expr', e: this.expr(n.initializer) } as HStmt];
      return [...init, { k: 'loop', c: n.condition ? this.cond(n.condition) : undefined, body: this.body(n.statement, ret), step: n.incrementor ? [{ k: 'expr', e: this.expr(n.incrementor) }] : [] }];
    }
    if (ts.isForOfStatement(n)) return this.forOf(n, ret);
    if (ts.isBreakStatement(n)) return [{ k: 'break' }];
    if (ts.isContinueStatement(n)) return [{ k: 'continue' }];
    if (ts.isReturnStatement(n)) return n.expression && ret.k === 'void' ? [{ k: 'expr', e: this.expr(n.expression) }, { k: 'return' }] : [{ k: 'return', e: n.expression ? this.conv(this.expr(n.expression, ret), ret) : undefined }];
    if (ts.isThrowStatement(n)) return [{ k: 'throw', e: this.expr(n.expression) }];
    if (ts.isTryStatement(n)) return [{ k: 'try', hasCatch: !!n.catchClause, bindCell: !!n.catchClause?.variableDeclaration && ts.isIdentifier(n.catchClause.variableDeclaration.name) && this.boxed(n.catchClause.variableDeclaration.name), errorType: { k: 'obj', decl: this.s.errorDecl, args: [] }, body: this.body(n.tryBlock, ret), bind: n.catchClause?.variableDeclaration?.name.getText(), handler: n.catchClause ? this.body(n.catchClause.block, ret) : [], fin: n.finallyBlock ? this.body(n.finallyBlock, ret) : [] }];
    if (ts.isSwitchStatement(n)) return this.switch(n, ret);
    if (ts.isFunctionDeclaration(n) && n.body && n.name) return [{ k: 'let', name: n.name.text, t: this.s.fnType(n), init: { k: 'lambda', t: this.s.fnType(n), fn: this.fn(n, n.name.text) }, cell: false }];
    if (ts.isEmptyStatement(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return [];
    void K;
    return [{ k: 'opaque', text: oneLine(n) }];
  }
  vars(l: ts.VariableDeclarationList): HStmt[] {
    return l.declarations.flatMap(d => {
      if (!ts.isIdentifier(d.name)) {
        const src = this.expr(d.initializer!);
        const tmp = `%d${this.tmp++}`;
        return [{ k: 'let', name: tmp, t: src.t, init: src, cell: false } as HStmt, ...this.destructure(d.name, { k: 'var', t: src.t, name: tmp })];
      }
      const t = this.s.declType(d);
      return [{ k: 'let', name: this.symbols?.get(d) ?? d.name.text, t, init: d.initializer ? this.conv(this.expr(d.initializer, t), t) : undefined, cell: this.boxed(d.name) } as HStmt];
    });
  }
  destructure(p: ts.BindingPattern, src: HExpr): HStmt[] {
    return p.elements.flatMap((e, i) => {
      if (!ts.isBindingElement(e)) return [];
      if (this.symbols && (e.dotDotDotToken || e.initializer)) throw new Error('zinc-vm: rest and defaults in destructuring are not implemented');
      const t = this.s.bindingType(e);
      const v: HExpr = ts.isObjectBindingPattern(p) ? { k: 'field', t, obj: src, name: (e.propertyName ?? e.name).getText() } : src.t.k === 'tup' ? { k: 'field', t, obj: src, name: `${i}` } : { k: 'index', t, obj: src, idx: lit(I32, `${i}`) };
      if (ts.isIdentifier(e.name)) return [{ k: 'let', name: this.symbols?.get(e) ?? e.name.text, t, init: v, cell: this.boxed(e.name) } as HStmt];
      const tmp = `%d${this.tmp++}`;
      return [{ k: 'let', name: tmp, t, init: v, cell: false } as HStmt, ...this.destructure(e.name, { k: 'var', t, name: tmp })];
    });
  }
  /** for-of: an index loop over arrays/strings/Dyn arrays, a slot loop over Map/Set, step() over generators. */
  forOf(n: ts.ForOfStatement, ret: ZT): HStmt[] {
    const src = this.expr(n.expression);
    const c = `%c${this.tmp++}`, i = `%i${this.tmp++}`;
    const decl = (n.initializer as ts.VariableDeclarationList).declarations[0];
    const et: ZT = src.t.k === 'map' ? { k: 'tup', els: [src.t.key, src.t.val] } : this.s.forOfElem(n);
    const coll: HExpr = src.t.k === 'dyn' ? { k: 'dyn', t: { k: 'arr', el: DYN }, op: 'iter', args: [src] } : src;
    const cv: HExpr = { k: 'var', t: coll.t, name: c }, iv: HExpr = { k: 'var', t: I32, name: i };
    let item: HExpr, cond: HExpr;
    if (src.t.k === 'gen') { cond = { k: 'call', t: BOOL, how: 'method', fn: 'step', recv: cv, args: [], check: false }; item = { k: 'field', t: et, obj: cv, name: 'cur' }; }
    else {
      const len = src.t.k === 'map' || src.t.k === 'set' ? 'slots' : 'length';
      cond = { k: 'bin', t: BOOL, op: '<', l: iv, r: { k: 'call', t: I32, how: 'builtin', fn: len, recv: cv, args: [], check: false } };
      item = src.t.k === 'map' || src.t.k === 'set' ? { k: 'call', t: et, how: 'builtin', fn: 'entry_at', recv: cv, args: [iv], check: false } : { k: 'index', t: et, obj: cv, idx: iv };
    }
    const bind: HStmt[] = ts.isIdentifier(decl.name) ? [{ k: 'let', name: decl.name.text, t: et, init: item, cell: this.boxed(decl.name) }] : (() => { const tmp = `%d${this.tmp++}`; return [{ k: 'let', name: tmp, t: et, init: item, cell: false } as HStmt, ...this.destructure(decl.name as ts.BindingPattern, { k: 'var', t: et, name: tmp })]; })();
    const step: HStmt[] = src.t.k === 'gen' ? [] : [{ k: 'expr', e: { k: 'assign', t: I32, target: iv, v: { k: 'bin', t: I32, op: '+', l: iv, r: lit(I32, '1') } } }];
    return [{ k: 'let', name: c, t: coll.t, init: coll, cell: false }, ...(src.t.k === 'gen' ? [] : [{ k: 'let', name: i, t: I32, init: lit(I32, '0'), cell: false } as HStmt]),
      { k: 'loop', c: cond, body: [...bind, ...this.body(n.statement, ret)], step }];
  }
  /** switch without fall-through becomes an if chain on a temporary. */
  switch(n: ts.SwitchStatement, ret: ZT): HStmt[] {
    const v = this.expr(n.expression);
    const tmp = `%sw${this.tmp++}`;
    const clauses = n.caseBlock.clauses;
    const ends = (c: ts.CaseOrDefaultClause) => { const l = c.statements[c.statements.length - 1]; return !!l && (ts.isBreakStatement(l) || ts.isReturnStatement(l) || ts.isThrowStatement(l) || ts.isContinueStatement(l)); };
    if (!clauses.every((c, i) => ends(c) || (i === clauses.length - 1))) return [{ k: 'opaque', text: `switch with fall-through: ${oneLine(n.expression)}` }];
    let chain: HStmt[] = [];
    for (let i = clauses.length - 1; i >= 0; i--) {
      const c = clauses[i];
      const stmts = c.statements.filter(s => !ts.isBreakStatement(s)).flatMap(s => this.stmt(s, ret));
      chain = ts.isDefaultClause(c) ? stmts : [{ k: 'if', c: { k: 'bin', t: BOOL, op: '==', l: { k: 'var', t: v.t, name: tmp }, r: this.conv(this.expr(c.expression), v.t) }, then: stmts, else: chain }];
    }
    return [{ k: 'let', name: tmp, t: v.t, init: v, cell: false }, ...chain];
  }

  // ---------- expressions ----------
  cond(e: ts.Expression): HExpr {
    const h = this.expr(e);
    return h.t.k === 'bool' ? h : { k: 'un', t: BOOL, op: 'truthy', e: h };
  }
  /** Coercion point (LNG-05, DYN-07): the conversion the emitters insert. */
  conv(h: HExpr, to: ZT | undefined): HExpr {
    if (!to || to.k === 'void' || to.k === 'tp' || zeq(h.t, to) || h.t.k === 'null') return h;
    if (h.t.k === 'dyn') return { k: 'conv', t: to, how: 'dyn.check', e: h };
    if (to.k === 'dyn') return { k: 'conv', t: to, how: 'dyn.box', e: h };
    if (isNum(h.t) && isNum(to)) return h.k === 'lit' ? { ...h, t: to } : { k: 'conv', t: to, how: 'num', e: h };
    if (h.t.k === 'obj' && to.k === 'obj' && h.t.decl !== to.decl && this.s.inherits(to.decl, h.t.decl)) return { k: 'conv', t: to, how: 'downcast', e: h };
    return h;
  }
  expr(e: ts.Expression, want?: ZT): HExpr {
    try { return this.exprInner(e, want); } catch (err) { if (err instanceof ZincError) return { k: 'opaque', t: VOID, text: `${err.diag.code} ${oneLine(e)}` }; throw err; }
  }
  exprInner(e: ts.Expression, want?: ZT): HExpr {
    const K = this.K, s = this.s;
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) return this.expr(e.expression, want);
    if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) return e.type.getText() === 'const' ? this.expr(e.expression, want) : this.conv(this.expr(e.expression), s.fromTypeNode(e.type));
    if (e.kind === K.SuperKeyword) return { k: 'var', t: VOID, name: 'super' };
    const t = this.safe(() => s.ztypeOf(e), VOID as ZT);  // library globals (Math, console) have no Zinc type
    if (ts.isNumericLiteral(e)) return lit(want && isNum(want) ? want : t, e.text);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return lit(STR, JSON.stringify(e.text));
    if (e.kind === K.TrueKeyword || e.kind === K.FalseKeyword) return lit(BOOL, e.getText());
    if (e.kind === K.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')) return lit(want?.k === 'dyn' ? DYN : { k: 'null' }, e.getText());
    if (e.kind === K.ThisKeyword) return { k: 'var', t, name: 'this' };
    if (ts.isTemplateExpression(e)) {
      const parts: HExpr[] = e.head.text ? [lit(STR, JSON.stringify(e.head.text))] : [];
      for (const sp of e.templateSpans) { parts.push(this.expr(sp.expression)); if (sp.literal.text) parts.push(lit(STR, JSON.stringify(sp.literal.text))); }
      return { k: 'concat', t: STR, parts };
    }
    if (ts.isIdentifier(e)) {
      const d = s.declOf(e);
      if (d && ts.isEnumMember(d)) return lit(I32, String(s.checker.getConstantValue(d)));
      const global = !!d && (ts.isFunctionDeclaration(d) || ts.isClassDeclaration(d) || s.isModuleLevel(d));
      const v: HExpr = { k: 'var', t, name: (d && this.symbols?.get(d)) ?? e.text, cell: this.boxed(e), global };
      if (d && !s.isLib(d) && (ts.isVariableDeclaration(d) || ts.isParameter(d)) && s.declType(d).k === 'dyn' && t.k !== 'dyn' && !s.isWrite(e))
        return { k: 'conv', t, how: 'dyn.check', e: { ...v, t: DYN } };  // DYN-08: narrowed
      return v;
    }
    if (ts.isPropertyAccessExpression(e)) {
      const d = s.declOf(e.name);
      if (this.symbols && ts.isIdentifier(e.expression) && e.expression.text === 'Math' && (e.name.text === 'PI' || e.name.text === 'E')) {
        const owner = s.declOf(e.expression);
        if (!owner || s.isLib(owner)) return lit(t, String(e.name.text === 'PI' ? Math.PI : Math.E));
      }
      if (d && ts.isEnumMember(d)) return lit(I32, String(s.checker.getConstantValue(d)));
      if (d && this.symbols?.has(d) && (ts.isVariableDeclaration(d) || ts.isBindingElement(d) || ts.isPropertyDeclaration(d))) return { k: 'var', t, name: this.symbols.get(d)!, global: true };
      const recv = s.tryZ(e.expression);
      const obj = this.expr(e.expression);
      const get: HExpr = recv.k === 'dyn' ? { k: 'dyn', t, op: 'get', args: [obj, lit(STR, JSON.stringify(e.name.text))] }
        : (recv.k === 'arr' || recv.k === 'str' || recv.k === 'map' || recv.k === 'set') ? { k: 'call', t, how: 'builtin', fn: e.name.text, recv: obj, args: [], check: false }
        : d && ts.isGetAccessorDeclaration(d) ? { k: 'call', t, how: 'method', fn: `get ${e.name.text}`, recv: obj, args: [], check: false }
        : { k: 'field', t, obj, name: e.name.text };
      if (!e.questionDotToken) return get;
      const tmp: HExpr = { k: 'var', t: obj.t, name: `%o${this.tmp++}` };  // a?.b: null test on a temporary
      const inner: HExpr = get.k === 'field' ? { ...get, obj: tmp } : get.k === 'dyn' ? { ...get, args: [tmp, get.args[1]] } : get.k === 'call' ? { ...get, recv: tmp } : get;
      return { k: 'cond', t, c: { k: 'bin', t: BOOL, op: '==', l: { k: 'assign', t: obj.t, target: tmp, v: obj }, r: lit({ k: 'null' }, 'null') }, a: lit(t, 'default'), b: inner };
    }
    if (ts.isElementAccessExpression(e)) {
      const recv = s.ztypeOf(e.expression);
      const obj = this.expr(e.expression), idx = this.expr(e.argumentExpression);
      if (recv.k === 'dyn') return { k: 'dyn', t, op: 'index', args: [obj, this.conv(idx, DYN)] };
      if (recv.k === 'tup') return { k: 'field', t, obj, name: e.argumentExpression.getText() };
      return { k: 'index', t, obj, idx };
    }
    if (ts.isCallExpression(e)) return this.call(e, t);
    if (ts.isNewExpression(e)) {
      if (this.symbols && t.k === 'promise' && ts.isIdentifier(e.expression) && e.expression.text === 'Promise' && e.arguments?.length === 1) {
        const executor = this.expr(e.arguments[0]);
        const promise: HExpr = { k: 'var', t, name: '%promise' };
        const error: ZT = { k: 'obj', decl: s.errorDecl, args: [] };
        const resolver = (reject: boolean): HExpr => {
          const valueType = reject ? error : t.el;
          const params = valueType.k === 'void' ? [] : [{ name: '%value', t: valueType, cell: false }];
          const fn: HFunc = { name: reject ? '<reject>' : '<resolve>', params, ret: VOID, kind: 'fn', captures: [promise.name], captureTypes: [{ name: promise.name, t, cell: false }], throws: false,
            body: [{ k: 'expr', e: { k: 'call', t: VOID, how: 'builtin', fn: reject ? '@promise.reject' : '@promise.resolve', recv: promise,
              args: params.length ? [{ k: 'var', t: valueType, name: '%value' }] : [], check: false } }] };
          return { k: 'lambda', t: { k: 'fn', params: params.map(p => p.t), ret: VOID }, fn };
        };
        const resolve = resolver(false), reject = resolver(true);
        const exType = executor.t;
        if (exType.k !== 'fn') return { k: 'opaque', t, text: 'Promise executor must be a function' };
        const body: HStmt[] = [
          { k: 'let', name: promise.name, t, init: { k: 'call', t, how: 'builtin', fn: '@promise.pending', args: [], check: false }, cell: false },
          { k: 'try', hasCatch: true, bindCell: false, bind: '%error', errorType: error, fin: [], body: [
            { k: 'expr', e: { k: 'call', t: exType.ret, how: 'closure', fn: '%executor', recv: { k: 'var', t: exType, name: '%executor' }, args: [resolve, reject].slice(0, exType.params.length), check: true } },
          ], handler: [{ k: 'expr', e: { k: 'call', t: VOID, how: 'builtin', fn: '@promise.reject', recv: promise, args: [{ k: 'var', t: error, name: '%error' }], check: false } }] },
          { k: 'return', e: promise },
        ];
        const fn: HFunc = { name: '<Promise>', params: [{ name: '%executor', t: exType, cell: false }], ret: t, body, kind: 'fn', captures: [], throws: false };
        return { k: 'call', t, how: 'closure', fn: '<Promise>', recv: { k: 'lambda', t: { k: 'fn', params: [exType], ret: t }, fn }, args: [executor], check: false };
      }
      const d = s.declOf(e.expression);
      const ctor = d && ts.isClassDeclaration(d) ? this.ctorOf(d) : undefined;
      return { k: 'new', t, cls: e.expression.getText(), args: (e.arguments ?? []).map((a, i) => this.conv(this.expr(a), ctor?.parameters[i] ? s.paramType(ctor.parameters[i]) : undefined)), check: s.mayThrow(e) };
    }
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return { k: 'lambda', t, fn: this.fn(e, '<lambda>') };
    if (ts.isConditionalExpression(e)) return { k: 'cond', t, c: this.cond(e.condition), a: this.conv(this.expr(e.whenTrue), t), b: this.conv(this.expr(e.whenFalse), t) };
    if (ts.isYieldExpression(e)) {
      if (e.asteriskToken || !ts.isExpressionStatement(e.parent)) return { k: 'opaque', t: VOID, text: 'yield* and yield results are not implemented' };
      const fn = s.fnOf(e), ret = fn && ts.isFunctionLike(fn) ? s.retOf(fn as ts.SignatureDeclaration) : undefined;
      return { k: 'suspend', t: VOID, what: 'yield', e: e.expression ? this.conv(this.expr(e.expression), ret?.k === 'gen' ? ret.el : undefined) : lit(VOID, 'undefined'), state: ++this.state };
    }
    if (ts.isAwaitExpression(e)) return { k: 'suspend', t, what: 'await', e: this.expr(e.expression), state: ++this.state };
    if (ts.isTypeOfExpression(e)) {
      const o = this.expr(e.expression);
      return o.t.k === 'dyn' ? { k: 'dyn', t: STR, op: 'typeof', args: [o] } : lit(STR, JSON.stringify(({ num: 'number', bool: 'boolean', str: 'string', void: 'undefined', fn: 'function' } as Record<string, string>)[o.t.k] ?? 'object'));
    }
    if (ts.isObjectLiteralExpression(e)) {
      const items = e.properties.map(p => {
        const name = p.name && !ts.isComputedPropertyName(p.name) ? (ts.isStringLiteral(p.name) ? p.name.text : p.name.getText()) : undefined;
        const v = ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : ts.isSpreadAssignment(p) ? p.expression : undefined;
        const ft = t.k === 'obj' && name ? this.safe(() => s.declType(s.memberDecl(t.decl, name)!), undefined) : t.k === 'dyn' ? DYN : undefined;
        return { name: ts.isSpreadAssignment(p) ? '...' : name ?? `[${oneLine((p.name as ts.ComputedPropertyName).expression)}]`, v: v ? this.conv(this.expr(v, ft), ft) : lit(VOID, '?') };
      });
      return { k: 'alloc', t, what: t.k === 'dyn' ? 'dynobj' : 'object', items };
    }
    if (ts.isArrayLiteralExpression(e)) {
      const arrayType = want?.k === 'arr' || want?.k === 'tup' ? want : t;
      const el = arrayType.k === 'arr' ? arrayType.el : arrayType.k === 'dyn' ? DYN : undefined;
      return { k: 'alloc', t: arrayType, what: arrayType.k === 'tup' ? 'tuple' : 'array', items: e.elements.map((x, i) => {
        const element = arrayType.k === 'tup' ? arrayType.els[i] : el;
        return { v: ts.isSpreadElement(x) ? { k: 'un', t: s.ztypeOf(x.expression), op: '...', e: this.expr(x.expression) } : this.conv(this.expr(x, element), element) };
      }) };
    }
    if (ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) {
      const op = e.operator === K.PlusPlusToken ? '+' : e.operator === K.MinusMinusToken ? '-' : undefined;
      const o = this.expr(e.operand);
      if (op) return { k: 'assign', t: o.t, target: o, v: { k: 'bin', t: o.t, op, l: o, r: lit(o.t, '1') }, post: ts.isPostfixUnaryExpression(e) };
      return { k: 'un', t, op: ts.tokenToString(e.operator)!, e: e.operator === K.ExclamationToken ? this.cond(e.operand) : o };
    }
    if (ts.isBinaryExpression(e)) return this.binary(e, t);
    return { k: 'opaque', t, text: oneLine(e) };
  }
  binary(e: ts.BinaryExpression, t: ZT): HExpr {
    const K = this.K, s = this.s, op = e.operatorToken.kind, tok = e.operatorToken.getText();
    const lt = s.ztypeOf(e.left), rt = s.ztypeOf(e.right);
    if (op === K.EqualsToken) {
      const target = this.expr(e.left);
      if (target.k === 'dyn') return { k: 'dyn', t: DYN, op: target.op === 'get' ? 'set' : 'set_index', args: [...target.args, this.conv(this.expr(e.right), DYN)] };
      return { k: 'assign', t: lt, target, v: this.conv(this.expr(e.right, lt), lt) };
    }
    if (op > K.FirstAssignment && op <= K.LastAssignment) {  // compound: target = target op value
      const target = this.expr(e.left);
      const base = tok.slice(0, -1);
      if (base === '??' || base === '||' || base === '&&') {
        const test: HExpr = base === '??' ? { k: 'bin', t: BOOL, op: '==', l: target, r: lit({ k: 'null' }, 'null') } : { k: 'un', t: BOOL, op: base === '||' ? '!truthy' : 'truthy', e: target };
        return { k: 'cond', t: lt, c: test, a: { k: 'assign', t: lt, target, v: this.conv(this.expr(e.right), lt) }, b: target };
      }
      const v: HExpr = lt.k === 'dyn' ? { k: 'dyn', t: DYN, op: base, args: [target, this.conv(this.expr(e.right), DYN)] } : lt.k === 'str' ? { k: 'concat', t: STR, parts: [target, this.expr(e.right)] } : { k: 'bin', t: lt, op: base, l: target, r: this.conv(this.expr(e.right), lt) };
      return { k: 'assign', t: lt, target, v };
    }
    if (op === K.CommaToken) return { k: 'bin', t, op: ',', l: this.expr(e.left), r: this.expr(e.right) };
    if (op === K.AmpersandAmpersandToken || op === K.BarBarToken) {
      if (t.k === 'bool') return { k: 'cond', t, c: this.cond(e.left), a: op === K.AmpersandAmpersandToken ? this.cond(e.right) : lit(BOOL, 'true'), b: op === K.AmpersandAmpersandToken ? lit(BOOL, 'false') : this.cond(e.right) };
      const tmp: HExpr = { k: 'var', t, name: `%t${this.tmp++}` };
      return { k: 'cond', t, c: { k: 'un', t: BOOL, op: 'truthy', e: { k: 'assign', t, target: tmp, v: this.conv(this.expr(e.left), t) } }, a: op === K.AmpersandAmpersandToken ? this.conv(this.expr(e.right), t) : tmp, b: op === K.AmpersandAmpersandToken ? tmp : this.conv(this.expr(e.right), t) };
    }
    if (op === K.QuestionQuestionToken) {
      const tmp: HExpr = { k: 'var', t, name: `%t${this.tmp++}` };
      return { k: 'cond', t, c: { k: 'bin', t: BOOL, op: '==', l: { k: 'assign', t, target: tmp, v: this.conv(this.expr(e.left), t) }, r: lit({ k: 'null' }, 'null') }, a: this.conv(this.expr(e.right), t), b: tmp };
    }
    if (lt.k === 'dyn' || rt.k === 'dyn') {
      const args = [this.conv(this.expr(e.left), DYN), this.conv(this.expr(e.right), DYN)];
      if (t.k === 'dyn' || t.k === 'bool') return { k: 'dyn', t, op: tok, args };
      if (t.k === 'str') return { k: 'concat', t, parts: [this.expr(e.left), this.expr(e.right)] };
      return { k: 'bin', t, op: tok, l: { k: 'dyn', t: F64, op: 'tonum', args: [args[0]] }, r: { k: 'dyn', t: F64, op: 'tonum', args: [args[1]] } };
    }
    if (t.k === 'str' && op === K.PlusToken) return { k: 'concat', t, parts: [this.expr(e.left), this.expr(e.right)] };
    if (op === K.InstanceOfKeyword) return { k: 'bin', t: BOOL, op: 'instanceof', l: this.expr(e.left), r: lit(VOID, e.right.getText()) };
    // numeric operators work in the arithmetic kind of LNG-05; comparisons too
    const w: ZT = isNum(lt) && isNum(rt) ? { k: 'num', m: s.arith(K.PlusToken, e.left, lt, e.right, rt) } : lt;
    const opnd = isNum(t) && !['&', '|', '^', '<<', '>>', '>>>'].includes(tok) ? t : w;
    return { k: 'bin', t, op: tok === '===' ? '==' : tok === '!==' ? '!=' : tok, l: this.conv(this.expr(e.left, opnd), isNum(opnd) ? opnd : undefined), r: this.conv(this.expr(e.right, opnd), isNum(opnd) ? opnd : undefined) };
  }
  call(e: ts.CallExpression, t: ZT): HExpr {
    const s = this.s, c = e.expression, check = s.mayThrow(e);
    let d = ts.isPropertyAccessExpression(c) ? s.declOf(c.name) : s.declOf(c);
    const callable = d && !s.isLib(d) && !ts.isFunctionLike(d) ? s.tryZ(c) : undefined;
    const params = d && (!s.isLib(d) || this.nativeCalls?.has(d)) && ts.isFunctionLike(d) ? (d as ts.SignatureDeclaration).parameters.map(p => this.safe(() => s.paramType(p), undefined)) : callable?.k === 'fn' ? callable.params : [];
    const args = e.arguments.map((a, i) => this.conv(this.expr(a, params[i]), params[i]));
    const native = d && this.nativeCalls?.get(d);
    if (native !== undefined) {
      for (let i = args.length; i < params.length; i++) {
        const p = params[i];
        const value = abiDefault(s, d as ts.SignatureDeclaration, (d as ts.SignatureDeclaration).parameters[i]);
        if (value === undefined || !p) throw new Error('native ABI: missing required argument');
        args.push(lit(p, value));
      }
      return { k: 'call', t, how: 'builtin', fn: `@native:${native}`, args, check };
    }
    if (d && ts.isFunctionDeclaration(d) && this.symbols?.has(d)) return { k: 'call', t, how: 'static', fn: this.symbols.get(d)!, args, check };
    if (d && ts.isMethodDeclaration(d) && ts.isClassDeclaration(d.parent) && this.symbols?.has(d.parent) && (ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Static)) return { k: 'call', t, how: 'static', fn: `${this.symbols.get(d.parent)}.${d.name.getText()}`, args, check };
    if (d && ts.isPropertyDeclaration(d) && this.symbols?.has(d)) return { k: 'call', t, how: 'closure', fn: c.getText(), recv: this.expr(c), args, check };
    if (ts.isPropertyAccessExpression(c)) {
      const recvT = s.tryZ(c.expression);
      const name = c.name.text;
      if (recvT.k === 'arr' && (name === 'push' || name === 'unshift') && args.length === 1) args[0] = this.conv(args[0], recvT.el);
      if (recvT.k === 'arr' && name === 'splice' && e.arguments.length === 2 && ts.isIdentifier(e.arguments[1]) && e.arguments[1].text === 'undefined') args[1] = lit(I32, '0');
      if (ts.isIdentifier(c.expression) && (!s.declOf(c.expression) || s.isLib(s.declOf(c.expression)!))) {
        if (this.symbols && c.expression.text === 'Promise' && name === 'all' && t.k === 'promise' && t.el.k === 'arr' && args.length === 1) return this.promiseAll(t, args[0]);
        return { k: 'call', t, how: 'builtin', fn: `${c.expression.text}.${name}`, args, check };
      }
      const recv = this.expr(c.expression);
      if (this.symbols && recvT.k === 'promise' && name === 'then' && args.length === 1 && args[0].t.k === 'fn') {
        const cb = args[0], ft = cb.t as Extract<ZT, { k: 'fn' }>;
        const p: HExpr = { k: 'var', t: recvT, name: '%promise' };
        const callback: HExpr = { k: 'var', t: ft, name: '%callback' };
        const value: HExpr = { k: 'var', t: recvT.el, name: '%value' };
        const invoke: HExpr = { k: 'call', t: ft.ret, how: 'closure', fn: '%callback', recv: callback, args: ft.params.length ? [value] : [], check: true };
        const fn: HFunc = { name: '<then>', params: [{ name: p.name, t: p.t, cell: false }, { name: callback.name, t: ft, cell: false }],
          ret: t, kind: 'async', captures: [], throws: false, body: [
            { k: 'let', name: value.name, t: value.t, init: { k: 'suspend', t: value.t, what: 'await', e: p, state: 1 }, cell: false },
            { k: 'expr', e: ft.ret.k === 'promise' ? { k: 'suspend', t: ft.ret.el, what: 'await', e: invoke, state: 2 } : invoke },
          ] };
        return { k: 'call', t, how: 'closure', fn: '<then>', recv: { k: 'lambda', t: { k: 'fn', params: fn.params.map(p => p.t), ret: t }, fn }, args: [recv, cb], check: false };
      }
      if (recvT.k === 'dyn') return { k: 'dyn', t, op: `call ${name}`, args: [recv, ...args] };
      if (recvT.k !== 'obj') return { k: 'call', t, how: 'builtin', fn: name, recv, args, check };
      if (d && (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d))) return { k: 'call', t, how: 'closure', fn: name, recv: { k: 'field', t: s.declType(d), obj: recv, name }, args, check };
      const owner = d?.parent;
      const virt = !!owner && (ts.isInterfaceDeclaration(owner) || (ts.isClassDeclaration(owner) && (s.hierarchy.has(owner) || s.implemented(owner).length > 0)));
      return { k: 'call', t, how: virt ? 'virtual' : 'method', fn: name, recv, args, check };
    }
    if (c.kind === this.K.SuperKeyword) return { k: 'call', t, how: 'static', fn: 'super', args, check };
    d = s.declOf(c);
    if (d && ts.isFunctionDeclaration(d)) return { k: 'call', t, how: s.isLib(d) ? 'builtin' : 'static', fn: c.getText(), args, check };
    return { k: 'call', t, how: 'closure', fn: c.getText(), recv: this.expr(c), args, check };
  }

  promiseAll(t: Extract<ZT, { k: 'promise' }>, input: HExpr): HExpr {
    const outType = t.el as Extract<ZT, { k: 'arr' }>;
    const error: ZT = { k: 'obj', decl: this.s.errorDecl, args: [] };
    const variable = (name: string, type: ZT, cell = false): HExpr & { k: 'var' } => ({ k: 'var', name, t: type, cell });
    const values = variable('%values', input.t), out = variable('%out', outType), promise = variable('%promise', t);
    const count = variable('%count', I32), left = variable('%left', I32, true), index = variable('%index', I32);
    const item = variable('%item', { k: 'promise', el: outType.el }), value = variable('%value', outType.el);
    const settle = (reject: boolean, value: HExpr): HStmt => ({ k: 'expr', e: { k: 'call', t: VOID, how: 'builtin', fn: reject ? '@promise.reject' : '@promise.resolve', recv: promise, args: [value], check: false } });
    const captures = [out, promise, index, left];
    const callback: HFunc = { name: '<all:item>', params: [{ name: item.name, t: item.t, cell: false }], ret: { k: 'promise', el: VOID }, kind: 'async', throws: false,
      captures: captures.map(v => v.name), captureTypes: captures.map(v => ({ name: v.name, t: v.t, cell: !!v.cell })), body: [
        { k: 'try', hasCatch: true, bind: '%error', bindCell: false, errorType: error, fin: [], body: [
          { k: 'let', name: value.name, t: value.t, cell: false, init: { k: 'suspend', t: value.t, what: 'await', e: item, state: 1 } },
          { k: 'expr', e: { k: 'assign', t: value.t, target: { k: 'index', t: value.t, obj: out, idx: index }, v: value } },
          { k: 'expr', e: { k: 'assign', t: I32, target: left, v: { k: 'bin', t: I32, op: '-', l: left, r: lit(I32, '1') } } },
          { k: 'if', c: { k: 'bin', t: BOOL, op: '==', l: left, r: lit(I32, '0') }, then: [settle(false, out)], else: [] },
        ], handler: [settle(true, variable('%error', error))] },
      ] };
    const body: HStmt[] = [
      { k: 'let', name: promise.name, t, cell: false, init: { k: 'call', t, how: 'builtin', fn: '@promise.pending', args: [], check: false } },
      { k: 'let', name: out.name, t: outType, cell: false, init: { k: 'alloc', t: outType, what: 'array', items: [] } },
      { k: 'let', name: count.name, t: I32, cell: false, init: { k: 'call', t: I32, how: 'builtin', fn: 'length', recv: values, args: [], check: false } },
      { k: 'let', name: left.name, t: I32, cell: true, init: count },
      { k: 'if', c: { k: 'bin', t: BOOL, op: '==', l: count, r: lit(I32, '0') }, then: [settle(false, out)], else: [] },
      { k: 'let', name: index.name, t: I32, cell: false, init: lit(I32, '0') },
      { k: 'loop', c: { k: 'bin', t: BOOL, op: '<', l: index, r: count }, body: [
        { k: 'expr', e: { k: 'call', t: I32, how: 'builtin', fn: 'push', recv: out, args: [lit(outType.el, outType.el.k === 'str' ? '""' : outType.el.k === 'bool' ? 'false' : '0')], check: false } },
        { k: 'expr', e: { k: 'call', t: callback.ret, how: 'closure', fn: callback.name, recv: { k: 'lambda', t: { k: 'fn', params: [item.t], ret: callback.ret }, fn: callback }, args: [{ k: 'index', t: item.t, obj: values, idx: index }], check: false } },
      ], step: [{ k: 'expr', e: { k: 'assign', t: I32, target: index, v: { k: 'bin', t: I32, op: '+', l: index, r: lit(I32, '1') } } }] },
      { k: 'return', e: promise },
    ];
    const fn: HFunc = { name: '<all>', params: [{ name: values.name, t: values.t, cell: false }], ret: t, kind: 'fn', captures: [], throws: false, body };
    return { k: 'call', t, how: 'closure', fn: fn.name, recv: { k: 'lambda', t: { k: 'fn', params: [values.t], ret: t }, fn }, args: [input], check: false };
  }

  ctorOf(c: ts.ClassDeclaration): ts.ConstructorDeclaration | undefined {
    for (let k: ts.ClassDeclaration | undefined = c; k; k = this.s.baseClass(k)) { const ctor = k.members.find(ts.isConstructorDeclaration); if (ctor) return ctor; }
    return undefined;
  }
  boxed(id: ts.Identifier): boolean { const sym = this.s.symbolOf(id); return !!sym && this.s.boxed.has(sym); }
  safe<T, D>(f: () => T, d: D): T | D { try { return f(); } catch (e) { if (e instanceof ZincError) return d; throw e; } }
}

const lit = (t: ZT, v: string): HExpr => ({ k: 'lit', t, v });
const oneLine = (n: ts.Node) => n.getText().replace(/\s+/g, ' ').slice(0, 60);
const isInside = (n: ts.Node, f: ts.Node) => { for (let p: ts.Node | undefined = n; p; p = p.parent) if (p === f) return true; return false; };

// ---------- printer (--emit=hir) ----------
export function typeName(t: ZT): string {
  switch (t.k) {
    case 'num': return t.m;
    case 'bool': return 'bool';
    case 'str': return 'string';
    case 'void': return 'void';
    case 'null': return 'null';
    case 'dyn': return 'Dyn';
    case 'arr': return `${typeName(t.el)}[]`;
    case 'map': return `Map<${typeName(t.key)}, ${typeName(t.val)}>`;
    case 'set': return `Set<${typeName(t.el)}>`;
    case 'obj': return ((t.decl as ts.NamedDeclaration).name?.getText() ?? 'object') + (t.args.length ? `<${t.args.map(typeName).join(', ')}>` : '');
    case 'fn': return `(${t.params.map(typeName).join(', ')}) => ${typeName(t.ret)}`;
    case 'promise': return `Promise<${typeName(t.el)}>`;
    case 'gen': return `Generator<${typeName(t.el)}>`;
    case 'tup': return `[${t.els.map(typeName).join(', ')}]`;
    case 'tp': return t.name;
  }
}
export function printExpr(h: HExpr): string {
  const P = printExpr;
  switch (h.k) {
    case 'lit': return h.v;
    case 'var': return `${h.cell ? 'cell ' : ''}${h.global ? '@' : ''}${h.name}`;
    case 'field': return `${P(h.obj)}.${h.name}`;
    case 'index': return `${P(h.obj)}[${P(h.idx)}]`;
    case 'call': return `${h.check ? 'check ' : ''}${h.how} ${h.how === 'closure' && h.recv ? P(h.recv) : (h.recv ? P(h.recv) + '.' : '') + h.fn}(${h.args.map(P).join(', ')}): ${typeName(h.t)}`;
    case 'new': return `${h.check ? 'check ' : ''}new ${h.cls}(${h.args.map(P).join(', ')})`;
    case 'bin': return `(${P(h.l)} ${h.op}:${typeName(h.t)} ${P(h.r)})`;
    case 'un': return `${h.op}(${P(h.e)})`;
    case 'conv': return `${h.how}<${typeName(h.e.t)}->${typeName(h.t)}>(${P(h.e)})`;
    case 'dyn': return `dyn.${h.op}(${h.args.map(P).join(', ')})`;
    case 'cond': return `(${P(h.c)} ? ${P(h.a)} : ${P(h.b)})`;
    case 'concat': return `concat(${h.parts.map(P).join(', ')})`;
    case 'alloc': return `alloc ${h.what} ${typeName(h.t)} {${h.items.map(i => (i.name ? i.name + ': ' : '') + P(i.v)).join(', ')}}`;
    case 'lambda': return `lambda${h.fn.captures.length ? `[${h.fn.captures.join(', ')}]` : ''}${printSig(h.fn)} ${printBlock(h.fn.body, 1).trimStart()}`;
    case 'assign': return `(${h.post ? 'post ' : ''}${P(h.target)} = ${P(h.v)})`;
    case 'suspend': return `${h.what}#${h.state}(${P(h.e)})`;
    case 'opaque': return `opaque{${h.text}}`;
  }
}
const printSig = (f: HFunc) => `(${f.params.map(p => `${p.cell ? 'cell ' : ''}${p.name}: ${typeName(p.t)}`).join(', ')}): ${typeName(f.ret)}${f.throws ? ' throws' : ''}${f.kind !== 'fn' ? ` ${f.kind} state machine` : ''}`;
function printBlock(b: HStmt[], d: number): string {
  return `{\n${b.map(x => printStmt(x, d + 1)).join('')}${'  '.repeat(d)}}`;
}
function printStmt(s: HStmt, d: number): string {
  const I = '  '.repeat(d);
  switch (s.k) {
    case 'let': return `${I}let ${s.cell ? 'cell ' : ''}${s.name}: ${typeName(s.t)}${s.init ? ' = ' + printExpr(s.init) : ''}\n`;
    case 'expr': return `${I}${s.e.k === 'assign' ? printExpr(s.e).slice(1, -1) : printExpr(s.e)}\n`;
    case 'if': return `${I}if ${printExpr(s.c)} ${printBlock(s.then, d)}${s.else.length ? ` else ${printBlock(s.else, d)}` : ''}\n`;
    case 'loop': return `${I}loop${s.c ? ' while ' + printExpr(s.c) : ''} ${printBlock(s.body, d)}${s.step.length ? ` step ${printBlock(s.step, d)}` : ''}\n`;
    case 'break': case 'continue': return `${I}${s.k}\n`;
    case 'return': return `${I}return${s.e ? ' ' + printExpr(s.e) : ''}\n`;
    case 'throw': return `${I}throw ${printExpr(s.e)}\n`;
    case 'try': return `${I}try ${printBlock(s.body, d)} catch${s.bind ? ` (${s.bind})` : ''} ${printBlock(s.handler, d)}${s.fin.length ? ` finally ${printBlock(s.fin, d)}` : ''}\n`;
    case 'opaque': return `${I}opaque{${s.text}}\n`;
  }
}
export function printHir(ms: HModule[]): string {
  const out: string[] = [];
  for (const m of ms) {
    out.push(`module ${m.file}`);
    for (const g of m.globals) out.push(printStmt(g, 1).trimEnd());
    for (const c of m.classes) {
      out.push(`  class ${c.name}${c.base ? ' extends ' + c.base : ''}${c.virtual ? ' (virtual)' : ''} {${c.fields.map(f => ` ${f.name}: ${typeName(f.t)};`).join('')} }`);
      for (const f of c.methods) out.push(`    method ${f.name}${printSig(f)} ${printBlock(f.body, 2).trimStart()}`);
    }
    for (const f of m.fns) out.push(`  fn ${f.name}${printSig(f)} ${printBlock(f.body, 1).trimStart()}`);
    if (m.init.length) out.push(`  init ${printBlock(m.init, 1).trimStart()}`);
  }
  return out.join('\n') + '\n';
}
