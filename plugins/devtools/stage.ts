// The zinc:stage display tree in the inspector's Elements (the AS3-style scene of examples/music-tree and fatty): the whole tree when the program
// has a Stage and no zinc:ui tree, or a stage drawn in a zinc:ui <Canvas> (Stage.drawIn) nested under that Canvas. Each node is an element named
// after its class (Sprite, the program's GameManager...) with its name, position, size, scale, rotation, alpha, visibility and child count as
// attributes. The properties are read through an `any` view of the node, so a subclass's own fields (fatty's alpha, scaleX, rotation) show and
// can be set like the base's; a property the node does not have is left out. The tree follows the program live: zinc:stage tells which parents
// gained or lost children (setTreeWatch), and their changes go out as DOM mutations ten times a second (stageEvents), never a diff of the whole tree.
import { stages, Stage, DisplayObject, uiState, setAfterRender, setTreeWatch } from 'zinc:stage';
import { polygon, line, resetTransform } from 'zinc:gfx';
import { drawingNode, repaint } from 'zinc:ui';

/** Node ids of the display tree, apart from the zinc:ui handles and text ids of index.ts. */
export const STAGE_BASE: i32 = 100000000;
const PROPS: string[] = ['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation', 'pivotX', 'pivotY', 'alpha', 'visible'];
let ids = new Map<DisplayObject, i32>();
let prev = new Map<DisplayObject, i32>();   // the ids before the last DOM.getDocument: a node still in the tree keeps its id (the selection stays)
let nodes = new Map<i32, DisplayObject>();
let next: i32 = STAGE_BASE;
const sent = new Map<i32, DisplayObject[]>();   // by id: the children the frontend was sent
const dirty = new Set<DisplayObject>();         // the parents whose children changed since the last stageEvents
const canvasOf = new Map<Stage, i32>();         // a stage drawn in a zinc:ui Canvas (drawIn): that Canvas's handle

function q(s: string): string { return JSON.stringify(s); }
function idOf(o: DisplayObject): i32 {
  let i = ids.get(o);
  if (i !== undefined) return i;
  const p = prev.get(o);
  const id = p !== undefined ? p : next++;
  ids.set(o, id);
  nodes.set(id, o);
  return id;
}
/** The first Stage made that is not drawn in a Canvas, or null: the tree Elements shows when the program has no zinc:ui tree. */
export function stageRoot(): DisplayObject | null { for (const s of stages) if (!canvasOf.has(s)) return s; return stages.length > 0 ? stages[0] : null; }
/** The node of a DevTools id, or null. */
export function stageNode(id: i32): DisplayObject | null { const o = nodes.get(id); return o !== undefined ? o : null; }
/** The stage drawn in the zinc:ui Canvas `h`, or null. */
export function stageIn(h: i32): DisplayObject | null { for (const s of stages) if (canvasOf.get(s) === h) return s; return null; }
/** The stages drawn in a zinc:ui Canvas. */
export function stageCanvases(): DisplayObject[] { const out: DisplayObject[] = []; for (const s of stages) if (canvasOf.has(s)) out.push(s); return out; }
/** The DevTools id of a node (given one if it has none yet). */
export function stageId(o: DisplayObject): i32 { return idOf(o); }
/** A new DOM.getDocument: what was sent is forgotten, the ids of the nodes sent again are kept. */
export function stageReset(): void { prev = ids; ids = new Map<DisplayObject, i32>(); nodes = new Map<i32, DisplayObject>(); sent.clear(); dirty.clear(); }

