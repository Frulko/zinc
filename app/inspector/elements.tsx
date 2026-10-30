// The Elements panel of Zinc Inspector: the program's tree with its components (<AlbumGrid>, <NowPlaying>... around the host nodes they
// render, dev runs), folded as Chrome's (the roots and the path to the selection open), searched (component, tag, className, text, id) and
// filtered (rendered only, components only, host wrappers hidden); the selected node's component and props, its classes, element.style and
// texts edited live in dev runs, its box and computed style. The tree's view is tree.tsx, the Styles pane styles.tsx.
import { createSignal } from 'zinc:ui/solid';
import { call, conn, status, setStatus, devRun, errorOf, sleep, until } from './state';
import { styleLines, ruleLines, inlineOf, Inline } from './model';
import { Field } from './widgets';

/** A node of the tree as DOM.getDocument sends it. */
export class TNode {
  id: i32 = 0; text: boolean = false; tag: string = ''; comp: boolean = false; cls: string = ''; value: string = '';
  source: string = ''; props: string = ''; hidden: boolean = false; on: string = '';
  stage: boolean = false; attrs: string[] = [];   // a node of a zinc:stage scene: its class is `tag`, its properties `attrs` (name, value...)
  kids: TNode[] = []; parent: TNode | null = null;
  hay: string = '';   // what the search looks in, lower case
}
/** A row shown: a node at its depth; `match` when the search found it; `close` the closing tag of an open node, `leaf` an open node whose
 *  children are all filtered out. */
export class Row {
  node: TNode; depth: i32; match: boolean; close: boolean = false; leaf: boolean = false;
  constructor(node: TNode, depth: i32, match: boolean) { this.node = node; this.depth = depth; this.match = match; }
}

const HOSTS: string[] = ['view', 'View', 'text', 'Text', 'button', 'Button', 'image', 'Image', 'scroll', 'ScrollView', 'canvas', 'Canvas', 'fragment', 'Fragment',
  'input', 'Input', 'textarea', 'TextArea'];
/** A host node's component name as the source writes it (view: View). */
export function hostName(tag: string): string { for (let i = 0; i < HOSTS.length; i += 2) if (HOSTS[i] === tag) return HOSTS[i + 1]; return tag; }

function attr(d: any, name: string): string {
  const at = d.attributes;
  if (at !== undefined) for (let i = 0; i + 1 < at.length; i += 2) { const k: string = at[i]; if (k === name) { const v: string = at[i + 1]; return v; } }
  return '';
}
function hasAttr(d: any, name: string): boolean {
  const at = d.attributes;
  if (at !== undefined) for (let i = 0; i + 1 < at.length; i += 2) { const k: string = at[i]; if (k === name) return true; }
  return false;
}
/** The tree of a DOM.getDocument node (the document itself left out: its children are the roots). */
export function build(d: any, parent: TNode | null, byId: Map<i32, TNode>, roots: TNode[]): void {
  const type: i32 = d.nodeType;
  let n: TNode | null = null;
  if (type === 1 || type === 3) {
    const x = new TNode();
    x.id = d.nodeId; x.parent = parent;
    if (type === 3) { x.text = true; x.value = d.nodeValue; x.hay = x.value.toLowerCase() + ' #' + x.id; }
    else {
      const name: string = d.nodeName; const local: string = d.localName;
      x.stage = hasAttr(d, 'stage');   // zinc:stage: the element is named after the node's class (Sprite, GameManager...)
      x.comp = !x.stage && name === local && name.length > 0 && name.charAt(0) !== name.charAt(0).toLowerCase();   // zinc:devtools names a component's wrapper as written
      x.tag = x.comp || x.stage ? name : hostName(local);
      x.cls = attr(d, 'class'); x.source = attr(d, 'source'); x.props = attr(d, 'props'); x.on = attr(d, 'on'); x.hidden = hasAttr(d, 'hidden');
      if (x.stage) stageValues(x, d.attributes);
      else x.hay = (x.tag + ' ' + x.cls + ' #' + x.id + ' ' + x.source + ' ' + x.props).toLowerCase();
    }
    byId.set(x.id, x);
    if (parent !== null) (parent as TNode).kids.push(x); else roots.push(x);
    n = x;
  }
  const kids = d.children;
  if (kids !== undefined) for (const k of kids) build(k, n !== null ? n : parent, byId, roots);
}
/** A zinc:stage node's properties from its attribute list (name, value...). */
function stageValues(x: TNode, at: any): void {
  x.attrs = [];
  for (let i = 0; i + 1 < at.length; i += 2) { const k: string = at[i]; const v: string = at[i + 1]; if (k !== 'stage') { x.attrs.push(k); x.attrs.push(v); } }
  x.hidden = stageAttr(x, 'visible') === 'false';
  x.props = x.attrs.join(' ');
  x.hay = (x.tag + ' #' + x.id + ' ' + x.props).toLowerCase();
}
/** A row's text: <Card> for a component, <View className="..."> for a host node, "text" for text. */
export function label(n: TNode): string {
  if (n.text) return '"' + n.value + '"';
  if (n.comp) return '<' + n.tag + '>';
  if (n.stage) {
    const nm = stageAttr(n, 'name'), src = stageAttr(n, 'src');
    return '<' + n.tag + (nm.length > 0 ? ' name="' + nm + '"' : '') + (src.length > 0 ? ' src="' + src + '"' : '') + (n.hidden ? ' hidden' : '') + '>';
  }
  return '<' + n.tag + (n.cls.length > 0 ? ' className="' + n.cls + '"' : '') + (n.hidden ? ' hidden' : '') + '>';
}
// Chrome's colours: tag names and their brackets, attribute names, values, text; a component's name, and where it is called dimmed.
export const C_TAG: i32 = 0x881280, C_ATTR: i32 = 0x994500, C_VALUE: i32 = 0x1a1aa6, C_TEXT: i32 = 0x1f2937, C_COMP: i32 = 0x0e7490, C_DIM: i32 = 0x94a3b8;
/** A row's text with its colour runs (ui.setTextRuns: length, style, colour, ...). */
export class Line {
  text: string = ''; runs: i32[] = [];
  add(s: string, color: i32): void { if (s.length === 0) return; this.text += s; this.runs.push(s.length); this.runs.push(0); this.runs.push(color); }
  attr(name: string, value: string): void { this.add(' ' + name, C_ATTR); this.add('="', C_TAG); this.add(value, C_VALUE); this.add('"', C_TAG); }
}
/** A component's props as written (`title={page()} wide`), one each: split at the spaces outside quotes and braces. */
function propList(s: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = '', cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (quote.length > 0) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ' ' && depth === 0) { if (cur.length > 0) out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}
/** What a row shows, coloured as Chrome's Elements: `<View className="...">`, `<Text>Hello</Text>` (a lone text inline), `<Card title="x">`
 *  and where it is called, `…</View>` on a folded node, `</View>` closing an open one, `"text"` for a text among elements. */
