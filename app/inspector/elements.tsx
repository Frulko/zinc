// The Elements panel of Zinc Inspector: the program's tree with its components (<AlbumGrid>, <NowPlaying>... around the host nodes they
// render, dev runs), collapsible, searched (component, tag, className, text, id) and filtered (rendered only, components only, host
// wrappers hidden); the selected node's component and props, its classes and element.style edited live in dev runs, its box and computed style.
import { createSignal } from 'zinc:ui/solid';
import { call, conn, status, setStatus, devRun, errorOf, sleep } from './state';
import { styleLines, ruleLines, inlineOf, Inline } from './model';
import { Btn, Flat, Toggle, Field, Mono } from './widgets';

/** A node of the tree as DOM.getDocument sends it. */
export class TNode {
  id: i32 = 0; text: boolean = false; tag: string = ''; comp: boolean = false; cls: string = ''; value: string = '';
  source: string = ''; props: string = ''; hidden: boolean = false; on: string = '';
  stage: boolean = false; attrs: string[] = [];   // a node of a zinc:stage scene: its class is `tag`, its properties `attrs` (name, value...)
  kids: TNode[] = []; parent: TNode | null = null;
  hay: string = '';   // what the search looks in, lower case
}
/** A row shown: a node at its depth; `match` when the search found it. */
export class Row { node: TNode; depth: i32; match: boolean; constructor(node: TNode, depth: i32, match: boolean) { this.node = node; this.depth = depth; this.match = match; } }

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
      if (x.stage) {
        const at = d.attributes;
        for (let i = 0; i + 1 < at.length; i += 2) { const k: string = at[i]; const v: string = at[i + 1]; if (k !== 'stage') { x.attrs.push(k); x.attrs.push(v); } }
        x.hidden = attr(d, 'visible') === 'false';
        x.props = x.attrs.join(' ');
      }
      x.hay = (x.tag + ' ' + x.cls + ' #' + x.id + ' ' + x.source + ' ' + x.props).toLowerCase();
    }
    byId.set(x.id, x);
    if (parent !== null) (parent as TNode).kids.push(x); else roots.push(x);
    n = x;
  }
  const kids = d.children;
  if (kids !== undefined) for (const k of kids) build(k, n !== null ? n : parent, byId, roots);
}
/** A row's text: <Card> for a component, <View className="..."> for a host node, "text" for text. */
export function label(n: TNode): string {
  if (n.text) return '"' + n.value + '"';
  if (n.comp) return '<' + n.tag + '>';
  if (n.stage) { const nm = stageAttr(n, 'name'); return '<' + n.tag + (nm.length > 0 ? ' name="' + nm + '"' : '') + (n.hidden ? ' hidden' : '') + '>'; }
  return '<' + n.tag + (n.cls.length > 0 ? ' className="' + n.cls + '"' : '') + (n.hidden ? ' hidden' : '') + '>';
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
const collapsed = new Set<i32>();
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
  let d = depth;
  if (shown) {
    out.push(new Row(n, depth, q.length > 0 && n.hay.indexOf(q) >= 0));
    d = depth + 1;
    if (q.length === 0 && collapsed.has(n.id)) return;   // a search opens what it finds inside folded nodes
  }
  for (const k of n.kids) walk(k, d, q, hit, out);
}
/** The rows, from the tree and the filters. */
export function refilter(): void {
  const q = query().trim().toLowerCase(), hit = new Set<i32>(), out: Row[] = [];
  if (q.length > 0) for (const r of roots) marks(r, q, hit);
  for (const r of roots) walk(r, 0, q, hit, out);
  setRows(out);
}
export function toggleFold(id: i32): void { if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); refilter(); }
export function nodeOf(id: i32): TNode | null { const n = byId.get(id); return n !== undefined ? n : null; }
/** A component's first host node (what it draws), or null. */
function firstHost(n: TNode): TNode | null {
  for (const k of n.kids) { if (!k.text && !k.comp) return k; const f = firstHost(k); if (f !== null) return f; }
  return null;
}
function ownerOf(n: TNode): TNode | null { for (let p = n.parent; p !== null; p = (p as TNode).parent) if ((p as TNode).comp) return p; return null; }

