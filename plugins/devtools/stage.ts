// The zinc:stage display tree in the inspector's Elements (the AS3-style scene of examples/music-tree and fatty), when the program has a
// Stage and no zinc:ui tree: each node is an element named after its class (Sprite, the program's GameManager...) with its name, position,
// size, scale, rotation, alpha, visibility and child count as attributes. The properties are read through an `any` view of the node, so a
// subclass's own fields (fatty's alpha, scaleX, rotation) show and can be set like the base's; a property the node does not have is left out.
import { stages, DisplayObject, uiState, setAfterRender } from 'zinc:stage';
import { rrect, border, resetTransform } from 'zinc:gfx';

/** Node ids of the display tree, apart from the zinc:ui handles and text ids of index.ts. */
export const STAGE_BASE: i32 = 100000000;
const PROPS: string[] = ['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation', 'alpha', 'visible'];
const known: DisplayObject[] = [];
const ids = new Map<DisplayObject, i32>();

function q(s: string): string { return JSON.stringify(s); }
function idOf(o: DisplayObject): i32 {
  const i = ids.get(o);
  if (i !== undefined) return i;
  const id = STAGE_BASE + known.length;
  ids.set(o, id);
  known.push(o);
  return id;
}
/** The first Stage made, or null: the tree Elements shows when the program has no zinc:ui tree. */
export function stageRoot(): DisplayObject | null { return stages.length > 0 ? stages[0] : null; }
/** The node of a DevTools id, or null. */
export function stageNode(id: i32): DisplayObject | null { const k = id - STAGE_BASE; return k >= 0 && k < known.length ? known[k] : null; }

/** A property as text: numbers rounded to 3 decimals, '' when the node has no such property. */
function prop(o: DisplayObject, name: string): string {
  const d: any = o;
  const v: any = d[name];
  if (v === undefined) return '';
  const s = `${v}`, n = Number(s);
  return s === 'true' || s === 'false' || isNaN(n) ? s : `${Math.round(n * 1000) / 1000}`;
}
function attrs(o: DisplayObject): string[] {
  const a: string[] = ['stage', '', 'name', o.name];
  for (const p of PROPS) { const v = prop(o, p); if (v.length > 0) { a.push(p); a.push(v); } }
  a.push('children'); a.push(`${o.children.length}`);
  return a;
}
function element(o: DisplayObject): string {
  const kids: string[] = [];
  for (const c of o.children) kids.push(element(c));
  const id = idOf(o), cls = o.constructor.name;
  return `{"nodeId":${id},"backendNodeId":${id},"nodeType":1,"nodeName":${q(cls)},"localName":${q(cls)},"nodeValue":"",` +
    `"childNodeCount":${kids.length},"children":[${kids.join(',')}],"attributes":[${attrs(o).map((v: string) => q(v)).join(',')}]}`;
}
/** The document node of DOM.getDocument (document id `doc`). */
export function stageDocument(doc: i32): string {
  const r = stageRoot();
  const root = r !== null ? element(r as DisplayObject) : '';
  return `{"nodeId":${doc},"backendNodeId":${doc},"nodeType":9,"nodeName":"#document","localName":"","nodeValue":"","childNodeCount":${root.length > 0 ? 1 : 0},` +
    `"children":[${root}],"documentURL":"zinc://app","baseURL":"zinc://app","xmlVersion":""}`;
}
/** The ids of the nodes not drawn: hidden, or under a hidden node ("rendered only"). */
export function stageUnrendered(): i32[] {
  const out: i32[] = [];
  const walk = (o: DisplayObject, hidden: boolean): void => {
    const h = hidden || !o.visible;
    if (h) out.push(idOf(o));
    for (const c of o.children) walk(c, h);
  };
  const r = stageRoot();
  if (r !== null) walk(r as DisplayObject, false);
  return out;
}

// The node's box on the screen: its x and y in its parent, scaled by the scaleX and scaleY of the nodes above it (a node without them: 1).
// ponytail: rotation and a pivot (fatty's) are not followed; the box is the unrotated one.
let boxX = 0, boxY = 0, boxW = 0, boxH = 0;
function scaleOf(o: DisplayObject, name: string): number { const v = prop(o, name); return v.length > 0 ? Number(v) : 1; }
function measure(o: DisplayObject): void {
  const chain: DisplayObject[] = [];
  for (let n: DisplayObject | null = o; n !== null; n = (n as DisplayObject).parent) chain.unshift(n as DisplayObject);
  let x = 0, y = 0, sx = 1, sy = 1, w = 0, h = 0;
  for (const n of chain) {
    x += n.x * sx; y += n.y * sy;
    w = n.width > 0 ? n.width : w; h = n.height > 0 ? n.height : h;
    sx *= scaleOf(n, 'scaleX'); sy *= scaleOf(n, 'scaleY');
  }
  boxX = x; boxY = y; boxW = w * sx; boxH = h * sy;
}
/** DOM.getBoxModel of a node. */
export function stageBoxModel(o: DisplayObject): string {
  measure(o);
  const x = Math.round(boxX), y = Math.round(boxY), w = Math.round(boxW), h = Math.round(boxH);
  const quad = `[${x},${y},${x + w},${y},${x + w},${y + h},${x},${y + h}]`;
  return `{"model":{"content":${quad},"padding":${quad},"border":${quad},"margin":${quad},"width":${w},"height":${h}}}`;
}

// Overlay.highlightNode: a box drawn over the scene after each drawing of the Stage.
let lit: DisplayObject | null = null;
export function stageHighlight(o: DisplayObject | null): void {
  if (o === lit) return;
  lit = o;
  setAfterRender(o === null ? null : () => {
    const n = lit;
    if (n === null || !(n as DisplayObject).isOnStage) return;
    measure(n as DisplayObject);
    resetTransform();
    rrect(boxX, boxY, boxW, boxH, 0, 0x3b82f6, 90);
    border(boxX, boxY, boxW, boxH, 0, 1, 0x60a5fa, 255);
  });
  uiState.dirty = true;
}

/** DOM.setAttributeValue on a node: x, y, width, height, scaleX, scaleY, rotation, alpha (numbers) or visible (true / false). '' when set,
 *  else why not. */
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
  return '';
}