export function lineOf(r: Row): Line {
  const n = r.node, l = new Line();
  if (n.text) { l.add('"' + n.value + '"', C_TEXT); return l; }
  if (r.close) { l.add('</' + n.tag + '>', n.comp ? C_COMP : C_TAG); return l; }
  const color = n.comp ? C_COMP : C_TAG;
  l.add('<' + n.tag, color);
  if (n.comp) for (const p of propList(n.props)) {
    const e = p.indexOf('=');
    if (e < 0) { l.add(' ' + p, C_ATTR); continue; }
    l.add(' ' + p.slice(0, e), C_ATTR); l.add('=', C_TAG); l.add(p.slice(e + 1), C_VALUE);
  }
  else if (n.stage) {   // its name and image inline, the rest (x, y...) in the pane
    const nm = stageAttr(n, 'name'), src = stageAttr(n, 'src');
    if (nm.length > 0) l.attr('name', nm);
    if (src.length > 0) l.attr('src', src);
  }
  else if (n.cls.length > 0) l.attr('className', n.cls);
  if (n.hidden) l.add(' hidden', C_ATTR);
  l.add('>', color);
  const t = inlineText(n);
  if (t !== null) { l.add((t as TNode).value, C_TEXT); l.add('</' + n.tag + '>', color); }
  else if (r.leaf || n.kids.length === 0) l.add('</' + n.tag + '>', color);
  else if (!isOpen(n) && query().trim().length === 0) { l.add('…', C_DIM); l.add('</' + n.tag + '>', color); }
  if (n.comp && n.source.length > 0) l.add('  ' + n.source, C_DIM);
  return l;
}
/** Chrome's badges after a tag: the layout a host node lays its children out with (flex, grid, wrap) when it has several. */
export function badgeOf(n: TNode): string {
  if (n.comp || n.stage || n.text || n.kids.length < 2) return '';
  const c = ' ' + n.cls + ' ';
  if (c.indexOf(' grid') >= 0) return 'grid';
  if (c.indexOf(' flex-wrap ') >= 0) return 'wrap';
  return c.indexOf(' flex-row ') >= 0 ? 'flex row' : 'flex';
}
/** A property of a zinc:stage node ('' when it has none). */
export function stageAttr(n: TNode, name: string): string { for (let i = 0; i + 1 < n.attrs.length; i += 2) if (n.attrs[i] === name) return n.attrs[i + 1]; return ''; }
/** A host node that only wraps one element (no class, no listener, no text): "hide host wrappers" shows its child in its place. */
function wrapper(n: TNode): boolean {
  if (n.comp || n.stage || n.text || n.cls.length > 0 || n.on.length > 0 || n.kids.length !== 1) return false;
  return !n.kids[0].text;
}

// ---- state
let byId = new Map<i32, TNode>();
let roots: TNode[] = [];
const opened = new Set<i32>(), closed = new Set<i32>();   // folds the user changed; otherwise the roots are open and the rest folded
let unrendered = new Set<i32>();
let unrenderedKey = '';
export const [rows, setRows] = createSignal<Row[]>([]);
export const [query, setQuery] = createSignal<string>('');
export const [renderedOnly, setRenderedOnly] = createSignal<boolean>(true);
export const [componentsOnly, setComponentsOnly] = createSignal<boolean>(false);
export const [hideWrappers, setHideWrappers] = createSignal<boolean>(false);
export const [selected, setSelected] = createSignal<i32>(-1);   // the row clicked
export const [target, setTarget] = createSignal<i32>(-1);       // the host node styled: the row, or a component's first host node
export const [comp, setComp] = createSignal<TNode | null>(null); // the component shown: the one clicked, or the one that rendered the node
export const [styles, setStyles] = createSignal<string[]>([]);
export const [box, setBox] = createSignal<string>('');
export const [boxLines, setBoxLines] = createSignal<string[]>([]);
export const [rules, setRules] = createSignal<string[]>([]);
export const [inline, setInline] = createSignal<Inline>(new Inline());
export const [classes, setClasses] = createSignal<string[]>([]);      // the target's classes: on ones, then the ones switched off
export const [classDraft, setClassDraft] = createSignal<string>('');
export const [completions, setCompletions] = createSignal<string[]>([]);
export const [decls, setDecls] = createSignal<Decl[]>([]);
export const [propName, setPropName] = createSignal<string>('');
export const [propValue, setPropValue] = createSignal<string>('');
export const [edits, setEdits] = createSignal<i32>(0);   // edits applied (the dump waits on it)
export const [stageAttrs, setStageAttrs] = createSignal<string[]>([]);   // the target's properties when it is a zinc:stage node

/** A property of element.style: name, value, and whether it applies (Chrome's checkbox). */
export class Decl { name: string = ''; value: string = ''; on: boolean = true; }
const offClasses = new Map<i32, string[]>();   // per node: the classes switched off (kept to switch them on again)
const declsOf = new Map<i32, Decl[]>();         // per node: element.style as the panel shows it, switched-off properties included