/** A property as text: numbers rounded to 3 decimals, '' when the node has no such property. */
function prop(o: DisplayObject, name: string): string {
  const d: any = o;
  const v: any = d[name];
  if (v === undefined) return '';
  const s = `${v}`, n = Number(s);
  return s === 'true' || s === 'false' || isNaN(n) ? s : `${Math.round(n * 1000) / 1000}`;
}
function num(o: DisplayObject, name: string, none: number): number { const v = prop(o, name); return v.length > 0 ? Number(v) : none; }
function attrs(o: DisplayObject): string[] {
  const a: string[] = ['stage', '', 'name', o.name];
  for (const p of PROPS) { const v = prop(o, p); if (v.length > 0) { a.push(p); a.push(v); } }
  a.push('children'); a.push(`${o.children.length}`);
  return a;
}
/** DOM.getAttributes of a node: the inspector reads the selected node's values again while it shows them. */
export function stageAttributes(o: DisplayObject): string { return `{"attributes":[${attrs(o).map((v: string) => q(v)).join(',')}]}`; }
/** The element of a node and its subtree, as DOM.getDocument and DOM.childNodeInserted send it; what is sent is remembered. */
export function stageElement(o: DisplayObject): string {
  const kids: string[] = [];
  for (const c of o.children) kids.push(stageElement(c));
  const id = idOf(o), cls = o.constructor.name;
  sent.set(id, o.children.slice(0));
  return `{"nodeId":${id},"backendNodeId":${id},"nodeType":1,"nodeName":${q(cls)},"localName":${q(cls)},"nodeValue":"",` +
    `"childNodeCount":${kids.length},"children":[${kids.join(',')}],"attributes":[${attrs(o).map((v: string) => q(v)).join(',')}]}`;
}
/** The document node of DOM.getDocument (document id `doc`). */
export function stageDocument(doc: i32): string {
  stageReset();
  const r = stageRoot();
  const root = r !== null ? stageElement(r as DisplayObject) : '';
  return `{"nodeId":${doc},"backendNodeId":${doc},"nodeType":9,"nodeName":"#document","localName":"","nodeValue":"","childNodeCount":${root.length > 0 ? 1 : 0},` +
    `"children":[${root}],"documentURL":"zinc://app","baseURL":"zinc://app","xmlVersion":""}`;
}
function forget(o: DisplayObject): void {
  const id = ids.get(o);
  if (id === undefined) return;
  const kids = sent.get(id);
  if (kids !== undefined) for (const k of kids) forget(k);
  sent.delete(id); ids.delete(o); prev.delete(o); nodes.delete(id);
}
setTreeWatch((parent: DisplayObject) => { dirty.add(parent); });
/** The DOM mutations since the last call: for each parent that was sent and whose children changed, the children it lost, then the ones
 *  it gained after their neighbour, and its child count. The removals of every parent go first: a node moved to another parent is removed,
 *  then inserted with a new id. */
export function stageEvents(): string[] {
  const out: string[] = [];
  if (dirty.size === 0) return out;
  const ps: DisplayObject[] = [], stays: DisplayObject[][] = [];
  dirty.forEach((p: DisplayObject) => { ps.push(p); });
  dirty.clear();
  for (let i = ps.length - 1; i >= 0; i--) {   // 1. removals: kept children in the same order stay, the others go
    const id = ids.get(ps[i]);
    const was = id !== undefined ? sent.get(id) : undefined;
    if (id === undefined || was === undefined) { ps.splice(i, 1); continue; }
    const now = ps[i].children, kept: DisplayObject[] = [], stay: DisplayObject[] = [];
    for (const k of was) if (now.includes(k)) kept.push(k);
    let j = 0;
    for (const k of now) if (j < kept.length && kept[j] === k) { stay.push(k); j++; }
    for (const k of was) if (!stay.includes(k)) {
      out.push(`{"method":"DOM.childNodeRemoved","params":{"parentNodeId":${id},"nodeId":${idOf(k)}}}`);
      forget(k);
    }
    stays.unshift(stay);
  }
  for (let i = 0; i < ps.length; i++) {   // 2. insertions, after the previous sibling (0: first)
    const p = ps[i], id = idOf(p);
    let before: i32 = 0;
    for (const k of p.children) {
      if (!stays[i].includes(k)) out.push(`{"method":"DOM.childNodeInserted","params":{"parentNodeId":${id},"previousNodeId":${before},"node":${stageElement(k)}}}`);
      before = idOf(k);
    }
    sent.set(id, p.children.slice(0));
    out.push(`{"method":"DOM.attributeModified","params":{"nodeId":${id},"name":"children","value":"${p.children.length}"}}`);
  }
  return out;
}

/** The ids of the nodes not drawn under `r`: hidden, or under a hidden node ("rendered only"). */
export function stageUnrendered(r: DisplayObject | null): i32[] {
  const out: i32[] = [];
  const walk = (o: DisplayObject, hidden: boolean): void => {
    const h = hidden || !o.visible;
    if (h) out.push(idOf(o));
    for (const c of o.children) walk(c, h);
  };
  if (r !== null) walk(r as DisplayObject, false);
  return out;
}

