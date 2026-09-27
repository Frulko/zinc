// JS emitter for the `sim` target (CMP-11): TypeScript's own emit plus a transformer that applies
// Zinc numeric semantics (|0 for i32, Math.fround for f32, integer division checks) and runtime checks.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ts, ZINC_ROOT } from './frontend.ts';
import { Sema, type ZT, type NumKind, isNum, isInt } from './sema.ts';

export interface JsResult { files: { path: string }[] }

export function emitJs(sema: Sema, outDir: string): JsResult {
  const K = ts.SyntaxKind;
  const roots = sema.fe.sources.map(s => path.dirname(s.fileName));
  const root = roots.reduce((a, b) => { while (!(b + '/').startsWith(a + '/')) a = path.dirname(a); return a; });
  const outOf = (src: string) => path.join(outDir, path.relative(root, src).replace(/\.[cm]?tsx?$/, '.js'));
  const files: { path: string }[] = [];

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
        default: return e;  // f64; ponytail: i64/u64/isize/usize are plain doubles in sim
      }
    };
    const conv = (e: ts.Expression, orig: ts.Expression, to: ZT | undefined): ts.Expression => {
      if (!to || !isNum(to)) return e;
      const from = safeType(orig);
      if (!from || !isNum(from) || from.m === to.m) return e;
      if (isInt(to.m) && sema.isIntLiteral(orig)) return e;
      if (to.m === 'f64' || (isInt(from.m) && to.m === 'f32')) return e;
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
        if (rt?.k === 'arr' && ['push', 'unshift', 'indexOf', 'includes', 'fill'].includes(m)) return [rt.el];
        if (rt?.k === 'map' && m === 'set') return [rt.key, rt.val];
        if (rt?.k === 'set' && m === 'add') return [rt.el];
      }
      return [];
    };
    const posOf = (n: ts.Node) => [f.createStringLiteral(path.relative(process.cwd(), sf.fileName)), num(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1)];

    const visit = (n: ts.Node): ts.Node => {
      // module specifiers: zinc:gfx -> sim shim, relative -> .js
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        let ns = spec;
        if (spec === 'zinc:gfx') ns = rel(outFile, path.join(ZINC_ROOT, 'sim/gfx.mjs'));
        else if (spec.startsWith('.')) ns = spec.replace(/\.[cm]?tsx?$/, '') + '.js';
        if (ts.isImportDeclaration(n)) return f.updateImportDeclaration(n, n.modifiers, n.importClause, f.createStringLiteral(ns), n.attributes);
        return f.updateExportDeclaration(n, n.modifiers, n.isTypeOnly, n.exportClause, f.createStringLiteral(ns), n.attributes);
      }
      if (ts.isThrowStatement(n)) {
        const e = n.expression;
        let msg: ts.Expression = f.createStringLiteral('Error');
        if (ts.isNewExpression(e) && e.arguments?.length) msg = f.createBinaryExpression(f.createStringLiteral(e.expression.getText() + ': '), K.PlusToken, visit(e.arguments[0]) as ts.Expression);
        else if (safeType(e)?.k === 'str') msg = visit(e) as ts.Expression;
        return f.createExpressionStatement(callZ('panic', [msg, ...posOf(n)]));
      }
      const v = ts.visitEachChild(n, visit, ctx);
      if (ts.isCallExpression(n) && ts.isCallExpression(v)) {
        const c = n.expression;
        if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression)) {
          const g = c.expression.text, m = c.name.text;
          const lib = !sema.declOf(c.expression) || sema.isLib(sema.declOf(c.expression)!);
          if (lib && g === 'console' && m === 'log') return callZ('log', [...v.arguments]);
          if (lib && g === 'Math' && (m === 'random' || m === 'seed')) return callZ(m, [...v.arguments]);
        }
        if (ts.isPropertyAccessExpression(c) && (c.name.text === 'keys' || c.name.text === 'values')) {
          const rt = safeType(c.expression);
          if (rt?.k === 'map' || rt?.k === 'set') return f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('Array'), 'from'), undefined, [v]);
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
      if (ts.isElementAccessExpression(n) && ts.isElementAccessExpression(v) && safeType(n.expression)?.k === 'arr' && !sema.isWrite(n) && !isAssignTarget(n))
        return callZ('get', [v.expression, v.argumentExpression]);
      if (ts.isBinaryExpression(n) && ts.isBinaryExpression(v)) return binary(n, v);
      return v;
    };
    const isAssignTarget = (n: ts.Node) => ts.isBinaryExpression(n.parent) && n.parent.left === n && n.parent.operatorToken.kind >= K.FirstAssignment && n.parent.operatorToken.kind <= K.LastAssignment;
    const safeRet = (fn: ts.SignatureDeclaration): ZT | undefined => { try { return sema.retOf(fn); } catch { return undefined; } };

    const binary = (n: ts.BinaryExpression, v: ts.BinaryExpression): ts.Expression => {
      const op = n.operatorToken.kind;
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
  const r = sema.fe.program.emit(undefined, (fileName, text) => {
    const src = fileName.replace(/\.js$/, '');
    const s = sema.fe.sources.find(x => x.fileName.replace(/\.[cm]?tsx?$/, '') === src);
    if (!s) return;
    const out = outOf(s.fileName);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    files.push({ path: out });
  }, undefined, false, { before: [tf] });
  if (r.emitSkipped) throw new Error('sim emit failed');
  fs.writeFileSync(path.join(outDir, 'package.json'), '{ "type": "module" }\n');
  const entryJs = './' + path.relative(outDir, outOf(sema.fe.entry.fileName));
  fs.writeFileSync(path.join(outDir, 'run.mjs'),
    `// Generated by zinc. Runs the program under Node with the Zinc sim shim.\nimport { runMain } from '${rel(path.join(outDir, 'run.mjs'), path.join(ZINC_ROOT, 'sim/zinc.mjs'))}';\nawait runMain(() => import('${entryJs}'));\n`);
  return { files };
}

function rel(fromFile: string, to: string): string {
  const r = path.relative(path.dirname(fromFile), to);
  return r.startsWith('.') ? r : './' + r;
}