/** The tree read again (DOM.getDocument); the folds, the selection and the filters stay. */
export async function loadDocument(): Promise<void> {
  if (conn.c === null) return;
  const d = await call('DOM.getDocument', '{"depth":-1}');
  const m = new Map<i32, TNode>(), r: TNode[] = [];
  if (d.root !== undefined) build(d.root, null, m, r);
  byId = m; roots = r;
  await refreshRendered(true);
  await refreshStage();
}
/** The selected zinc:stage node's values read again (DOM.getAttributes) with its box: a moving node's x, y... follow in the Styles pane. */
export async function refreshStage(): Promise<void> {
  const id = target(), n = nodeOf(id);
  if (n === null || !(n as TNode).stage) return;
  const r = await call('DOM.getAttributes', `{"nodeId":${id}}`);
  if (r.attributes === undefined) return;
  stageValues(n as TNode, r.attributes);
  const a = (n as TNode).attrs;
  if (a.join('\u0001') !== stageAttrs().join('\u0001')) setStageAttrs(a.slice(0));
  const b = await call('DOM.getBoxModel', `{"nodeId":${id}}`);
  if (b.model !== undefined) { const w: number = b.model.width; const h: number = b.model.height; if (box() !== w + ' × ' + h) setBox(w + ' × ' + h); }
}
/** The nodes that draw nothing (Zinc.getUnrendered); the rows are built again when they changed (or when `always`). */
export async function refreshRendered(always: boolean): Promise<void> {
  const u = await call('Zinc.getUnrendered', '{}');
  const s = new Set<i32>();
  let key = '';
  if (u.nodeIds !== undefined) for (const x of u.nodeIds) { const id: i32 = x; s.add(id); key += id + ','; }
  if (!always && key === unrenderedKey) return;
  unrendered = s; unrenderedKey = key;
  refilter();
}
function marks(n: TNode, q: string, hit: Set<i32>): boolean {
  if (renderedOnly() && unrendered.has(n.id)) return false;
  let m = n.hay.indexOf(q) >= 0;
  for (const k of n.kids) if (marks(k, q, hit)) m = true;
  if (m) hit.add(n.id);
  return m;
}
function walk(n: TNode, depth: i32, q: string, hit: Set<i32>, out: Row[]): void {
  if (renderedOnly() && unrendered.has(n.id)) return;
  if (q.length > 0 && !hit.has(n.id)) return;
  const shown = componentsOnly() ? n.comp : !(hideWrappers() && wrapper(n));
  if (!shown) { for (const k of n.kids) walk(k, depth, q, hit, out); return; }
  const t = inlineText(n);
  const row = new Row(n, depth, q.length > 0 && (n.hay.indexOf(q) >= 0 || (t !== null && (t as TNode).hay.indexOf(q) >= 0)));
  out.push(row);
  if (t !== null || n.kids.length === 0 || (q.length === 0 && !isOpen(n))) return;   // a search opens what it finds inside folded nodes
  const at = out.length;
  for (const k of n.kids) walk(k, depth + 1, q, hit, out);
  if (out.length === at) { row.leaf = true; return; }
  const c = new Row(n, depth, false); c.close = true;
  out.push(c);
}
/** The text a host node or a zinc:stage node shows inline (<Text>Hello</Text>, <TextField>Score: 12</TextField> on one row, as Chrome's),
 *  when it is its only child. */
export function inlineText(n: TNode): TNode | null { return !n.comp && n.kids.length === 1 && n.kids[0].text ? n.kids[0] : null; }
/** Whether node n shows its children: the roots open, the rest folded, until the user changes it. */
export function isOpen(n: TNode): boolean { return closed.has(n.id) ? false : opened.has(n.id) || n.parent === null; }
function setOpen(n: TNode, on: boolean): void { if (on) { opened.add(n.id); closed.delete(n.id); } else { closed.add(n.id); opened.delete(n.id); } }
function setOpenAll(n: TNode, on: boolean): void { setOpen(n, on); for (const k of n.kids) setOpenAll(k, on); }
/** The rows, from the tree and the filters. */
export function refilter(): void {
  const q = query().trim().toLowerCase(), hit = new Set<i32>(), out: Row[] = [];
  if (q.length > 0) for (const r of roots) marks(r, q, hit);
  for (const r of roots) walk(r, 0, q, hit, out);
  setRows(out);
}
/** Opens or folds node `id`; `all` (Alt-click) its whole subtree with it, as Chrome's. */
export function toggleFold(id: i32, all: boolean): void {
  const n = nodeOf(id);
  if (n === null) return;
  const on = !isOpen(n as TNode);
  if (all) setOpenAll(n as TNode, on); else setOpen(n as TNode, on);
  refilter();
}
/** Opens node `id` (or folds it, `on` false) without touching its subtree; false when it already was. */
export function setFold(id: i32, on: boolean): boolean {
  const n = nodeOf(id);
  if (n === null || isOpen(n as TNode) === on || (n as TNode).kids.length === 0) return false;
  setOpen(n as TNode, on); refilter();
  return true;
}
/** Opens the ancestors of node `id`, so its row shows (a node selected or picked in the program). */
function reveal(id: i32): void {
  const n = nodeOf(id);
  if (n === null) return;
  let changed = false;
  for (let p = (n as TNode).parent; p !== null; p = (p as TNode).parent) if (!isOpen(p as TNode)) { setOpen(p as TNode, true); changed = true; }
  if (changed) refilter();
}
/** The first node of the tree (folded or not) that `f` accepts, in document order. */
export function findNode(f: (n: TNode) => boolean): TNode | null {
  const look = (n: TNode): TNode | null => { if (f(n)) return n; for (const k of n.kids) { const x = look(k); if (x !== null) return x; } return null; };
  for (const r of roots) { const x = look(r); if (x !== null) return x; }
  return null;
}
export function nodeOf(id: i32): TNode | null { const n = byId.get(id); return n !== undefined ? n : null; }
/** A component's first host node (what it draws), or null. */
function firstHost(n: TNode): TNode | null {
  for (const k of n.kids) { if (!k.text && !k.comp) return k; const f = firstHost(k); if (f !== null) return f; }
  return null;
}
function ownerOf(n: TNode): TNode | null { for (let p = n.parent; p !== null; p = (p as TNode).parent) if ((p as TNode).comp) return p; return null; }