// The node's box on the screen: the rectangle (0, 0, width, height) of the node through the matrix of every node from the Stage down to it,
// each one's x, y, scaleX, scaleY, rotation (radians, Starling's) and pivotX, pivotY (fatty's compat layer; a node without them: 1 and 0),
// as fatty's Sprite.renderTree composes them. A node of size 0 takes its parent's, as the layout does.
const quad: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
let boxW = 0, boxH = 0;
function measure(o: DisplayObject): void {
  const chain: DisplayObject[] = [];
  for (let n: DisplayObject | null = o; n !== null; n = (n as DisplayObject).parent) chain.unshift(n as DisplayObject);
  let a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0, w = 0, h = 0;
  for (const n of chain) {
    const r = num(n, 'rotation', 0), sx = num(n, 'scaleX', 1), sy = num(n, 'scaleY', 1), px = num(n, 'pivotX', 0), py = num(n, 'pivotY', 0);
    const cos = Math.cos(r), sin = Math.sin(r);
    const la = cos * sx, lb = sin * sx, lc = -sin * sy, ld = cos * sy;
    const lx = n.x - px * la - py * lc, ly = n.y - px * lb - py * ld;
    const na = a * la + c * lb, nb = b * la + d * lb, nc = a * lc + c * ld, nd = b * lc + d * ld;
    tx = a * lx + c * ly + tx; ty = b * lx + d * ly + ty;
    a = na; b = nb; c = nc; d = nd;
    w = n.width > 0 ? n.width : w; h = n.height > 0 ? n.height : h;
  }
  const corner = (k: i32, x: number, y: number): void => { quad[k] = a * x + c * y + tx; quad[k + 1] = b * x + d * y + ty; };
  corner(0, 0, 0); corner(2, w, 0); corner(4, w, h); corner(6, 0, h);
  boxW = Math.sqrt(a * a + b * b) * w; boxH = Math.sqrt(c * c + d * d) * h;
}
/** DOM.getBoxModel of a node: its four corners on the screen (turned with it), and its size scaled. */
export function stageBoxModel(o: DisplayObject): string {
  measure(o);
  const qs = `[${quad.map((v: number) => `${Math.round(v * 100) / 100}`).join(',')}]`;
  return `{"model":{"content":${qs},"padding":${qs},"border":${qs},"margin":${qs},"width":${Math.round(boxW)},"height":${Math.round(boxH)}}}`;
}

// Overlay.highlightNode: the node's turned box drawn over the scene after each drawing of its Stage (Stage.frame or drawIn); the same call
// learns which zinc:ui Canvas each stage is drawn in.
let lit: DisplayObject | null = null;
setAfterRender((s: Stage) => {
  const h = drawingNode();
  if (h >= 0) canvasOf.set(s, h);
  const n = lit;
  if (n === null || !(n as DisplayObject).isOnStage || (n as DisplayObject).stage !== s) return;
  measure(n as DisplayObject);
  resetTransform();
  polygon(quad.slice(0), 0x3b82f6, 90);
  for (let k = 0; k < 8; k += 2) line(quad[k], quad[k + 1], quad[(k + 2) % 8], quad[(k + 3) % 8], 0x60a5fa);
});
export function stageHighlight(o: DisplayObject | null): void {
  if (o === lit) return;
  lit = o;
  uiState.dirty = true;
  repaint();   // a stage in a Canvas draws when zinc:ui paints
}

/** DOM.setAttributeValue on a node: x, y, width, height, scaleX, scaleY, rotation, pivotX, pivotY, alpha (numbers) or visible (true / false).
 *  '' when set, else why not. */
export function stageSet(o: DisplayObject, name: string, value: string): string {
  if (PROPS.indexOf(name) < 0 || prop(o, name).length === 0) return `'${name}' is not a property of this ${o.constructor.name} that the inspector can set`;
  const d: any = o;
  if (name === 'visible') {
    if (value !== 'true' && value !== 'false') return 'visible is true or false';
    d[name] = value === 'true';
  } else {
    const n = Number(value.trim());
    if (value.trim().length === 0 || isNaN(n)) return `${name} is a number`;
    d[name] = n;
  }
  uiState.dirty = true;
  repaint();
  return '';
}
