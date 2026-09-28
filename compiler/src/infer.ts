// zinc infer (DYN-11): static types for the Dyn sites of a JavaScript (or `any`-typed TypeScript) program.
// Sources of inference, in order: the TypeScript checker (allowJs/checkJs, JSDoc), the shape of object literals
// per allocation site (plus `p.k = v` added right after), and usage over the whole program (call sites, fields read).
// What cannot be typed stays `any`, i.e. Dyn in the gradual profile, and is listed in the report.
// ponytail: no runtime profiling under sim (4th source of DYN-11) and no function specialisation (DYN-12).
import * as path from 'node:path';
import { ts, loadProgram, ZINC_ROOT } from './frontend.ts';

export interface InferSite { file: string; line: number; col: number; what: string; type?: string; note: string }
export interface InferResult { files: Map<string, string>; sites: InferSite[] }

interface AllocSite {
  decl: ts.VariableDeclaration; lit: ts.ObjectLiteralExpression; name: string;
  fields: Map<string, string>;
  /** `p.k = v` statements after the declaration: moved into the literal when adjacent, else optional fields */
  added: { stmt: ts.ExpressionStatement; name: string; type: string; move: boolean }[];
  base?: string; used: boolean;
}
interface Edit { pos: number; end: number; text: string }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function infer(entry: string): InferResult {
  const fe = loadProgram(entry);
  const checker = fe.checker;
  const lib = path.join(ZINC_ROOT, 'lib') + path.sep;
  const sources = fe.sources.filter(s => !s.fileName.startsWith(lib));
  const edits = new Map<ts.SourceFile, Edit[]>();
  const decls = new Map<ts.SourceFile, string[]>();  // interfaces to add at the top
  const sites: InferSite[] = [];
  const edit = (n: ts.Node, pos: number, end: number, text: string) => { const sf = n.getSourceFile(); edits.set(sf, [...(edits.get(sf) ?? []), { pos, end, text }]); };
  const site = (n: ts.Node, what: string, type: string | undefined, note: string) => {
    const sf = n.getSourceFile(), lc = sf.getLineAndCharacterOfPosition(n.getStart());
    sites.push({ file: path.relative(process.cwd(), sf.fileName), line: lc.line + 1, col: lc.character + 1, what, type, note });
  };
  const symOf = (n: ts.Node) => checker.getSymbolAtLocation(n);
  const isAny = (t: ts.Type) => !!(t.flags & ts.TypeFlags.Any);
  const typeStr = (t: ts.Type): string | undefined => {
    if (isAny(t) || t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return undefined;
    const s = checker.typeToString(checker.getBaseTypeOfLiteralType(t), undefined, ts.TypeFormatFlags.NoTruncation);
    return /\bany\b/.test(s) ? undefined : s;
  };
  const walk = (n: ts.Node, f: (n: ts.Node) => void) => { f(n); ts.forEachChild(n, c => walk(c, f)); };

  // 1. allocation sites: `const p = { ... }` (+ `p.k = v` statements after it)
  const allocs = new Map<ts.Symbol, AllocSite>();
  for (const sf of sources) walk(sf, n => {
    if (!ts.isVariableDeclaration(n) || n.type || !ts.isIdentifier(n.name) || !n.initializer || !ts.isObjectLiteralExpression(n.initializer)) return;
    const lit = n.initializer;
    if (!lit.properties.every(p => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name))) return;
    const fields = new Map<string, string>();
    for (const p of lit.properties) {
      const t = typeStr(checker.getTypeAtLocation(ts.isPropertyAssignment(p) ? p.initializer : (p as ts.ShorthandPropertyAssignment).name));
      if (!t) return;
      fields.set(p.name!.getText(), t);
    }
    const sym = symOf(n.name)!;
    const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    const a: AllocSite = { decl: n, lit, name: `Site${line}`, fields, added: [], used: false };
    const stmt = n.parent.parent;
    const block = stmt.parent as ts.Block | ts.SourceFile;
    let adjacent = true;
    for (const s of block.statements.slice(block.statements.indexOf(stmt as ts.Statement) + 1)) {
      const e = ts.isExpressionStatement(s) ? s.expression : undefined;
      if (e && ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(e.left) &&
        ts.isIdentifier(e.left.expression) && symOf(e.left.expression) === sym && !fields.has(e.left.name.text)) {
        const t = typeStr(checker.getTypeAtLocation(e.right));
        const self = (() => { let r = false; walk(e.right, x => { if (ts.isIdentifier(x) && symOf(x) === sym) r = true; }); return r; })();
        if (t && !a.added.some(x => x.name === e.left.getText())) { a.added.push({ stmt: s as ts.ExpressionStatement, name: (e.left as ts.PropertyAccessExpression).name.text, type: t, move: adjacent && !self }); continue; }
      }
      adjacent = false;
    }
    allocs.set(sym, a);
  });
  const allocOf = (e: ts.Expression) => ts.isIdentifier(e) ? allocs.get(symOf(e)!) : undefined;