/** Selects a row: a component shows its props and styles its first host node; a host node shows the component that rendered it. */
export async function select(at: i32): Promise<void> {
  const x = nodeOf(at);
  if (x === null) return;
  const p = (x as TNode).parent;
  const n: TNode = (x as TNode).text && p !== null && inlineText(p as TNode) === x ? p as TNode : x as TNode;   // a text shown inline: its element's row
  reveal(n.id);
  setSelected(n.id);
  const t = n.comp ? firstHost(n) : n.text ? n.parent : n;
  setComp(n.comp ? n : ownerOf(n));
  setTarget(t !== null ? (t as TNode).id : -1);
  await readStyles();
}
/** Computed style, box model, rules and element.style of the target, read again. */
export async function readStyles(): Promise<void> {
  const id = target();
  if (id < 0) { setStyles([]); setBox(''); setBoxLines([]); setRules([]); setClasses([]); setDecls([]); setStageAttrs([]); return; }
  if (cssProps().length === 0) await loadCssProps();
  const sn = nodeOf(id);
  setStageAttrs(sn !== null && (sn as TNode).stage ? (sn as TNode).attrs.slice(0) : []);
  const computed = await call('CSS.getComputedStyleForNode', `{"nodeId":${id}}`);
  const lines = styleLines(computed);
  setStyles(lines);
  const b = await call('DOM.getBoxModel', `{"nodeId":${id}}`);
  if (b.model !== undefined) { const w: number = b.model.width; const h: number = b.model.height; setBox(w + ' × ' + h); } else setBox('');
  setBoxLines(boxModel(lines, box()));
  const m = await call('CSS.getMatchedStylesForNode', `{"nodeId":${id}}`);
  setRules(ruleLines(m));
  const i = inlineOf(m.inlineStyle);
  setInline(i);
  if (!declsOf.has(id)) declsOf.set(id, parseDecls(i.text));
  setDecls((declsOf.get(id) as Decl[]).slice(0));
  const off = offClasses.get(id), on = onClasses();
  setClasses(on.concat(off !== undefined ? off : []));
  await readChanges();
}
/** The box model as Chrome draws it, in lines: margin, border, padding, content. */
function boxModel(lines: string[], size: string): string[] {
  const v = (name: string): string => { for (const l of lines) if (l.startsWith(name + ': ')) return l.slice(name.length + 2).replace('px', ''); return '0'; };
  const side = (p: string): string => v(p + '-top') + ' ' + v(p + '-right') + ' ' + v(p + '-bottom') + ' ' + v(p + '-left');
  return ['margin ' + side('margin'), 'border ' + v('border-top-width') + ' ' + v('border-right-width') + ' ' + v('border-bottom-width') + ' ' + v('border-left-width'),
    'padding ' + side('padding'), 'content ' + size];
}
export function computedValue(name: string): string { for (const l of styles()) if (l.startsWith(name + ': ')) return l.slice(name.length + 2); return ''; }
function parseDecls(text: string): Decl[] {
  const out: Decl[] = [];
  for (const part of text.split(';')) {
    const c = part.indexOf(':');
    if (c <= 0) continue;
    const d = new Decl(); d.name = part.slice(0, c).trim(); d.value = part.slice(c + 1).trim();
    if (d.name.length > 0) out.push(d);
  }
  return out;
}