/** Selects a row: a component shows its props and styles its first host node; a host node shows the component that rendered it. */
export async function select(id: i32): Promise<void> {
  const n = nodeOf(id);
  if (n === null) return;
  setSelected(id);
  const t = n.comp ? firstHost(n) : n.text ? n.parent : n;
  setComp(n.comp ? n : ownerOf(n));
  setTarget(t !== null ? (t as TNode).id : -1);
  await readStyles();
}
/** Computed style, box model, rules and element.style of the target, read again. */
export async function readStyles(): Promise<void> {
  const id = target();
  if (id < 0) { setStyles([]); setBox(''); setBoxLines([]); setRules([]); setClasses([]); setDecls([]); setStageAttrs([]); return; }
  call('Overlay.highlightNode', `{"nodeId":${id},"highlightConfig":{}}`);
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
  const n = nodeOf(id), off = offClasses.get(id);
  const on = n !== null ? (n as TNode).cls.split(' ').filter((c: string) => c.length > 0) : [];
  setClasses(on.concat(off !== undefined ? off : []));
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
async function setClassList(on: string[], off: string[]): Promise<boolean> {
  const id = target(), n = nodeOf(id);
  if (n === null) return false;
  const v = on.join(' ');
  const r = await call('DOM.setAttributeValue', `{"nodeId":${id},"name":"class","value":${JSON.stringify(v)}}`);
  const e = errorOf(r);
  if (e.length > 0) { setStatus(e); return false; }
  (n as TNode).cls = v; offClasses.set(id, off);
  setStatus('className applied (not written to the source)');
  setEdits(edits() + 1);
  await readStyles();
  refilter();
  return true;
}
function onClasses(): string[] { const n = nodeOf(target()); return n !== null ? (n as TNode).cls.split(' ').filter((c: string) => c.length > 0) : []; }
function offOf(): string[] { const o = offClasses.get(target()); return o !== undefined ? o.slice(0) : []; }
export async function addClass(c: string): Promise<boolean> {
  const t = c.trim();
  if (t.length === 0) return false;
  const on = onClasses().filter((x: string) => x !== t); on.push(t);
  const ok = await setClassList(on, offOf().filter((x: string) => x !== t));
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
/** The known classes that start with the last word typed (Zinc.completeClass). */
export async function complete(text: string): Promise<void> {
  setClassDraft(text);
  const w = text.trim();
  if (w.length === 0) { setCompletions([]); return; }
  const r = await call('Zinc.completeClass', `{"prefix":${JSON.stringify(w)}}`);
  const out: string[] = [];
  if (r.classes !== undefined) for (const c of r.classes) { const s: string = c; if (out.length < 12) out.push(s); }
  setCompletions(out);
}
/** element.style of the target becomes the panel's properties (switched-off ones as comments, which apply nothing). */
async function applyDecls(list: Decl[]): Promise<boolean> {
  const id = target(), i = inline();
  if (id < 0 || i.sheet === '') return false;
  const text = list.map((d: Decl) => d.on ? d.name + ': ' + d.value + ';' : '/* ' + d.name + ': ' + d.value + '; */').join(' ');
  const r = await call('CSS.setStyleTexts', `{"edits":[{"styleSheetId":${JSON.stringify(i.sheet)},"range":${i.range},"text":${JSON.stringify(text)}}]}`);
  const e = errorOf(r);
  if (e.length > 0) { setStatus(e); return false; }
  declsOf.set(id, list);
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
export async function toggleProp(name: string): Promise<boolean> { const l = copyDecls(); for (const d of l) if (d.name === name) d.on = !d.on; return await applyDecls(l); }
export async function deleteProp(name: string): Promise<boolean> { return await applyDecls(copyDecls().filter((d: Decl) => d.name !== name)); }

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

// ---- the views
function TreeRow(p: { r: Row }): i32 {
  const n = p.r.node;
  const fold = n.kids.length > 0 && !n.text;
  const color = n.text ? 'text-slate-700' : n.comp ? 'text-sky-800 font-medium' : 'text-purple-800';
  return <View className={'flex-row items-center h-5 ' + (selected() === n.id ? 'bg-sky-100' : p.r.match ? 'bg-amber-50' : 'bg-white')} style={{ paddingLeft: 4 + p.r.depth * 12 }}>
    <Button className="w-4 h-5 flex-row items-center justify-center bg-white" onClick={() => { if (fold) toggleFold(n.id); }}>
      <Text className="text-xs text-slate-500">{fold ? (collapsed.has(n.id) && query().length === 0 ? '+' : '-') : ''}</Text>
    </Button>
    <Button className="flex-1 flex-row items-center justify-start h-5 bg-transparent" onClick={() => { select(n.id); }}>
      <Text className={'text-xs font-mono ' + color}>{label(n)}</Text>
      {n.comp && n.source.length > 0 ? <Text className="ml-2 text-xs text-slate-400">{n.source}</Text> : <View />}
    </Button>
  </View>;
}

export function ElementsView(): i32 {
  return <View className="flex-col flex-1">
    <View className="flex-row items-center gap-2 px-2 py-1 border-b">
      <Field value={query} width="w-56" onInput={(v: string) => { setQuery(v); refilter(); }} onChange={(v: string) => {}} />
      <Toggle label="Rendered only" on={renderedOnly()} onClick={() => { setRenderedOnly(!renderedOnly()); refilter(); }} />
      <Toggle label="Components only" on={componentsOnly()} onClick={() => { setComponentsOnly(!componentsOnly()); refilter(); }} />
      <Toggle label="Hide host wrappers" on={hideWrappers()} onClick={() => { setHideWrappers(!hideWrappers()); refilter(); }} />
      <Text className="text-xs text-slate-500">{rows().length + ' nodes'}</Text>
    </View>
    <VirtualList count={rows().length} itemHeight={20} className="flex-1">
      {(i: i32) => <TreeRow r={rows()[i]} />}
    </VirtualList>
  </View>;
}

function ClassChip(p: { c: string; on: boolean }): i32 {
  return <View className={'flex-row items-center gap-1 h-6 px-1 rounded border ' + (p.on ? 'bg-white border-slate-300' : 'bg-slate-100 border-slate-200')}>
    <Button className="flex-row items-center h-5 bg-transparent" onClick={() => { toggleClass(p.c); }}>
      <Text className={'text-xs font-mono ' + (p.on ? 'text-slate-900' : 'text-slate-400 line-through')}>{p.c}</Text>
    </Button>
    <Button className="h-5 px-1 flex-row items-center bg-transparent" onClick={() => { removeClass(p.c); }}><Text className="text-xs text-slate-400">×</Text></Button>
  </View>;
}
function DeclRow(p: { d: Decl }): i32 {
  return <View className="flex-row items-center gap-1">
    <Toggle label="" on={p.d.on} onClick={() => { toggleProp(p.d.name); }} />
    <Text className={'text-xs font-mono ' + (p.d.on ? 'text-rose-700' : 'text-slate-400 line-through')}>{p.d.name + ':'}</Text>
    <Field value={() => p.d.value} width="w-24" onInput={(v: string) => {}} onChange={(v: string) => { setProp(p.d.name, v); }} />
    <Button className="h-5 px-1 flex-row items-center bg-transparent" onClick={() => { deleteProp(p.d.name); }}><Text className="text-xs text-slate-400">×</Text></Button>
  </View>;
}

/** The right column of Elements: component and props, live styling, box model and computed style. */
function CompBox(p: { c: TNode }): i32 {   // the component selected (or the one that rendered the node): where it is called, its props as written
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
function StageBox(): i32 {
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
export function StylesPane(): i32 {
  return <ScrollView className="flex-1">
    {stageAttrs().length > 0 ? <StageBox /> : <CssPane />}
  </ScrollView>;
}
function CssPane(): i32 {
  return <View className="flex-col">
    <View className="flex-col gap-2 p-2">
      {comp() !== null ? <CompBox c={comp() as TNode} /> : <View />}
      <Text className={'text-xs ' + (devRun() ? 'text-emerald-700' : 'text-amber-700')}>{devRun() ? 'Live: edits apply at once and are not written to your source (the console prints the patch).' :
        'Read-only: live styling needs a dev run (start the program with zinc dev).'}</Text>
      <Text className="text-xs font-medium text-slate-600">className</Text>
      <View className="flex-row flex-wrap gap-1">{classes().map((x: string) => <ClassChip c={x} on={onClasses().indexOf(x) >= 0} />)}</View>
      <View className="flex-row items-center gap-1">
        <Field value={classDraft} width="w-40" onInput={(v: string) => { complete(v); }} onChange={(v: string) => { addClass(v); }} />
        <Btn label="Add class" onClick={() => { addClass(classDraft()); }} />
      </View>
      <View className="flex-row flex-wrap gap-1">{completions().map((x: string) => <Flat label={x} on={false} onClick={() => { addClass(x); }} />)}</View>
      <Text className="text-xs font-medium text-slate-600">element.style</Text>
      <View className="flex-col gap-1">{decls().map((d: Decl) => <DeclRow d={d} />)}</View>
      <View className="flex-row items-center gap-1">
        <Field value={propName} width="w-24" onInput={(v: string) => { setPropName(v); }} onChange={(v: string) => {}} />
        <Field value={propValue} width="w-20" onInput={(v: string) => { setPropValue(v); }} onChange={(v: string) => { setProp(propName(), v); }} />
        <Btn label="Set" onClick={() => { setProp(propName(), propValue()); }} />
      </View>
      <View className="flex-col">{rules().map((l: string) => <Mono text={l} color="text-slate-700" />)}</View>
      <Text className="text-xs font-medium text-slate-600">{box() === '' ? 'Box model' : 'Box model · ' + box()}</Text>
      <View className="flex-col">{boxLines().map((l: string) => <Mono text={l} color="text-slate-700" />)}</View>
      <Text className="text-xs font-medium text-slate-600">Computed</Text>
      <View className="flex-col">{styles().map((s: string) => <Mono text={s} color="text-slate-800" />)}</View>
    </View>
  </View>;
}

/** ZINC_INSPECTOR_DUMP: the tree under each filter, a component selected, and live styling (or its refusal), as text. */
export async function dumpElements(): Promise<void> {
  const show = (title: string): void => { console.log(title + ':'); for (const r of rows()) console.log('  '.repeat(r.depth + 1) + label(r.node)); };
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
  console.log('class edit: width ' + w0 + ' -> ' + w1 + ', off ' + w2 + ', on ' + computedValue('width') + ' | ' + label(sq as TNode));
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
  await sleep(300);   // the patch reaches the console
}

/** A zinc:stage node selected (its properties and box), then its x moved by 100: the box and the program's frame follow. */
async function dumpStage(n: TNode): Promise<void> {
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
}