  // 2. untyped (or `any`) parameters: whole-program usage
  const calls: (ts.CallExpression | ts.NewExpression)[] = [];
  for (const sf of sources) walk(sf, n => { if (ts.isCallExpression(n) || ts.isNewExpression(n)) calls.push(n); });
  const shapes = new Map<string, string>();  // "x: number; y: number" -> interface name
  const shapeFields = new Map<string, string[]>();
  for (const sf of sources) walk(sf, n => {
    if (!ts.isParameter(n) || !ts.isIdentifier(n.name) || n.dotDotDotToken) return;
    const fn = n.parent as ts.SignatureDeclaration;
    if (!ts.isFunctionLike(fn) || (n.type && n.type.kind !== ts.SyntaxKind.AnyKeyword) || (!n.type && !isAny(checker.getTypeAtLocation(n)))) return;
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && checker.getContextualType(fn)) return;  // callback: typed by its context
    const idx = fn.parameters.indexOf(n);
    const sym = symOf(n.name)!;
    const args = calls.filter(c => checker.getResolvedSignature(c)?.declaration === fn).map(c => c.arguments?.[idx]).filter((a): a is ts.Expression => !!a);
    const reads = new Set<string>();
    let numeric = false;
    walk((fn as ts.FunctionLikeDeclaration).body ?? fn, x => {
      if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression) && symOf(x.expression) === sym) reads.add(x.name.text);
      if (ts.isIdentifier(x) && symOf(x) === sym && ts.isBinaryExpression(x.parent) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken].includes(x.parent.operatorToken.kind)) numeric = true;
    });
    const set = (type: string, note: string) => { site(n, `param ${n.name.getText()}`, type, note); n.type ? edit(n, n.type.getStart(), n.type.end, type) : edit(n, n.name.end, n.name.end, `: ${type}`); };
    const leave = (note: string) => { site(n, `param ${n.name.getText()}`, undefined, note); if (!n.type && isJs(n)) edit(n, n.name.end, n.name.end, ': any'); };
    const nCalls = `${args.length} call site${args.length === 1 ? '' : 's'}`;
    if (!args.length) return numeric ? set('number', 'arithmetic in the body, no call site') : leave('no call site');
    const objArgs = args.every(a => allocOf(a) || ts.isObjectLiteralExpression(a) || (checker.getTypeAtLocation(a).flags & ts.TypeFlags.Object && !checker.isArrayLikeType(checker.getTypeAtLocation(a))));
    if (objArgs && reads.size) {
      // an interface with the fields the function reads; allocation sites passed here extend it (same field positions, DYN-13)
      const fields: string[] = [];
      for (const r of reads) {
        const ts_ = new Set(args.map(a => {
          const al = allocOf(a);
          if (al) return al.fields.get(r) ?? al.added.find(x => x.name === r)?.type;
          const p = checker.getTypeAtLocation(a).getProperty(r);
          return p ? typeStr(checker.getTypeOfSymbolAtLocation(p, a)) : undefined;
        }));
        const t = [...ts_][0];
        if (ts_.size !== 1 || !t) return leave(`field '${r}' has no single type over ${nCalls}`);
        fields.push(`${r}: ${t}`);
      }
      if (args.some(a => ts.isObjectLiteralExpression(a) && a.properties.length !== reads.size)) return leave('an object literal argument has fields the function does not read');
      const key = fields.join('; ');
      let name = shapes.get(key);
      if (!name) {
        name = cap((fn.name as ts.Identifier | undefined)?.text ?? 'Fn') + cap(n.name.text);
        shapes.set(key, name);
        shapeFields.set(name, [...reads]);
        decls.set(sf, [...(decls.get(sf) ?? []), `interface ${name} { ${key} }  // read by ${(fn.name as ts.Identifier | undefined)?.text ?? 'a function'}()`]);
      }
      for (const a of args.map(allocOf)) if (a) {
        if (a.base && a.base !== name) return leave(`allocation site ${a.name} already extends ${a.base}`);
        a.base = name; a.used = true;
      }
      return set(name, `${nCalls}, reads ${[...reads].join(', ')}`);
    }
    const types = new Set(args.map(a => allocOf(a) ? (allocOf(a)!.used = true, allocOf(a)!.name) : typeStr(checker.getTypeAtLocation(a))));
    const t = [...types][0];
    if (types.size === 1 && t) return set(t, nCalls);
    return leave(types.has(undefined) ? `an argument is itself untyped (${nCalls})` : `${nCalls} disagree (${[...types].join(' | ')})`);
  });

  // 3. `let x;` / `let x: any` with assignments
  for (const sf of sources) walk(sf, n => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || (n.type && n.type.kind !== ts.SyntaxKind.AnyKeyword) || (!n.type && !isAny(checker.getTypeAtLocation(n)))) return;
    if ((n.initializer && !n.type) || ts.isForOfStatement(n.parent.parent) || ts.isForInStatement(n.parent.parent)) return;  // typed by its initializer / iteration
    const sym = symOf(n.name)!;
    const vals: ts.Expression[] = n.initializer ? [n.initializer] : [];
    for (const s2 of sources) walk(s2, x => { if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(x.left) && symOf(x.left) === sym) vals.push(x.right); });
    const types = new Set(vals.map(v => typeStr(checker.getTypeAtLocation(v))));
    const t = [...types][0];
    if (types.size === 1 && t) {
      site(n, `variable ${n.name.text}`, t, `${vals.length} assignment${vals.length === 1 ? '' : 's'}`);
      n.type ? edit(n, n.type.getStart(), n.type.end, t) : edit(n, n.name.end, n.name.end, `: ${t}`);
    } else {
      site(n, `variable ${n.name.text}`, undefined, vals.length ? `assignments disagree (${[...types].map(x => x ?? 'unknown').join(' | ')})` : 'never assigned');
      if (!n.type && isJs(n)) edit(n, n.name.end, n.name.end, ': any');
    }
  });

  // allocation sites become interfaces (only when needed: added fields, or passed to an inferred parameter)
  for (const a of allocs.values()) {
    if (!a.added.length && !a.used) continue;
    const sf = a.decl.getSourceFile();
    const inherited = shapeFields.get(a.base ?? '') ?? [];
    const own = [...a.fields].filter(([k]) => !inherited.includes(k)).map(([k, t]) => `${k}: ${t}`).concat(a.added.map(x => `${x.name}${x.move ? '' : '?'}: ${x.type}`));
    decls.set(sf, [...(decls.get(sf) ?? []), `interface ${a.name}${a.base ? ` extends ${a.base}` : ''} { ${own.join('; ')} }  // allocation site, line ${a.name.slice(4)}`]);
    edit(a.decl, (a.decl.name as ts.Identifier).end, (a.decl.name as ts.Identifier).end, `: ${a.name}`);
    const moved = a.added.filter(x => x.move);
    if (moved.length) {
      const last = a.lit.properties[a.lit.properties.length - 1];
      const at = last ? last.end : a.lit.getStart() + 1;
      edit(a.decl, at, at, (last ? ', ' : ' ') + moved.map(x => `${x.name}: ${(x.stmt.expression as ts.BinaryExpression).right.getText()}`).join(', ') + (last ? '' : ' '));
      for (const x of moved) edit(x.stmt, x.stmt.getFullStart(), x.stmt.end, '');
    }
    site(a.decl, `site ${(a.decl.name as ts.Identifier).text}`, a.name, a.added.length ? `fields added: ${a.added.map(x => `${x.name} (line ${x.stmt.getSourceFile().getLineAndCharacterOfPosition(x.stmt.getStart()).line + 1})`).join(', ')}` : 'passed to an inferred parameter');
  }

  const files = new Map<string, string>();
  for (const sf of sources) {
    const es = (edits.get(sf) ?? []).sort((a, b) => b.pos - a.pos || b.end - a.end);
    const ds = decls.get(sf) ?? [];
    if (!es.length && !ds.length && !isJs(sf)) continue;
    let text = sf.text;
    for (const e of es) text = text.slice(0, e.pos) + e.text + text.slice(e.end);
    if (ds.length) {
      const firstStmt = sf.statements.find(s => !ts.isImportDeclaration(s));
      const at = firstStmt ? firstStmt.getStart() : text.length;  // after the leading comments; every edit lies after it
      const head = text.slice(0, Math.max(0, at)), tail = text.slice(Math.max(0, at));
      text = head + (head && !head.endsWith('\n') ? '\n' : '') + ds.join('\n') + '\n' + tail.replace(/^\n/, '');
    }
    files.set(sf.fileName, text);
  }
  return { files, sites };
}
const isJs = (n: ts.Node) => /\.[cm]?jsx?$/.test(n.getSourceFile().fileName);

/** The .ts path that `zinc infer` writes for a JavaScript source. */
export const tsPathOf = (f: string) => f.replace(/\.([cm]?)jsx?$/, (_m, x) => `.${x}ts`);