// ---- live styling (dev runs): classes and element.style
/** The class attribute of the target becomes `on`; `off` are kept to switch on again. False (and the status says why) when refused. */
async function setClassList(on: string[], off: string[], rec: boolean = true): Promise<boolean> {
  const id = target(), n = nodeOf(id);
  if (n === null) return false;
  const was = snap();
  previewBase = null;
  const v = on.join(' ');
  const r = await call('DOM.setAttributeValue', `{"nodeId":${id},"name":"class","value":${JSON.stringify(v)}}`);
  const e = errorOf(r);
  if (e.length > 0) { setStatus(e); return false; }
  (n as TNode).cls = v; offClasses.set(id, off);
  if (rec) remember(id, was);
  setStatus('className applied (not written to the source)');
  setEdits(edits() + 1);
  await readStyles();
  refilter();
  return true;
}
function onClasses(): string[] {
  const n = nodeOf(target());
  return (previewBase !== null ? previewBase as string : n !== null ? (n as TNode).cls : '').split(' ').filter((c: string) => c.length > 0);
}
/** The target's whole className (the .cls pane edited as text). */
export function classText(): string { return onClasses().join(' '); }
/** The className becomes `text` (the .cls pane's "edit as text"); the classes switched off and not in it stay off. */
export async function setClassText(text: string): Promise<boolean> {
  const on = text.split(' ').filter((c: string) => c.length > 0);
  return await setClassList(on, offOf().filter((x: string) => on.indexOf(x) < 0));
}
// A class of the completion previewed on the node (arrowed through or hovered), as Chrome's: applied in the program without being a change
// (no patch, no undo); the className before the preview comes back when none is chosen.
let previewBase: string | null = null;
/** Class `c` previewed on the target, added to its classes; null takes the preview away. */
export async function previewClass(c: string | null): Promise<void> {
  const id = target(), n = nodeOf(id);
  if (n === null || (c === null && previewBase === null)) return;
  if (previewBase === null) previewBase = (n as TNode).cls;
  const base = previewBase as string;
  const v = c === null ? base : onClasses().filter((x: string) => x !== c).concat([c as string]).join(' ');
  if (c === null) previewBase = null;
  await call('DOM.setAttributeValue', `{"nodeId":${id},"name":"class","value":${JSON.stringify(v)},"preview":true}`);
  (n as TNode).cls = c === null ? base : (n as TNode).cls;
}
export function previewing(): boolean { return previewBase !== null; }
function offOf(): string[] { const o = offClasses.get(target()); return o !== undefined ? o.slice(0) : []; }
/** Adds the classes of `c` (several, separated by spaces, as Chrome's .cls field takes them). */
export async function addClass(c: string): Promise<boolean> {
  const add = c.split(' ').filter((x: string) => x.length > 0);
  if (add.length === 0) return false;
  const on = onClasses().filter((x: string) => add.indexOf(x) < 0);
  for (const x of add) on.push(x);
  const ok = await setClassList(on, offOf().filter((x: string) => add.indexOf(x) < 0));
  if (ok) { setClassDraft(''); setCompletions([]); }
  return ok;
}
export async function toggleClass(c: string): Promise<boolean> {
  const on = onClasses(), off = offOf();
  if (on.indexOf(c) >= 0) { off.push(c); return await setClassList(on.filter((x: string) => x !== c), off); }
  on.push(c);
  return await setClassList(on, off.filter((x: string) => x !== c));
}
export async function removeClass(c: string): Promise<boolean> { return await setClassList(onClasses().filter((x: string) => x !== c), offOf().filter((x: string) => x !== c)); }
/** Class `c` becomes `to` where it is (Chrome's .cls pane edited in place); an empty `to` removes it, a switched-off class stays off. */
export async function editClass(c: string, to: string): Promise<boolean> {
  const t = to.trim();
  if (t === c) return true;
  if (t.length === 0) return await removeClass(c);
  const sw = (l: string[]): string[] => { const out: string[] = []; for (const x of l) if (x === c) out.push(t); else if (x !== t) out.push(x); return out; };
  return await setClassList(sw(onClasses()), sw(offOf()));
}
export function isOn(c: string): boolean { return onClasses().indexOf(c) >= 0; }
/** The text of text node `id` becomes `value` in the program (DOM.setNodeValue, dev runs): shown at once, not written to the source. */
export async function setTextOf(id: i32, value: string): Promise<boolean> {
  const n = nodeOf(id);
  if (n === null || !(n as TNode).text) return false;
  const r = await call('DOM.setNodeValue', `{"nodeId":${id},"value":${JSON.stringify(value)}}`);
  const e = errorOf(r);
  if (e.length > 0) { setStatus(e); return false; }
  (n as TNode).value = value; (n as TNode).hay = value.toLowerCase() + ' #' + id;
  setStatus('text applied (not written to the source)');
  setEdits(edits() + 1);
  refilter();
  return true;
}
// The properties the Styles pane lists for the node's type, as Chrome shows those that apply: a Text's font and alignment, a View's layout,
// spacing, border and background, an Image's fit; each shows its computed value until element.style sets it.
const TEXT_PROPS: string[] = ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'color', 'opacity', 'margin-top', 'margin-bottom'];
const BOX_PROPS: string[] = ['flex-direction', 'justify-content', 'align-items', 'flex-wrap', 'flex-grow', 'gap', 'width', 'height', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'border-width', 'border-color', 'border-radius', 'background-color', 'opacity'];
const IMAGE_PROPS: string[] = ['object-fit', 'width', 'height', 'border-radius', 'opacity', 'margin-top', 'margin-bottom'];
export function propsFor(tag: string): string[] {
  if (tag === 'Text') return TEXT_PROPS;
  if (tag === 'Image') return IMAGE_PROPS;
  if (tag === 'Button' || tag === 'Input' || tag === 'TextArea') return BOX_PROPS.concat(['color', 'font-size']);
  return BOX_PROPS;
}
/** A value stepped by the arrow keys as Chrome does: its number moved by `by` (1, 10 with Shift, 0.1 with Alt), the unit kept; unchanged
 *  when it has no number (a keyword, a colour). */
export function stepValue(v: string, by: number): string {
  const t = v.trim();
  let i = 0;
  while (i < t.length && '-.0123456789'.indexOf(t.charAt(i)) >= 0) i++;
  if (i === 0 || isNaN(Number(t.slice(0, i)))) return v;
  const x = Math.round((Number(t.slice(0, i)) + by) * 10) / 10;
  return `${x}` + t.slice(i);
}
/** The known classes that start with the last word typed (Zinc.completeClass). */
export async function complete(text: string): Promise<void> {
  setClassDraft(text);
  const w = text.endsWith(' ') ? '' : text.slice(text.lastIndexOf(' ') + 1);
  if (w.length === 0) { setCompletions([]); return; }
  const r = await call('Zinc.completeClass', `{"prefix":${JSON.stringify(w)}}`);
  const out: string[] = [];
  if (r.classes !== undefined) for (const c of r.classes) { const s: string = c; if (out.length < 12) out.push(s); }
  setCompletions(out);
}
/** element.style of the target becomes the panel's properties (switched-off ones as comments, which apply nothing). */
async function applyDecls(list: Decl[], rec: boolean = true): Promise<boolean> {
  const id = target(), i = inline();
  if (id < 0 || i.sheet === '') return false;
  const was = snap();
  const text = list.map((d: Decl) => d.on ? d.name + ': ' + d.value + ';' : '/* ' + d.name + ': ' + d.value + '; */').join(' ');
  const r = await call('CSS.setStyleTexts', `{"edits":[{"styleSheetId":${JSON.stringify(i.sheet)},"range":${i.range},"text":${JSON.stringify(text)}}]}`);
  const e = errorOf(r);
  if (e.length > 0) { setStatus(e); return false; }
  declsOf.set(id, list);
  if (rec) remember(id, was);
  setStatus('element.style applied (not written to the source)');
  setEdits(edits() + 1);
  await readStyles();
  return true;
}
function copyDecls(): Decl[] { return decls().map((d: Decl) => { const x = new Decl(); x.name = d.name; x.value = d.value; x.on = d.on; return x; }); }
export async function setProp(name: string, value: string): Promise<boolean> {
  const n = name.trim(), v = value.trim();
  if (n.length === 0 || v.length === 0) return false;
  const l = copyDecls();
  let found = false;
  for (const d of l) if (d.name === n) { d.value = v; d.on = true; found = true; }
  if (!found) { const d = new Decl(); d.name = n; d.value = v; l.push(d); }
  const ok = await applyDecls(l);
  if (ok) { setPropName(''); setPropValue(''); }
  return ok;
}
/** Several declarations at once ([name, value]...: a paste of `a: b; c: d`), one change. */
export async function setProps(pairs: string[][]): Promise<boolean> {
  const l = copyDecls();
  for (const p of pairs) {
    let found = false;
    for (const d of l) if (d.name === p[0]) { d.value = p[1]; d.on = true; found = true; }
    if (!found) { const d = new Decl(); d.name = p[0]; d.value = p[1]; l.push(d); }
  }
  return pairs.length > 0 && await applyDecls(l);
}
/** The declarations of a text (`padding: 4px; color: #f00`) as [name, value] pairs. */
export function declPairs(text: string): string[][] { return parseDecls(text).map((d: Decl) => [d.name, d.value]).filter((p: string[]) => p[1].length > 0); }
/** Property `from` of element.style renamed `to` where it is (its name edited in place); an empty name removes it. */
export async function renameProp(from: string, to: string): Promise<boolean> {
  const t = to.trim();
  if (t === from) return true;
  if (t.length === 0) return await deleteProp(from);
  const l = copyDecls().filter((d: Decl) => d.name !== t);
  for (const d of l) if (d.name === from) d.name = t;
  return await applyDecls(l);
}
export async function toggleProp(name: string): Promise<boolean> { const l = copyDecls(); for (const d of l) if (d.name === name) d.on = !d.on; return await applyDecls(l); }
export async function deleteProp(name: string): Promise<boolean> { return await applyDecls(copyDecls().filter((d: Decl) => d.name !== name)); }

