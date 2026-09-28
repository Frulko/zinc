// JS emitter for the `sim` target (CMP-11): TypeScript's own emit plus a transformer that applies
// Zinc numeric semantics (|0 for i32, Math.fround for f32, integer division checks) and runtime checks.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ts, ZINC_ROOT, STD_MODULES, resolveModule } from './frontend.ts';
import { Sema, type ZT, type NumKind, type DynShape, isNum, isInt, isDynFn } from './sema.ts';

const MATH_FNS = new Set(['abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan2', 'exp', 'log', 'hypot', 'min', 'max', 'fround']);

export interface JsResult { files: { path: string }[] }

export function emitJs(sema: Sema, outDir: string, assetsDir?: string, screen: [number, number] = [320, 240], resources?: string): JsResult {
  const K = ts.SyntaxKind;
  const roots = sema.fe.sources.map(s => path.dirname(s.fileName));
  const root = roots.reduce((a, b) => { while (a !== path.dirname(a) && !(b + '/').startsWith(a + '/')) a = path.dirname(a); return a; });  // stops at '/'
  // x.tsx next to x.ts (PocketJS Hero.tsx + Hero.ts) -> x.tsx.js, so both outputs coexist
  const outOf = (src: string) => path.join(outDir, path.relative(root, src).replace(/\.[cm]?tsx?$/, m => m === '.tsx' && fs.existsSync(src.slice(0, -4) + '.ts') ? '.tsx.js' : '.js'));
  const files: { path: string }[] = [];
  const simImpls = new Set<string>();

  const tf: ts.TransformerFactory<ts.SourceFile> = ctx => sf => {
    const f = ctx.factory;
    const outFile = outOf(sf.fileName);
    const paren = (e: ts.Expression) => f.createParenthesizedExpression(e);
    const num = (n: number) => f.createNumericLiteral(n);
    const bin = (a: ts.Expression, op: ts.BinaryOperator, b: ts.Expression) => f.createBinaryExpression(paren(a), op, b);
    const callZ = (name: string, args: ts.Expression[]) => f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('$z'), name), undefined, args);
    const callMath = (name: string, args: ts.Expression[]) => f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('Math'), name), undefined, args);

    /** Wrap a value computed in JS doubles into machine kind `m`. */
    const narrow = (e: ts.Expression, m: NumKind): ts.Expression => {
      switch (m) {
        case 'i32': return bin(e, K.BarToken, num(0));
        case 'u32': return bin(e, K.GreaterThanGreaterThanGreaterThanToken, num(0));
        case 'u8': return bin(e, K.AmpersandToken, num(255));
        case 'u16': return bin(e, K.AmpersandToken, num(65535));
        case 'i8': return bin(bin(e, K.LessThanLessThanToken, num(24)), K.GreaterThanGreaterThanToken, num(24));
        case 'i16': return bin(bin(e, K.LessThanLessThanToken, num(16)), K.GreaterThanGreaterThanToken, num(16));
        case 'f32': return callMath('fround', [e]);
        case 'fx12': return callZ('fx', [e, num(12)]);
        case 'fx16': return callZ('fx', [e, num(16)]);
        default: return e;  // f64; ponytail: i64/u64/isize/usize are plain doubles in sim
      }
    };
    /** DYN-07: the same checked conversion as the C++ emitter (sema.dynShape), done by $z.dto. */
    const shapeExpr = (sh: DynShape): ts.Expression => {
      switch (sh.k) {
        case 'a': return f.createArrayLiteralExpression([f.createStringLiteral('a'), shapeExpr(sh.el)]);
        case 'c': return f.createArrayLiteralExpression([f.createStringLiteral('c'), f.createStringLiteral(sh.name)]);
        case 'o': return f.createArrayLiteralExpression([f.createStringLiteral('o'), f.createStringLiteral(sh.name), f.createArrayLiteralExpression(sh.fields.map(x =>
          f.createArrayLiteralExpression([f.createStringLiteral(x.name), shapeExpr(x.shape), x.opt ? f.createTrue() : f.createFalse()])))]);
        default: return f.createStringLiteral(sh.k);
      }
    };
    const fromDyn = (e: ts.Expression, at: ts.Node, to: ZT): ts.Expression => {
      const r = callZ('dto', [e, shapeExpr(sema.dynShape(to, at))]);
      return isNum(to) && to.m !== 'f64' ? narrow(r, to.m) : r;
    };
    const conv = (e: ts.Expression, orig: ts.Expression, to: ZT | undefined): ts.Expression => {
      // `c ? f64 : 0` converts per branch, like the C++ side
      if (ts.isConditionalExpression(orig) && ts.isConditionalExpression(e))
        return f.updateConditionalExpression(e, e.condition, e.questionToken, conv(e.whenTrue, orig.whenTrue, to), e.colonToken, conv(e.whenFalse, orig.whenFalse, to));
      if (to && to.k !== 'dyn' && safeType(orig)?.k === 'dyn') return fromDyn(e, orig, to);
      // a typed function passed as DynFunction: $z.dynfn converts the Dyn arguments like the C++ adapter
      if (to && isDynFn(to)) {
        const from = safeType(orig);
        if (from?.k === 'fn' && !isDynFn(from)) return callZ('dynfn', [e, f.createArrayLiteralExpression(from.params.map(p => f.createStringLiteral(p.k === 'num' ? p.m : p.k)))]);
      }
      if (!to || !isNum(to)) return e;
      const from = safeType(orig);
      if (!from || !isNum(from) || from.m === to.m) return e;
      if (isInt(to.m) && sema.isIntLiteral(orig)) return e;
      if (to.m === 'f64' || (isInt(from.m) && to.m === 'f32')) return e;
      if (isInt(to.m) && (from.m === 'fx12' || from.m === 'fx16')) return narrow(e, to.m);
      if (isInt(from.m) && isInt(to.m) && to.m === 'i32' && (from.m === 'i8' || from.m === 'i16' || from.m === 'u8' || from.m === 'u16')) return e;
      return narrow(e, to.m);
    };
    const safeType = (e: ts.Expression): ZT | undefined => { try { return sema.ztypeOf(e); } catch { return undefined; } };
    const paramTypes = (call: ts.CallExpression | ts.NewExpression): (ZT | undefined)[] => {
      const d = ts.isNewExpression(call) ? sema.declOf(call.expression) : ts.isPropertyAccessExpression(call.expression) ? sema.declOf(call.expression.name) : sema.declOf(call.expression);
      if (!d) return [];
      if (ts.isClassDeclaration(d)) {
        let c: ts.ClassDeclaration | undefined = d, ctor: ts.ConstructorDeclaration | undefined;
        while (c && !(ctor = c.members.find(ts.isConstructorDeclaration))) c = sema.baseClass(c);
        return ctor ? ctor.parameters.map(p => sema.paramType(p)) : [];
      }
      if ((ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d) || ts.isMethodSignature(d)) && !sema.isLib(d)) return d.parameters.map(p => sema.paramType(p));
      if (ts.isPropertyAccessExpression(call.expression)) {
        const rt = safeType(call.expression.expression), m = call.expression.name.text;
        if (rt?.k === 'arr' && ['push', 'unshift', 'indexOf', 'lastIndexOf', 'includes', 'fill'].includes(m)) return [rt.el];
        if (rt?.k === 'map' && m === 'set') return [rt.key, rt.val];
        if (rt?.k === 'set' && m === 'add') return [rt.el];
      }
      return [];
    };
    const posOf = (n: ts.Node) => [f.createStringLiteral(path.relative(process.cwd(), sf.fileName)), num(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1)];

    const FX = sema.numberKind === 'fx12' || sema.numberKind === 'fx16';
    const FXB = sema.numberKind === 'fx16' ? 16 : 12;
    /** quantize a runtime double into the fixed-point `number` of the profile */
    const fxq = (e: ts.Expression) => FX ? callZ('fx', [e, num(FXB)]) : e;
    /** Same decision as the C++ emitter's `want`: is this literal a fixed-point number here? */
    const literalIsFx = (lit: ts.Expression): boolean => {
      let e: ts.Node = lit;
      while (ts.isParenthesizedExpression(e.parent) || (ts.isPrefixUnaryExpression(e.parent) && e.parent.operator === K.MinusToken)) e = e.parent;
      const p = e.parent;
      const isFxT = (t: ZT | undefined) => !t || (isNum(t) ? t.m === 'fx12' || t.m === 'fx16' || t.m === 'f32' : true);
      try {
        if (ts.isVariableDeclaration(p) && p.initializer === e) return isFxT(sema.declType(p));
        if (ts.isBinaryExpression(p)) {
          if (p.operatorToken.kind === K.EqualsToken) return isFxT(sema.ztypeOf(p.left));
          const other = p.left === e ? p.right : p.left;
          const ot = sema.ztypeOf(other);
          if (isNum(ot) && isInt(ot.m) && [K.PlusToken, K.MinusToken, K.AsteriskToken, K.PercentToken, K.LessThanToken, K.GreaterThanToken, K.LessThanEqualsToken, K.GreaterThanEqualsToken, K.EqualsEqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.AmpersandToken, K.BarToken, K.CaretToken, K.LessThanLessThanToken, K.GreaterThanGreaterThanToken, K.GreaterThanGreaterThanGreaterThanToken, K.QuestionQuestionToken].includes(p.operatorToken.kind)) return false;
        }
        if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(e as ts.Expression)) {
          const i = p.arguments.indexOf(e as ts.Expression);
          const ps = paramTypes(p);
          if (ps[i]) return isFxT(ps[i]);
          const d = ts.isPropertyAccessExpression(p.expression) ? sema.declOf(p.expression.name) : sema.declOf(p.expression);
          const prm = d && (ts.isFunctionDeclaration(d) || ts.isMethodSignature(d) || ts.isMethodDeclaration(d)) ? d.parameters[i] : undefined;
          if (prm?.type) return isFxT(sema.fromTypeNode(prm.type));
          return true;
        }
        if (ts.isElementAccessExpression(p) && p.argumentExpression === e) return false;
        if (ts.isConditionalExpression(p) && p.condition !== e) return isFxT(safeType(p));  // `c ? i32 : 0xffffff` is an i32
        if (ts.isReturnStatement(p)) { const fn = sema.fnOf(p) as ts.SignatureDeclaration | undefined; return !fn || isFxT(safeRet(fn)); }
        if (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) { const t = safeType(ts.isPropertyAssignment(p) ? p.initializer : p.initializer!); void t; }
        if (ts.isArrayLiteralExpression(p)) { const t = sema.contextual(p) ?? safeType(p); return !t || t.k !== 'arr' || isFxT(t.el); }
      } catch { /* fall back to the profile number */ }
      return true;
    };
    const visit = (n: ts.Node): ts.Node => {
      if (FX && ts.isNumericLiteral(n) && literalIsFx(n)) { const q = (Math.floor(Number(n.text) * (1 << FXB) + 0.5) | 0) / (1 << FXB); return q < 0 ? f.createPrefixUnaryExpression(K.MinusToken, num(-q)) : num(q); }
      // f32 profile: a literal typed `number` is a float, like the C++ `1.5f`
      if (sema.numberKind === 'f32' && ts.isNumericLiteral(n) && literalIsFx(n)) { const q = Math.fround(Number(n.text)); if (q !== Number(n.text)) return num(q); }
      if (FX && ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Math' && (n.name.text === 'PI' || n.name.text === 'E')) return fxq(n);
      // module specifiers: zinc:gfx -> sim shim, relative -> .js
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        let ns = spec;
        const mapped = STD_MODULES[spec] ?? sema.fe.program.getCompilerOptions().paths?.[spec]?.[0];  // std + plugins
        if (mapped) ns = rel(outFile, outOf(mapped));
        else if (spec.startsWith('zinc:')) ns = rel(outFile, path.join(ZINC_ROOT, `sim/${spec.slice(5)}.mjs`));
        else if (spec.startsWith('.') && /\.spec(\.ts)?$/.test(spec)) {
          const src = path.resolve(path.dirname(sf.fileName), spec.replace(/\.ts$/, '')).replace(/\.spec$/, '.sim.ts');
          simImpls.add(src);
          ns = spec.replace(/\.spec(\.ts)?$/, '.sim.js');
        }
        else if (spec.startsWith('.')) {
          const res = resolveModule(spec, sf.fileName, sema.fe.program.getCompilerOptions(), ts.sys)?.resolvedFileName;
          ns = res && !res.endsWith('.d.ts') ? rel(outFile, outOf(res)) : spec.replace(/\.[cm]?tsx?$/, '') + '.js';
        }
        if (ts.isImportDeclaration(n)) return f.updateImportDeclaration(n, n.modifiers, n.importClause, f.createStringLiteral(ns), n.attributes);
        return f.updateExportDeclaration(n, n.modifiers, n.isTypeOnly, n.exportClause, f.createStringLiteral(ns), n.attributes);
      }
      const v = ts.visitEachChild(n, visit, ctx);
      if (ts.isCallExpression(n) && ts.isCallExpression(v)) {
        const c = n.expression;
        if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression)) {
          const g = c.expression.text, m = c.name.text;
          const lib = !sema.declOf(c.expression) || sema.isLib(sema.declOf(c.expression)!);
          if (lib && g === 'console') return callZ('c_' + m, [...v.arguments]);
          // clocks and timers go through the shim: deterministic runs put them on the virtual clock (sim/zinc.mjs)
          if (lib && (g === 'Date' || g === 'performance') && m === 'now') return fxq(callZ(g === 'Date' ? 'dateNow' : 'perfNow', []));
          if (lib && g === 'Math' && m === 'random') return fxq(callZ('random', []));
          if (lib && g === 'Math' && m === 'seed') return callZ('seed', [...v.arguments]);
          if (lib && g === 'JSON' && m === 'parse') return callZ('jsonParse', [...v.arguments]);
          if (lib && g === 'Math' && FX && MATH_FNS.has(m)) return f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('$z'), 'fxm'), m), undefined, [num(FXB), ...v.arguments]);
          // f32 profile: the result is rounded to f32, like the C++ side (zrt::math in double, then the profile's number)
          if (lib && g === 'Math' && sema.numberKind === 'f32' && MATH_FNS.has(m) && m !== 'fround') return callMath('fround', [v]);
        }
        if (ts.isPropertyAccessExpression(c) && (c.name.text === 'keys' || c.name.text === 'values')) {
          const rt = safeType(c.expression);
          if (rt?.k === 'map' || rt?.k === 'set') return f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('Array'), 'from'), undefined, [v]);
        }
        if (ts.isIdentifier(c) && /^(setTimeout|setInterval|clearTimeout|clearInterval)$/.test(c.text) && (!sema.declOf(c) || sema.isLib(sema.declOf(c)!))) return callZ(c.text, [...v.arguments]);
        if (FX && ts.isIdentifier(c) && (c.text === 'parseInt' || c.text === 'parseFloat')) return fxq(v);
        // numbers coming back from native code (spec methods, zinc:* modules) cross as f64 and are converted to the
        // profile's number at the boundary, like the C++ side does
        if (FX || sema.numberKind === 'f32') {
          const cd = sema.declOf(ts.isPropertyAccessExpression(c) ? c.name : c);
          const native = cd && ((ts.isMethodSignature(cd) && cd.getSourceFile().fileName.endsWith('.spec.ts')) || (ts.isFunctionDeclaration(cd) && !!sema.libModule(cd)));
          const rt = native ? sema.retOf(cd as ts.SignatureDeclaration) : undefined;
          if (rt && rt.k === 'num' && rt.m === sema.numberKind) {
            const ps0 = paramTypes(n);
            const call = ps0.length ? f.updateCallExpression(v, v.expression, v.typeArguments, v.arguments.map((a, i) => conv(a, n.arguments[i], ps0[i]))) : v;
            return FX ? fxq(call) : callMath('fround', [call]);
          }
        }
        const ps = paramTypes(n);
        if (ps.length) return f.updateCallExpression(v, v.expression, v.typeArguments, v.arguments.map((a, i) => conv(a, n.arguments[i], ps[i])));
        return v;
      }
      if (ts.isNewExpression(n) && ts.isNewExpression(v)) {
        const ps = paramTypes(n);
        if (ps.length && v.arguments) return f.updateNewExpression(v, v.expression, v.typeArguments, v.arguments.map((a, i) => conv(a, n.arguments![i], ps[i])));
        return v;
      }
      if (ts.isVariableDeclaration(n) && ts.isVariableDeclaration(v) && v.initializer && n.initializer && ts.isIdentifier(n.name))
        return f.updateVariableDeclaration(v, v.name, v.exclamationToken, v.type, conv(v.initializer, n.initializer, sema.declType(n)));
      if (ts.isPropertyDeclaration(n) && ts.isPropertyDeclaration(v) && v.initializer && n.initializer)
        return f.updatePropertyDeclaration(v, v.modifiers, v.name, v.questionToken ?? v.exclamationToken, v.type, conv(v.initializer, n.initializer, sema.declType(n)));
      if (ts.isReturnStatement(n) && ts.isReturnStatement(v) && v.expression && n.expression) {
        const fn = sema.fnOf(n) as ts.SignatureDeclaration | undefined;
        if (fn && !ts.isConstructorDeclaration(fn)) return f.updateReturnStatement(v, conv(v.expression, n.expression, safeRet(fn)));
        return v;
      }
      if (ts.isArrowFunction(n) && ts.isArrowFunction(v) && !ts.isBlock(n.body))
        return f.updateArrowFunction(v, v.modifiers, v.typeParameters, v.parameters, v.type, v.equalsGreaterThanToken, conv(v.body as ts.Expression, n.body, safeRet(n)));
      if (ts.isArrayLiteralExpression(n) && ts.isArrayLiteralExpression(v)) {
        const ctxT = sema.contextual(n) ?? safeType(n);
        if (ctxT?.k === 'arr') return f.updateArrayLiteralExpression(v, v.elements.map((x, i) => conv(x, n.elements[i], ctxT.el)));
        return v;
      }
      // Dyn: checked conversions where the C++ emitter converts too
      if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && n.type.getText() !== 'const' && safeType(n.expression)?.k === 'dyn') {
        const to = sema.fromTypeNode(n.type);
        if (to.k !== 'dyn') return fromDyn((v as ts.AsExpression).expression, n, to);
      }
      if (ts.isPropertyAssignment(n) && ts.isPropertyAssignment(v) && safeType(n.initializer)?.k === 'dyn') {
        const to = sema.contextual(n.initializer);
        if (to && to.k !== 'dyn') return f.updatePropertyAssignment(v, v.name, fromDyn(v.initializer, n.initializer, to));
      }
      if (ts.isForOfStatement(n) && ts.isForOfStatement(v) && safeType(n.expression)?.k === 'dyn')
        return f.updateForOfStatement(v, v.awaitModifier, v.initializer, callZ('diter', [v.expression]), v.statement);
      if (ts.isElementAccessExpression(n) && ts.isElementAccessExpression(v) && safeType(n.expression)?.k === 'arr' && !sema.isWrite(n) && !isAssignTarget(n))
        return callZ('get', [v.expression, v.argumentExpression]);
      if (ts.isBinaryExpression(n) && ts.isBinaryExpression(v)) return binary(n, v);
      return v;
    };
    const isAssignTarget = (n: ts.Node) => ts.isBinaryExpression(n.parent) && n.parent.left === n && n.parent.operatorToken.kind >= K.FirstAssignment && n.parent.operatorToken.kind <= K.LastAssignment;
    const safeRet = (fn: ts.SignatureDeclaration): ZT | undefined => { try { return sema.retOf(fn); } catch { return undefined; } };

    const binary = (n: ts.BinaryExpression, v: ts.BinaryExpression): ts.Expression => {
      const op = n.operatorToken.kind;
      if (op === K.EqualsToken && ts.isElementAccessExpression(n.left) && safeType(n.left.expression)?.k === 'dyn') {
        const l = v.left as ts.ElementAccessExpression;
        return callZ('dseti', [l.expression, l.argumentExpression, v.right]);  // same hole rule as the runtime
      }
      if (op > K.FirstAssignment && op <= K.LastAssignment && safeType(n.right)?.k === 'dyn') {
        const lt = safeType(n.left);
        if (lt && isNum(lt)) v = f.updateBinaryExpression(v, v.left, v.operatorToken, fromDyn(v.right, n.right, lt));
      }
      if (op === K.EqualsToken) {
        if (ts.isElementAccessExpression(n.left) && safeType(n.left.expression)?.k === 'arr') {
          const l = v.left as ts.ElementAccessExpression;
          const at = safeType(n.left.expression) as Extract<ZT, { k: 'arr' }>;
          return callZ('set', [l.expression, l.argumentExpression, conv(v.right, n.right, at.el)]);
        }
        return f.updateBinaryExpression(v, v.left, v.operatorToken, conv(v.right, n.right, safeType(n.left)));
      }
      const t = safeType(n);
      if (op > K.FirstAssignment && op <= K.LastAssignment) {
        const lt = safeType(n.left);
        if (!lt || !isNum(lt) || lt.m === 'f64') return v;
        const baseOp = ({ [K.PlusEqualsToken]: K.PlusToken, [K.MinusEqualsToken]: K.MinusToken, [K.AsteriskEqualsToken]: K.AsteriskToken, [K.SlashEqualsToken]: K.SlashToken, [K.PercentEqualsToken]: K.PercentToken } as Record<number, ts.BinaryOperator>)[op];
        if (baseOp === undefined) return v;
        const rt = safeType(n.right)!;
        const m = sema.arith(baseOp, n.left, lt, n.right, rt);
        const leftRead = visit(n.left) as ts.Expression;
        const val = arith(baseOp, n.left, n.right, leftRead, v.right, m);
        return f.createAssignment(v.left, conv(val, n, lt) === val ? narrowTo(val, m, lt.m) : val);
      }
      if (!t || !isNum(t)) return v;
      return arith(op, n.left, n.right, v.left, v.right, t.m) ?? v;
    };
    const narrowTo = (e: ts.Expression, from: NumKind, to: NumKind) => from === to || to === 'f64' ? e : narrow(e, to);
    const arith = (op: ts.SyntaxKind, lo: ts.Expression, ro: ts.Expression, l: ts.Expression, r: ts.Expression, m: NumKind): ts.Expression => {
      const lt = safeType(lo), rt = safeType(ro);
      const bothInt = !!lt && !!rt && isNum(lt) && isNum(rt) && isInt(lt.m) && isInt(rt.m);
      if (m === 'fx12' || m === 'fx16') {
        const b = num(m === 'fx16' ? 16 : 12);
        switch (op) {
          case K.SlashToken: return callZ('fxdiv', [l, r, b]);
          case K.AsteriskToken: return callZ('fxmul', [l, r, b]);
          case K.PercentToken: return callZ('fxmod', [l, r, b]);
          case K.PlusToken: case K.MinusToken: return callZ('fx', [f.createBinaryExpression(l, op, r), b]);
        }
      }
      switch (op) {
        case K.SlashToken: return bothInt ? callZ('idiv', [l, r]) : m === 'f32' ? callMath('fround', [f.createBinaryExpression(l, K.SlashToken, r)]) : f.createBinaryExpression(l, K.SlashToken, r);
        case K.PercentToken: return isInt(m) ? callZ('imod', [l, r]) : narrow(f.createBinaryExpression(l, K.PercentToken, r), m);
        case K.AsteriskToken:
          if (m === 'i32') return callMath('imul', [l, r]);
          if (m === 'u32') return bin(callMath('imul', [l, r]), K.GreaterThanGreaterThanGreaterThanToken, num(0));
          return narrow(f.createBinaryExpression(l, K.AsteriskToken, r), m);
        case K.PlusToken: case K.MinusToken:
          return narrow(f.createBinaryExpression(l, op, r), m);
      }
      return f.createBinaryExpression(l, op as ts.BinaryOperator, r);
    };
    return ts.visitNode(sf, visit) as ts.SourceFile;
  };

  fs.mkdirSync(outDir, { recursive: true });
  for (const s of sema.fe.sources) {
    const r = sema.fe.program.emit(s, (fileName, text) => {
      if (!fileName.endsWith('.js')) return;
      const out = outOf(s.fileName);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, text);
      files.push({ path: out });
    }, undefined, false, { before: [tf] });
    if (!r.emitSkipped) continue;
    // TS blocks emit for x.ts + x.tsx (same output name): transform, print and strip types ourselves
    const tr = ts.transform(s, [tf], sema.fe.program.getCompilerOptions());
    const js = ts.transpileModule(ts.createPrinter().printFile(tr.transformed[0] as ts.SourceFile), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false } }).outputText;
    tr.dispose();
    const out = outOf(s.fileName);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, js);
    files.push({ path: out });
  }
  // NAT-09: sim implementations of native modules (native/<name>.sim.ts), transpiled on their own
  for (const src of simImpls) {
    if (!fs.existsSync(src)) throw new Error(`missing sim implementation ${path.relative(process.cwd(), src)}`);
    const out = ts.transpileModule(fs.readFileSync(src, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace(/from '(\.[^']+?)(\.ts)?'/g, (_m, p) => `from '${p}.js'`)
      .replace(/from 'zinc:([a-z]+)'/g, (_m, mod) => `from '${rel(outOf(src), path.join(ZINC_ROOT, `sim/${mod}.mjs`))}'`);
    fs.mkdirSync(path.dirname(outOf(src)), { recursive: true });
    fs.writeFileSync(outOf(src), out);
  }
  fs.writeFileSync(path.join(outDir, 'package.json'), '{ "type": "module" }\n');
  if (resources) fs.writeFileSync(path.join(outDir, 'resources.json'), resources);
  const entryJs = './' + path.relative(outDir, outOf(sema.fe.entry.fileName));
  fs.writeFileSync(path.join(outDir, 'run.mjs'),
    `// Generated by zinc. Runs the program under Node with the Zinc sim shim.\nglobalThis.$zScreen = [${screen[0]}, ${screen[1]}];\n${resources ? `globalThis.$zRes = JSON.parse((await import('node:fs')).readFileSync(new URL('./resources.json', import.meta.url), 'utf8'));\n` : ''}${assetsDir ? `globalThis.$zAssetsDir = new URL(${JSON.stringify(path.relative(outDir, assetsDir) + '/')}, import.meta.url).pathname;\n` : ''}import { runMain } from '${rel(path.join(outDir, 'run.mjs'), path.join(ZINC_ROOT, 'sim/zinc.mjs'))}';\nawait runMain(() => import('${entryJs}'));\n`);
  return { files };
}

function rel(fromFile: string, to: string): string {
  const r = path.relative(path.dirname(fromFile), to);
  return r.startsWith('.') ? r : './' + r;
}
