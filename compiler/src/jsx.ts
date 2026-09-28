// JSX lowering (UI-03/04, D-07/D-11/D-12): .tsx sources are rewritten to plain TypeScript calls on the
// zinc:ui/solid (or zinc:ui/react) helpers *before* type checking, so both emitters see ordinary typed code.
// Solid mode: dynamic expressions become fine-grained effects. React mode: a component re-renders as a whole.
// Line breaks are preserved so diagnostics keep their line numbers.
import { ts } from './frontend.ts';

const TAGS: Record<string, number> = { view: 0, text: 1, button: 2, image: 3, scroll: 4, canvas: 5, input: 7, textarea: 8, View: 0, Text: 1, Button: 2, Image: 3, ScrollView: 4, Canvas: 5 };
const NUM_ATTRS = new Set(['width', 'height', 'grow', 'gap', 'bg', 'color', 'scale', 'hidden', 'x', 'y', 'opacity', 'translateX', 'translateY', 'rows']);
// text fields and pointer / key events (zinc:ui host ABI: onPointer kinds, edit flags)
const POINTER_ATTRS: Record<string, number> = { onPointerDown: 0, onPointerMove: 1, onPointerUp: 2, onDoubleClick: 3, onContextMenu: 4, onWheel: 5, onPointerEnter: 6, onPointerLeave: 7 };
const FLAG_ATTRS = new Set(['password', 'readOnly', 'lineNumbers', 'wrap']);
import * as fs from 'node:fs';
import * as path from 'node:path';