// ---- the properties element.style applies (Zinc.cssProperties: the program's own list), for the completion
export class CssProp { name: string = ''; kind: string = ''; values: string[] = []; }
export const [cssProps, setCssProps] = createSignal<CssProp[]>([]);
async function loadCssProps(): Promise<void> {
  const r = await call('Zinc.cssProperties', '{}');
  const out: CssProp[] = [];
  if (r.properties !== undefined) for (const x of r.properties) {
    const p = new CssProp(); p.name = x.name; p.kind = x.kind;
    for (const v of x.values) { const s: string = v; p.values.push(s); }
    out.push(p);
  }
  setCssProps(out);
}
export function propInfo(name: string): CssProp | null { for (const p of cssProps()) if (p.name === name) return p; return null; }
/** The property names for what is typed: those that start with it, then those that contain it. */
export function nameCompletions(typed: string): string[] {
  const t = typed.trim().toLowerCase(), a: string[] = [], b: string[] = [];
  for (const p of cssProps()) if (p.name.startsWith(t)) a.push(p.name); else if (t.length > 0 && p.name.indexOf(t) >= 0) b.push(p.name);
  return a.concat(b).slice(0, 12);
}
/** The keywords of property `name` for what is typed (all of them while the value is one of them or empty). */
export function valueCompletions(name: string, typed: string): string[] {
  const p = propInfo(name);
  if (p === null) return [];
  const t = typed.trim().toLowerCase(), vs = (p as CssProp).values;
  return vs.indexOf(t) >= 0 ? vs.slice(0) : vs.filter((v: string) => v.startsWith(t));
}

// ---- undo and redo of the inspector's edits, per node (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z): its classes, the ones switched off, element.style
class Snap { on: string[] = []; off: string[] = []; decls: Decl[] = []; }
const undos = new Map<i32, Snap[]>(), redos = new Map<i32, Snap[]>();
export const [history, setHistory] = createSignal<i32>(0);   // bumped at each change of the stacks (the buttons follow)
function snap(): Snap { const s = new Snap(); s.on = onClasses(); s.off = offOf(); s.decls = copyDecls(); return s; }
function remember(id: i32, was: Snap): void {
  const u = undos.get(id);
  if (u !== undefined) u.push(was); else undos.set(id, [was]);
  redos.delete(id);
  setHistory(history() + 1);
}
export function canUndo(redo: boolean): boolean { const l = (redo ? redos : undos).get(target()); return l !== undefined && l.length > 0; }
/** The target's last edit undone (or the last undone one done again, `redo`); false when there is none. */
export async function undo(redo: boolean): Promise<boolean> {
  const id = target(), from = redo ? redos : undos, to = redo ? undos : redos, l = from.get(id);
  if (l === undefined || l.length === 0) return false;
  const s = l.pop() as Snap, now = snap();
  const t = to.get(id);
  if (t !== undefined) t.push(now); else to.set(id, [now]);
  setHistory(history() + 1);
  if (s.on.join(' ') !== now.on.join(' ') || s.off.join(' ') !== now.off.join(' ')) { if (!(await setClassList(s.on, s.off, false))) return false; }
  const text = (l: Decl[]): string => l.map((d: Decl) => (d.on ? '' : '!') + d.name + ':' + d.value).join(';');
  if (text(s.decls) !== text(now.decls)) return await applyDecls(s.decls, false);
  return true;
}

// ---- the patch of the session (Zinc.getStylePatch): what each edited node's source has and what to write instead; never written by us
export class Change { where: string = ''; was: string = ''; now: string = ''; }
export const [changes, setChanges] = createSignal<Change[]>([]);
export async function readChanges(): Promise<void> {
  const r = await call('Zinc.getStylePatch', '{}');
  const out: Change[] = [];
  if (r.changes !== undefined) for (const x of r.changes) { const c = new Change(); c.where = x.where; c.was = x.was; c.now = x.now; out.push(c); }
  setChanges(out);
}
/** The changes as text to paste: each node, then its line before and after. */
export function changesText(): string {
  return changes().map((c: Change) => c.where + '\n' + (c.was === 'style' ? '' : '- ' + c.was + '\n') + '+ ' + c.now).join('\n\n');
}

// ---- live edits of a zinc:stage node (dev runs): its position, size, scale, rotation, alpha, visibility
const STAGE_EDITABLE: string[] = ['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation', 'alpha', 'visible'];
export async function setStageProp(name: string, value: string): Promise<boolean> {
  const id = target(), n = nodeOf(id), v = value.trim();
  if (n === null || !(n as TNode).stage) return false;
  const r = await call('DOM.setAttributeValue', `{"nodeId":${id},"name":${JSON.stringify(name)},"value":${JSON.stringify(v)}}`);
  const e = errorOf(r);
  if (e.length > 0) { setStatus(e); return false; }
  const a = (n as TNode).attrs;
  for (let i = 0; i + 1 < a.length; i += 2) if (a[i] === name) a[i + 1] = v;
  if (name === 'visible') (n as TNode).hidden = v === 'false';
  (n as TNode).props = a.join(' ');
  setStatus(name + ' set (not written to your source)');
  setEdits(edits() + 1);
  await readStyles();
  refilter();
  return true;
}

// ---- the views of the right column shared with styles.tsx (the tree is tree.tsx)
/** The right column of Elements: component and props, live styling, box model and computed style. */
export function CompBox(p: { c: TNode }): i32 {   // the component selected (or the one that rendered the node): where it is called, its props as written
  return <View className="flex-col gap-1 p-2 rounded bg-sky-50 border border-sky-100">
    <Text className="text-xs font-medium text-sky-900">{'<' + p.c.tag + '>' + (p.c.source.length > 0 ? ' · ' + p.c.source : '')}</Text>
    <Text className="text-xs font-mono text-slate-700">{p.c.props.length > 0 ? p.c.props : 'no props'}</Text>
  </View>;
}
function StageRow(p: { name: string; value: string }): i32 {
  return <View className="flex-row items-center gap-2">
    <Text className="w-16 text-xs font-mono text-rose-700">{p.name + ':'}</Text>
    {devRun() && STAGE_EDITABLE.indexOf(p.name) >= 0 ? <Field value={() => p.value} width="w-24" onInput={(v: string) => {}} onChange={(v: string) => { setStageProp(p.name, v); }} /> :
      <Text className="text-xs font-mono text-slate-800">{p.value}</Text>}
  </View>;
}
/** The right column for a zinc:stage node: its class and properties, edited live in dev runs. */
export function StageBox(): i32 {
  const rows = (): string[][] => { const a = stageAttrs(), out: string[][] = []; for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]); return out; };
  const n = nodeOf(target());
  return <View className="flex-col gap-1 p-2">
    <Text className="text-xs font-medium text-sky-900">{n !== null ? '<' + (n as TNode).tag + '>' : ''}</Text>
    <Text className={'text-xs ' + (devRun() ? 'text-emerald-700' : 'text-amber-700')}>{devRun() ? 'Live: edits apply at once and are not written to your source.' :
      'Read-only: live edits need a dev run (start the program with zinc dev).'}</Text>
    <View className="flex-col gap-1">{rows().map((r: string[]) => <StageRow name={r[0]} value={r[1]} />)}</View>
    <Text className="text-xs font-medium text-slate-600">{box() === '' ? 'Box' : 'Box · ' + box()}</Text>
  </View>;
}
/** ZINC_INSPECTOR_DUMP: the tree under each filter, a component selected, and live styling (or its refusal), as text. */
export async function dumpElements(): Promise<void> {
  const show = (title: string): void => {   // a node a line, its inline text on the next one
    console.log(title + ':');
    for (const r of rows()) if (!r.close) {
      console.log('  '.repeat(r.depth + 1) + label(r.node));
      const t = inlineText(r.node);
      if (t !== null) console.log('  '.repeat(r.depth + 2) + label(t as TNode));
    }
  };
  console.log('elements, folded:');   // as the panel opens: the roots open, the rest folded; then Alt-click on a root opens its whole subtree
  for (const r of rows()) console.log('  '.repeat(r.depth + 1) + lineOf(r).text);
  for (const r of roots) toggleFold(r.id, true);   // the roots were open: Alt-click folds them all, a second one opens everything
  console.log('alt-click folds: ' + rows().length + ' rows');
  for (const r of roots) toggleFold(r.id, true);
  show('elements');
  setRenderedOnly(false); refilter();
  show('elements, all');
  setRenderedOnly(true);
  setComponentsOnly(true); refilter();
  show('components only');
  setComponentsOnly(false);
  setHideWrappers(true); refilter();
  console.log('hide host wrappers: ' + rows().length + ' rows');
  setHideWrappers(false);
  setQuery('rose'); refilter();
  show('search rose');
  setQuery(''); refilter();
  for (const r of rows()) if (r.node.comp && r.node.props.length > 0) {   // a component: its props, and the host node it draws first
    await select(r.node.id);
    const t = nodeOf(target());
    console.log('component: <' + r.node.tag + '> ' + r.node.source + ' ' + r.node.props + ' | styles ' + (t !== null ? label(t as TNode) : 'none'));
    break;
  }
  for (const r of rows()) if (r.node.stage && stageAttr(r.node, 'alpha') !== '') {   // a zinc:stage scene: a node with a property of its own class (alpha), an edit of x
    await dumpStage(r.node);
    return;
  }
  let sq: TNode | null = null;   // live styling on the first square
  for (const r of rows()) if (r.node.cls.indexOf('w-4') >= 0) { sq = r.node; break; }
  if (sq === null) return;
  await select((sq as TNode).id);
  console.log('dev run: ' + devRun());
  const w0 = computedValue('width');
  if (!(await addClass('w-8'))) {   // not a dev run: both edits are refused and the node keeps its width
    console.log('class refused: ' + status());
    await setProp('width', '50px');
    console.log('style refused: ' + status() + ' | width still ' + computedValue('width'));
    return;
  }
  const w1 = computedValue('width');
  await toggleClass('w-8');
  const w2 = computedValue('width');
  await toggleClass('w-8');
  console.log('class edit: width ' + w0 + ' -> ' + w1 + ', off ' + w2 + ', on ' + computedValue('width') + ' | ' + label(now(sq as TNode)));
  await complete('bg-ros');
  console.log('completion bg-ros: ' + completions().slice(0, 3).join(' '));
  await setProp('width', '50px');
  const s1 = computedValue('width');
  await toggleProp('width');
  const s2 = computedValue('width');
  await toggleProp('width');
  const s3 = computedValue('width');
  await deleteProp('width');
  console.log('style edit: width ' + s1 + ', off ' + s2 + ', on ' + s3 + ', deleted ' + computedValue('width') + ' | element.style ' + inline().text);
  await editClass('w-8', 'w-12');   // a class edited in place (Chrome's .cls pane)
  console.log('class edited in place: width ' + computedValue('width') + ' | ' + label(now(sq as TNode)));
  for (const r of rows()) { const t = inlineText(r.node); if (r.node.tag === 'Text' && t !== null) { await dumpTextStyles(r.node); break; } }
  await sleep(300);   // the patch reaches the console
}
/** Node n as the tree holds it now: a DOM event reloads the document into new nodes. */
function now(n: TNode): TNode { const x = nodeOf(n.id); return x !== null ? x as TNode : n; }
/** A Text's properties in the Styles pane, its font size stepped up by the arrow key and its alignment set, then both removed. */
async function dumpTextStyles(n: TNode): Promise<void> {
  await select(n.id);
  console.log('text properties: ' + propsFor(n.tag).join(' '));
  const f0 = computedValue('font-size'), up = stepValue(f0, 10);
  await setProp('font-size', up);
  await setProp('text-align', 'center');
  const f1 = computedValue('font-size'), a1 = computedValue('text-align');
  await deleteProp('font-size'); await deleteProp('text-align');
  console.log('text style edit: font-size ' + f0 + ' -> ' + f1 + ', text-align ' + a1 + ', removed ' + computedValue('font-size') + ' ' + computedValue('text-align'));
}