let COLORS: Set<string> | null = null;
function colors(): Set<string> {
  if (COLORS) return COLORS;
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../../lib/std/palette.ts'), 'utf8');
  COLORS = new Set(['white', 'black', 'transparent']);
  for (const m of src.matchAll(/'([a-z]+):/g)) for (const sh of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) COLORS.add(`${m[1]}-${sh}`);
  return COLORS;
}
const FIXED = new Set(['flex', 'flex-row', 'flex-col', 'flex-wrap', 'flex-1', 'grow', 'grow-0', 'hidden', 'absolute', 'relative', 'static', 'overflow-hidden', 'inset-0',
  'w-full', 'h-full', 'font-bold', 'font-semibold', 'font-medium', 'font-normal', 'font-mono', 'font-sans', 'text-left', 'text-center', 'text-right', 'rounded', 'border',
  'shadow', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-none', 'transition', 'transition-colors', 'transition-all', 'ease-in', 'ease-out', 'ease-in-out',
  'tracking-tight', 'tracking-wide', 'tracking-wider', 'tracking-widest']);
const NUM = String.raw`(\d+(\.\d+)?|\[\d+(\.\d+)?(px)?\]|\d+/\d+|px)`;
const COLOR = String.raw`([a-z]+-\d+|white|black|transparent|\[#[0-9a-fA-F]{3,8}\])(/\d+)?`;
const RULES = [
  /^font-\[[A-Za-z0-9_.-]+\]$/,  // font family: a TTF in the assets
  /^cursor-(default|auto|text|pointer|move|ew-resize|col-resize|ns-resize|row-resize|crosshair|grab|grabbing|not-allowed)$/,
  new RegExp(`^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|w|h|top|left|right|bottom|leading)-${NUM}$`),
  /^(items|justify)-(start|center|end|stretch|between|around|evenly)$/,
  /^rounded-(none|sm|md|lg|xl|2xl|3xl|full|\[\d+(px)?\])$/,
  /^text-(xs|sm|base|lg|xl|[2-6]xl|\[\d+(px)?\])$/,
  /^bg-gradient-to-(t|b|l|r)$/, /^border-(\d+|\[\d+(px)?\])$/, /^opacity-\d+$/, /^duration-\d+$/,
];
/** UI-07: same grammar as applyToken in lib/std/ui.ts; unknown classes are build errors (custom .css classes are declared). */
export function validClass(c: string, custom?: Set<string>): boolean {
  if (custom?.has(c)) return true;
  const v = /^(focus|active|hover|sm|md|lg|xl|2xl):(.*)$/.exec(c);
  if (v) return validClass(v[2], custom);
  if (FIXED.has(c) || RULES.some(r => r.test(c))) return true;
  const m = new RegExp(`^(bg|text|border|from|via|to)-${COLOR}$`).exec(c);
  if (m) return m[2].startsWith('[') || colors().has(m[2]);
  return false;
}

export class JsxError extends Error {
  pos: number;
  constructor(msg: string, pos: number) { super(msg); this.pos = pos; }
}

export function lowerJsx(text: string, fileName: string, customClasses?: Set<string>): string {
  if (!/<[A-Za-z>]/.test(text)) return text;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  // React model: zinc:ui/react, or code written for React / Inferno (their imports resolve to Zinc's React engine)
  const react = sf.statements.some(s => ts.isImportDeclaration(s) && ['zinc:ui/react', 'react', 'inferno'].includes((s.moduleSpecifier as ts.StringLiteral).text));
  // class components (Inferno, React classes): declared in this file or in a relative import
  const classTags = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isClassDeclaration(st) && st.name) classTags.add(st.name.text);
    if (ts.isImportDeclaration(st) && st.importClause && (st.moduleSpecifier as ts.StringLiteral).text.startsWith('.')) {
      const base = path.resolve(path.dirname(fileName), (st.moduleSpecifier as ts.StringLiteral).text.replace(/\.tsx?$/, ''));
      const text = ['.tsx', '.ts'].map(e => ts.sys.readFile(base + e)).find(t => t !== undefined) ?? '';
      const names = [st.importClause.name?.text, ...(st.importClause.namedBindings && ts.isNamedImports(st.importClause.namedBindings) ? st.importClause.namedBindings.elements.map(e => e.name.text) : [])];
      for (const n of names) if (n && (new RegExp(`class\\s+${n}\\b`).test(text) || (n === st.importClause.name?.text && /export\s+default\s+class\b/.test(text)))) classTags.add(n);
    }
  }
  const lib = react ? 'zinc:ui/react' : 'zinc:ui/solid';
  let counter = 0;
  // PocketJS-style host components (View, Text, Image...) when imported from a components module (or not imported at all)
  const imported = new Map<string, string>();
  for (const st of sf.statements) if (ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings))
    for (const el of st.importClause.namedBindings.elements) imported.set(el.name.text, (st.moduleSpecifier as ts.StringLiteral).text);
  const hostImport = (tag: string) => { const m = imported.get(tag); return !m || /components|zinc:ui/.test(m); };
  const isJsx = (n: ts.Node) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n);

  /** Source text of `n` with every JSX sub-expression lowered. */
  const rewrite = (n: ts.Node): string => {
    if (isJsx(n)) return lower(n as ts.JsxElement);
    const start = n.getStart(sf), end = n.getEnd();
    let out = '', pos = start;
    const visit = (c: ts.Node) => {
      if (isJsx(c)) { out += text.slice(pos, c.getStart(sf)) + lower(c as ts.JsxElement); pos = c.getEnd(); return; }
      ts.forEachChild(c, visit);
    };
    ts.forEachChild(n, visit);
    return out + text.slice(pos, end);
  };
  const keepLines = (orig: ts.Node, code: string) => code + '\n'.repeat(Math.max(0, text.slice(orig.getStart(sf), orig.getEnd()).split('\n').length - code.split('\n').length));

  /** A JSX expression becomes an IIFE returning the node handle. */
  const lower = (n: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment): string => {
    const lines: string[] = [];
    const v = element(n, lines);
    return keepLines(n, `((): i32 => { ${lines.join(' ')} return ${v}; })()`);
  };

  const attrsOf = (n: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes).properties;
  const tagOf = (n: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText(sf);
  const childrenOf = (n: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment) => ts.isJsxSelfClosingElement(n) ? [] : [...n.children];
  const attrValue = (a: ts.JsxAttribute): { lit?: string; expr?: string } => {
    const init = a.initializer;
    if (!init) return { expr: 'true' };
    if (ts.isStringLiteral(init)) return { lit: init.text };
    if (ts.isJsxExpression(init) && init.expression) return { expr: rewrite(init.expression) };
    return { expr: rewrite(init) };
  };

  /** Emits statements building `n`; returns the variable holding its handle. */
  const element = (n: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment, out: string[]): string => {
    const v = `__n${counter++}`;
    if (ts.isJsxFragment(n)) {
      out.push(`const ${v}: i32 = _el(6);`);
      children(v, childrenOf(n), out);
      return v;
    }
    const tag = tagOf(n);
    if (/^[A-Z]/.test(tag) && !(tag in TAGS && hostImport(tag))) return component(n, tag, out);
    if (!(tag in TAGS)) throw new JsxError(`unknown host component <${tag}> (view, text, button, image, scroll, canvas, input, textarea)`, n.getStart(sf));
    out.push(`const ${v}: i32 = _el(${TAGS[tag]});`);
    for (const a of attrsOf(n)) {
      if (!ts.isJsxAttribute(a)) throw new JsxError('spread attributes are not supported', a.getStart(sf));
      const raw = a.name.getText(sf);
      const name = raw === 'className' ? 'class' : raw === 'onClick' && react ? 'onClick' : raw;  // React/Inferno spelling
      const val = attrValue(a);
      if (name === 'class') {
        if (val.lit !== undefined) {
          for (const c of val.lit.split(/\s+/).filter(Boolean)) if (!validClass(c, customClasses)) throw new JsxError(`unknown class '${c}' (UI-07)`, a.getStart(sf));
          out.push(`_class(${v}, ${JSON.stringify(val.lit)});`);
        } else out.push(react ? `_class(${v}, ${val.expr});` : `_dynClass(${v}, () => (${val.expr}));`);
      } else if (name === 'onClick' || name === 'onPress') out.push(`_on(${v}, ${val.expr});`);
      else if (name === 'style') {
        const init = a.initializer;
        const obj = init && ts.isJsxExpression(init) && init.expression && ts.isObjectLiteralExpression(init.expression) ? init.expression : undefined;
        if (!obj) throw new JsxError('style expects an object literal: style={{ opacity: x }}', a.getStart(sf));
        for (const p of obj.properties) {
          if (!ts.isPropertyAssignment(p)) throw new JsxError('style supports `key: value` entries', p.getStart(sf));
          const key = p.name.getText(sf), e = rewrite(p.initializer);
          out.push(react || /^[-\d.]+$/.test(e) ? `_num(${v}, '${key}', ${e});` : `_dynNum(${v}, '${key}', () => (${e}));`);
        }
      }
      else if (name === 'src') out.push(val.lit !== undefined ? `_img(${v}, ${JSON.stringify(val.lit)});` : react ? `_img(${v}, ${val.expr});` : `_dynImg(${v}, () => (${val.expr}));`);
      else if (name === 'ref') out.push(`_ref(${v}, ${val.expr});`);
      else if (name === 'focusable') out.push(`_focusable(${v});`);
      else if (name === 'debugName') { /* devtools label: not used by the engine */ }
      else if (name === 'onDraw') out.push(`_draw(${v}, ${val.expr});`);
      else if (name in POINTER_ATTRS) out.push(`_ptr(${v}, ${POINTER_ATTRS[name]}, ${val.expr});`);
      else if (name === 'onKeyDown') out.push(`_key(${v}, ${val.expr});`);
      else if (name === 'onInput' || name === 'onChange') out.push(`_onText(${v}, ${name === 'onChange' && !react}, ${val.expr});`);  // React: onChange fires on every edit
      else if (name === 'value' || name === 'placeholder') {
        if (val.lit !== undefined) out.push(`_str(${v}, '${name}', ${JSON.stringify(val.lit)});`);
        else out.push(react ? `_str(${v}, '${name}', ${val.expr});` : `_dynStr(${v}, '${name}', () => (${val.expr}));`);
      }
      else if (name === 'highlight') out.push(`_hl(${v}, ${val.expr});`);
      else if (name === 'type' && val.lit === 'password') out.push(`_num(${v}, 'password', 1);`);
      else if (name === 'type' && val.lit === 'text') { /* default */ }
      else if (FLAG_ATTRS.has(name)) {
        if (val.lit !== undefined || /^(true|false)$/.test(val.expr!)) out.push(`_num(${v}, '${name}', ${val.lit !== undefined || val.expr === 'true' ? 1 : 0});`);
        else out.push(react ? `_num(${v}, '${name}', (${val.expr}) ? 1 : 0);` : `_dynNum(${v}, '${name}', () => ((${val.expr}) ? 1 : 0));`);
      }
      else if (NUM_ATTRS.has(name)) {
        if (val.lit !== undefined) out.push(`_num(${v}, '${name}', ${Number(val.lit)});`);
        else if (react || /^[-\d.]+$/.test(val.expr!)) out.push(`_num(${v}, '${name}', ${val.expr});`);
        else out.push(`_dynNum(${v}, '${name}', () => (${val.expr}));`);
      } else if (name === 'key') { /* keys: accepted, lists re-render unkeyed */ }
      else throw new JsxError(`unknown attribute '${name}' on <${tag}>`, a.getStart(sf));
    }
    if (TAGS[tag] >= 7 && childrenOf(n).some(c => !(ts.isJsxText(c) && !c.text.trim()))) throw new JsxError(`<${tag}> takes its text from value={...}, not from children`, n.getStart(sf));
    if (TAGS[tag] === 1) textContent(v, childrenOf(n), out);
    else children(v, childrenOf(n), out);
    return v;
  };

  /** JSX whitespace: text spanning lines is trimmed per line; inline text keeps its spaces. */
  const jsxText = (t: string) => t.includes('\n') ? t.split('\n').map(l => l.trim()).filter(Boolean).join(' ') : t.replace(/\s+/g, ' ');
  /** <text> children become the node's own string: one template literal, reactive when it has expressions. */
  const textContent = (v: string, kids: ts.JsxChild[], out: string[]) => {
    let tpl = '', dynamic = false;
    for (const c of kids) {
      if (ts.isJsxText(c)) tpl += jsxText(c.text).replace(/[`\\$]/g, m => '\\' + m);
      else if (ts.isJsxExpression(c) && c.expression) { tpl += '${' + rewrite(c.expression) + '}'; dynamic = true; }
      else throw new JsxError('<text> can only contain text and {expressions}', c.getStart(sf));
    }
    if (!tpl) return;
    out.push(dynamic && !react ? `_dynTextOf(${v}, () => \`${tpl}\`);` : `_textOf(${v}, \`${tpl}\`);`);
  };

  const children = (parent: string, kids: ts.JsxChild[], out: string[]) => {
    for (const c of kids) {
      if (ts.isJsxText(c)) {
        const t = jsxText(c.text).trim();
        if (t) out.push(`_text(${parent}, ${JSON.stringify(t)});`);
      } else if (ts.isJsxExpression(c)) {
        if (!c.expression) continue;
        const e = c.expression;
        if (isJsx(e)) { const cv = element(e as ts.JsxElement, out); out.push(`_append(${parent}, ${cv});`); }
        // node-valued children: {props.children()}, {children()}, {renderX(...)}
        else if (ts.isCallExpression(e) && /(^|\.)(children|render[A-Z]\w*)$/.test(e.expression.getText(sf))) out.push(`_append(${parent}, ${rewrite(e)});`);
        // {items.map(x => <Row .../>)}: a list of nodes (React: appended in order; Solid: a keyed <For>)
        else if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map' && e.arguments.length === 1 && returnsJsx(e.arguments[0])) {
          if (react) out.push(`for (const __c of ${rewrite(e)}) _append(${parent}, __c);`);
          else out.push(`_for(${parent}, () => (${rewrite(e.expression.expression)}), ${rewrite(e.arguments[0])});`);
        }
        else out.push(react ? `_text(${parent}, \`\${${rewrite(e)}}\`);` : `_dynText(${parent}, () => \`\${${rewrite(e)}}\`);`);
      } else {
        const cv = element(c, out);
        out.push(`_append(${parent}, ${cv});`);
      }
    }
  };

  const returnsJsx = (f: ts.Expression): boolean => {
    if (!ts.isArrowFunction(f) && !ts.isFunctionExpression(f)) return false;
    let b: ts.Node = f.body;
    while (ts.isParenthesizedExpression(b)) b = b.expression;
    if (isJsx(b as ts.Expression)) return true;
    return ts.isBlock(b) && b.statements.some(st => ts.isReturnStatement(st) && !!st.expression && isJsx(ts.isParenthesizedExpression(st.expression) ? st.expression.expression : st.expression));
  };
  const onlyChild = (n: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxChild | undefined =>
    childrenOf(n).filter(c => !(ts.isJsxText(c) && !c.text.trim()))[0];

  const component = (n: ts.JsxElement | ts.JsxSelfClosingElement, tag: string, out: string[]): string => {
    const v = `__n${counter++}`;
    const attrs = new Map<string, { lit?: string; expr?: string }>();
    for (const a of attrsOf(n)) {
      if (!ts.isJsxAttribute(a)) throw new JsxError('spread attributes are not supported', a.getStart(sf));
      attrs.set(a.name.getText(sf), attrValue(a));
    }
    const valueOf = (x: { lit?: string; expr?: string }) => x.lit !== undefined ? JSON.stringify(x.lit) : x.expr!;
    const childNode = (c: ts.JsxChild | undefined): string => {
      if (!c) return '_el(6)';
      if (ts.isJsxExpression(c) && c.expression) return isJsx(c.expression) ? lower(c.expression as ts.JsxElement) : rewrite(c.expression);
      return lower(c as ts.JsxElement);
    };
    if (tag === 'VirtualList') {  // <VirtualList count={n} itemHeight={h} class="...">{(i) => <row/>}</VirtualList>
      const c = onlyChild(n), count = attrs.get('count'), ih = attrs.get('itemHeight');
      if (!count || !ih || !c || !ts.isJsxExpression(c) || !c.expression) throw new JsxError('<VirtualList> needs count, itemHeight and a function child: {(i) => <...>}', n.getStart(sf));
      out.push(`const ${v}: i32 = _el(4);`);
      const cls = attrs.get('class') ?? attrs.get('className');
      if (cls?.lit !== undefined) out.push(`_class(${v}, ${JSON.stringify(cls.lit)});`);
      else if (cls) out.push(react ? `_class(${v}, ${cls.expr});` : `_dynClass(${v}, () => (${cls.expr}));`);
      out.push(react ? `_virtual(${v}, ${valueOf(count)}, ${valueOf(ih)}, ${rewrite(c.expression)});` : `_virtual(${v}, () => (${valueOf(count)}), ${valueOf(ih)}, ${rewrite(c.expression)});`);
      return v;
    }
    out.push(`const ${v}: i32 = _el(6);`);
    if (tag === 'Show' && !react) {
      const fb = attrs.get('fallback');
      out.push(`_show(${v}, () => (${valueOf(attrs.get('when')!)}), () => ${childNode(onlyChild(n))}, ${fb ? `() => ${valueOf(fb)}` : 'null'});`);
    } else if (tag === 'For' && !react) {
      const c = onlyChild(n);
      if (!c || !ts.isJsxExpression(c) || !c.expression) throw new JsxError('<For> expects a function child: {(item, i) => <...>}', n.getStart(sf));
      out.push(`_for(${v}, () => (${valueOf(attrs.get('each')!)}), ${rewrite(c.expression)});`);
    } else {
      const key = attrs.get('key');
      attrs.delete('key');
      const props = [...attrs].map(([k, x]) => `${k}: ${valueOf(x)}`);
      const c = onlyChild(n);
      if (c) props.push(`children: () => ${childNode(c)}`);
      const call = `${tag}(${props.length ? `{ ${props.join(', ')} }` : ''})`;
      const keyArg = key ? `'' + (${valueOf(key)})` : "''";
      if (react && classTags.has(tag)) out.push(`_cc(${v}, () => new ${tag}(${props.length ? `{ ${props.join(', ')} }` : '{}'}), ${JSON.stringify(tag)}, ${keyArg});`);
      else out.push(react ? `_rc(${v}, () => ${call}, ${JSON.stringify(tag)}, ${keyArg});` : `_append(${v}, ${call});`);
    }
    return v;
  };

  // UI-04: rules of hooks, checked at build time (no hooks under conditions or loops)
  if (react) {
    const check = (n: ts.Node, cond: boolean) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^use[A-Z]/.test(n.expression.text) && cond)
        throw new JsxError(`hook '${n.expression.text}' is called conditionally or in a loop (rules of hooks)`, n.getStart(sf));
      if (ts.isFunctionLike(n)) { ts.forEachChild(n, c => check(c, false)); return; }
      const inCond = cond || ts.isIfStatement(n) || ts.isConditionalExpression(n) || ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n) ||
        (ts.isBinaryExpression(n) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind));
      ts.forEachChild(n, c => check(c, inCond));
    };
    check(sf, false);
  }

  // replace top-level JSX spans, last first
  const spans: { start: number; end: number; code: string }[] = [];
  const visit = (n: ts.Node) => {
    if (isJsx(n)) { spans.push({ start: n.getStart(sf), end: n.getEnd(), code: lower(n as ts.JsxElement) }); return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  let out = text;
  for (const s of spans.sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.code + out.slice(s.end);
  const input = '_ptr, _key, _onText, _str, _hl';
  const helpers = react ? `_el, _text, _textOf, _append, _class, _on, _draw, _num, _img, _ref, _focusable, _rc, _cc, _virtual, ${input}` : `_el, _text, _textOf, _dynTextOf, _append, _class, _on, _draw, _num, _dynText, _dynClass, _dynNum, _show, _for, _img, _dynImg, _ref, _focusable, _virtual, _dynStr, ${input}`;
  return `import { ${helpers} } from '${lib}'; ` + out;
}