function hasNamed(n: TNode, nm: string): boolean { if (n.stage && stageAttr(n, 'name') === nm) return true; for (const k of n.kids) if (hasNamed(k, nm)) return true; return false; }
/** A zinc:stage node selected (its properties and box), then its x moved by 100: the box and the program's frame follow. */
async function dumpStage(n: TNode): Promise<void> {
  const named = (nm: string): boolean => { for (const x of roots) if (hasNamed(x, nm)) return true; return false; };
  const ghost = named('ghost');   // the scene of main.ts, which answers the move below
  await select(n.id);
  const left = async (): Promise<number> => { const b = await call('DOM.getBoxModel', `{"nodeId":${n.id}}`); const x: number = b.model !== undefined ? b.model.content[0] : -1; return x; };
  const pairs: string[] = [];
  for (let i = 0; i + 1 < stageAttrs().length; i += 2) pairs.push(stageAttrs()[i] + '=' + stageAttrs()[i + 1]);
  console.log('stage node: ' + label(n) + ' ' + pairs.join(' ') + ' | box ' + box());
  console.log('dev run: ' + devRun());
  const x0 = stageAttr(n, 'x'), l0 = await left();
  const before: string = (await call('Page.captureScreenshot', '{}')).data;
  const ok = await setStageProp('x', `${Number(x0) + 100}`);
  if (!ok) { console.log('stage edit refused: ' + status()); return; }
  await sleep(300);
  const after: string = (await call('Page.captureScreenshot', '{}')).data;
  console.log('stage edit: x ' + x0 + ' -> ' + stageAttr(n, 'x') + ', box left ' + l0 + ' -> ' + (await left()) + ' | frame changed: ' + (before !== after));
  console.log('bad edit: ' + ((await setStageProp('alpha', 'abc')) ? 'applied' : status()));
  for (const r of rows()) if (r.node.stage && stageAttr(r.node, 'src') !== '') { console.log('stage image: ' + lineOf(r).text); break; }
  for (const r of rows()) {   // a node's text as its inline child, edited in place: the program draws the new one
    const t = inlineText(r.node);
    if (!r.node.stage || t === null) continue;
    console.log('stage text: ' + lineOf(r).text);
    const was: string = (await call('Page.captureScreenshot', '{}')).data;
    const done = await setTextOf((t as TNode).id, 'Score: 99');
    await sleep(300);
    const now: string = (await call('Page.captureScreenshot', '{}')).data;
    const back = await call('DOM.getDocument', '{"depth":-1}');
    console.log('stage text edit: ' + (done ? 'program text ' + (JSON.stringify(back).indexOf('"Score: 99"') >= 0) + ' | frame changed: ' + (was !== now) : 'refused: ' + status()));
    break;
  }
  // the program answers the move (tests/data/inspector_stage): a node joins, another leaves, the ball drops; the tree and its values follow
  if (!ghost) return;
  const live = await until(() => named('spark') && !named('ghost'));
  const moved = await until(() => { const a = stageAttrs(); for (let i = 0; i + 1 < a.length; i += 2) if (a[i] === 'y') return a[i + 1] === '60'; return false; });
  console.log('live: spark inserted, ghost removed ' + live + ' | selected y follows ' + moved);
  for (const r of rows()) if (r.node.stage && stageAttr(r.node, 'rotation') !== '') {   // a turned node: its box turns with it
    const m = await call('DOM.getBoxModel', `{"nodeId":${r.node.id}}`);
    const qd: number[] = m.model.content, w: number = m.model.width, h: number = m.model.height;
    console.log('turned: ' + label(r.node) + ' quad ' + qd.join(',') + ' | ' + w + ' × ' + h);
  }
}
