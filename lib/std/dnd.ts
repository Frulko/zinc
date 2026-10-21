// zinc:ui/dnd — drag and drop between nodes, after Atlassian's Pragmatic drag and drop (github.com/atlassian/pragmatic-drag-and-drop):
// `draggable` on what can be dragged, `dropTarget` on where it can land, `monitor` for whoever wants to watch every drag, the closest
// edge of a target (reordering) and `autoScroll` on a scroll container. That library sits on the browser's HTML5 drag and drop; this one
// sits on zinc:ui's onDrag gesture (pointer capture, threshold) and its hit test, so it works the same with a mouse, a finger or a pen
// on every target. The drag preview is the app's (a monitor knows where the pointer is); nothing is drawn here.
import * as ui from 'zinc:ui';

export const EDGE_NONE: i32 = 0, EDGE_TOP: i32 = 1, EDGE_RIGHT: i32 = 2, EDGE_BOTTOM: i32 = 4, EDGE_LEFT: i32 = 8;
export const EDGES_VERTICAL: i32 = 5, EDGES_HORIZONTAL: i32 = 10;

/** A drop target under the pointer: its node, its data and the edge of its box the pointer is closest to (among its `edges`). */
export class DropRecord {
  node: i32; data: string; edge: i32;
  constructor(node: i32, data: string, edge: i32) { this.node = node; this.data = data; this.edge = edge; }
}
/** What every callback receives (Pragmatic's `source` and `location`). */
export class DragInfo {
  source: i32 = -1; data: string = '';   // the draggable node and its data
  x: number = 0; y: number = 0;          // the pointer, surface pixels
  dx: number = 0; dy: number = 0;        // since the drag started
  targets: DropRecord[] = [];            // under the pointer, innermost first (location.current.dropTargets)
  previous: DropRecord[] = [];           // before the last change (location.previous.dropTargets)
  self: DropRecord | null = null;        // in a drop target's callbacks: its own record
}
export interface DraggableOptions {
  data?: string;
  handle?: i32;                          // the node that starts the drag (default: the draggable node itself)
  threshold?: number;                    // px before a press becomes a drag (default 3)
  canDrag?: () => boolean;
  onDragStart?: (d: DragInfo) => void;
  onDrag?: (d: DragInfo) => void;
  onDrop?: (d: DragInfo) => void;        // also when cancelled: targets is then empty
}
export interface DropTargetOptions {
  data?: string;
  edges?: i32;                           // EDGE_* bits the closest edge is chosen among (default EDGE_NONE)
  canDrop?: (d: DragInfo) => boolean;
  onDragEnter?: (d: DragInfo) => void;
  onDragLeave?: (d: DragInfo) => void;
  onDrag?: (d: DragInfo) => void;
  onDrop?: (d: DragInfo) => void;
}
export interface MonitorOptions {
  onDragStart?: (d: DragInfo) => void;
  onDrag?: (d: DragInfo) => void;
  onDropTargetChange?: (d: DragInfo) => void;
  onDrop?: (d: DragInfo) => void;
}

class Source { node: i32; o: DraggableOptions; constructor(node: i32, o: DraggableOptions) { this.node = node; this.o = o; } }
class Target { node: i32; o: DropTargetOptions; constructor(node: i32, o: DropTargetOptions) { this.node = node; this.o = o; } }

const sources = new Map<i32, Source>();
const targets = new Map<i32, Target>();
const monitors: MonitorOptions[] = [];
const scrollers: i32[] = [];
let active: DragInfo | null = null;
let activeSource: Source | null = null;

function call(f: ((d: DragInfo) => void) | undefined, d: DragInfo): void { if (f !== undefined) f(d); }
function callTarget(r: DropRecord, kind: i32, d: DragInfo): void {
  const t = targets.get(r.node);
  if (t === undefined) return;
  d.self = r;
  const o = t.o;
  call(kind === 0 ? o.onDragEnter : kind === 1 ? o.onDragLeave : kind === 2 ? o.onDrag : o.onDrop, d);
  d.self = null;
}

function closestEdge(h: i32, edges: i32, x: number, y: number): i32 {
  if (edges === EDGE_NONE) return EDGE_NONE;
  const b = ui.screenBox(h);
  let best: i32 = EDGE_NONE, dist: number = 1e9;
  if ((edges & EDGE_TOP) !== 0 && y - b[1] < dist) { dist = y - b[1]; best = EDGE_TOP; }
  if ((edges & EDGE_BOTTOM) !== 0 && b[1] + b[3] - y < dist) { dist = b[1] + b[3] - y; best = EDGE_BOTTOM; }
  if ((edges & EDGE_LEFT) !== 0 && x - b[0] < dist) { dist = x - b[0]; best = EDGE_LEFT; }
  if ((edges & EDGE_RIGHT) !== 0 && b[0] + b[2] - x < dist) { best = EDGE_RIGHT; }
  return best;
}
/** The drop targets under (x, y): the node there and its ancestors that are targets and accept the drag, innermost first. */
function targetsAt(d: DragInfo): DropRecord[] {
  const out: DropRecord[] = [];
  for (let h = ui.nodeAt(d.x, d.y); h >= 0; h = ui.parentOf(h)) {
    const t = targets.get(h);
    if (t === undefined) continue;
    const can = t.o.canDrop;
    if (can !== undefined && !can(d)) continue;
    out.push(new DropRecord(h, t.o.data !== undefined ? t.o.data as string : '', closestEdge(h, t.o.edges !== undefined ? t.o.edges as i32 : EDGE_NONE, d.x, d.y)));
  }
  return out;
}
function has(list: DropRecord[], h: i32): boolean { for (const r of list) if (r.node === h) return true; return false; }

/** The pointer moved, or what is under it did (auto-scroll): new targets, enter / leave, then onDrag everywhere. */
function update(d: DragInfo): void {
  const now = targetsAt(d), was = d.targets;
  let changed = now.length !== was.length;
  for (let i = 0; !changed && i < now.length; i++) changed = now[i].node !== was[i].node;
  if (changed) {
    d.previous = was; d.targets = now;
    for (const r of was) if (!has(now, r.node)) callTarget(r, 1, d);
    for (const r of now) if (!has(was, r.node)) callTarget(r, 0, d);
    for (const m of monitors) call(m.onDropTargetChange, d);
  } else d.targets = now;   // same targets, new edges
  if (activeSource !== null) call((activeSource as Source).o.onDrag, d);
  for (const r of d.targets) callTarget(r, 2, d);
  for (const m of monitors) call(m.onDrag, d);
}

// ---- auto-scroll: near the top or bottom edge of a registered scroll container, it scrolls faster the closer the pointer is
const ZONE: number = 56, MAX_STEP: number = 14;
function scrollStep(): void {
  const d = active;
  if (d === null) return;
  let moved = false;
  for (const h of scrollers) {
    const b = ui.screenBox(h);
    if (d.x < b[0] || d.x > b[0] + b[2]) continue;
    const top = d.y - b[1], bottom = b[1] + b[3] - d.y, zone = Math.min(ZONE, b[3] / 5);   // a small container keeps most of itself to drop on
    const step = top >= 0 && top < zone ? -MAX_STEP * (1 - top / zone) : bottom >= 0 && bottom < zone ? MAX_STEP * (1 - bottom / zone) : 0;
    if (step === 0) continue;
    const before = ui.scrollTop(h);
    ui.scrollTo(h, ui.scrollLeft(h), before + step);
    if (ui.scrollTop(h) !== before) moved = true;
  }
  if (moved) update(d as DragInfo);
}

function onGesture(s: Source, e: ui.PointerEvent): void {
  if (e.phase === 0) {
    const can = s.o.canDrag;
    if (can !== undefined && !can()) return;
    const d = new DragInfo();
    d.source = s.node; d.data = s.o.data !== undefined ? s.o.data as string : '';
    d.x = e.gx; d.y = e.gy;
    active = d; activeSource = s;
    d.targets = targetsAt(d);
    call(s.o.onDragStart, d);
    for (const m of monitors) call(m.onDragStart, d);
    for (const r of d.targets) callTarget(r, 0, d);
    if (scrollers.length > 0) ui.addStepper(scrollStep);
    return;
  }
  const d = active;
  if (d === null || activeSource !== s) return;
  const info = d as DragInfo;
  info.x = e.gx; info.y = e.gy; info.dx = e.dx; info.dy = e.dy;
  if (e.phase === 1) { update(info); return; }
  // 2 dropped, 3 cancelled (Pragmatic: a cancel is a drop on nothing)
  if (e.phase === 3) { info.previous = info.targets; info.targets = []; }
  else update(info);
  for (const r of info.targets) callTarget(r, 3, info);
  call(s.o.onDrop, info);
  for (const m of monitors) call(m.onDrop, info);
  active = null; activeSource = null;
  ui.removeStepper(scrollStep);
}

/** Makes a node draggable; returns the function that undoes it. */
export function draggable(node: i32, o: DraggableOptions): () => void {
  const s = new Source(node, o);
  const handle = o.handle !== undefined ? o.handle as i32 : node;
  sources.set(handle, s);
  ui.setNumber(handle, 'dragThreshold', o.threshold !== undefined ? o.threshold as number : 3);
  ui.onPointer(handle, ui.PDRAG, (e: ui.PointerEvent) => { const cur = sources.get(handle); if (cur !== undefined) onGesture(cur, e); });
  // ponytail: the gesture handler stays on the handle (zinc:ui has no removal); it does nothing once unregistered
  return () => { if (sources.get(handle) === s) sources.delete(handle); };
}
/** Makes a node a place to drop on; returns the function that undoes it. */
export function dropTarget(node: i32, o: DropTargetOptions): () => void {
  const t = new Target(node, o);
  targets.set(node, t);
  return () => { if (targets.get(node) === t) targets.delete(node); };
}
/** Watches every drag; returns the function that stops it. */
export function monitor(o: MonitorOptions): () => void {
  monitors.push(o);
  return () => { const i = monitors.indexOf(o); if (i >= 0) monitors.splice(i, 1); };
}
/** Scrolls a scroll container while a drag nears its top or bottom edge; returns the function that stops it. */
export function autoScroll(scroller: i32): () => void {
  if (scrollers.indexOf(scroller) < 0) scrollers.push(scroller);
  return () => { const i = scrollers.indexOf(scroller); if (i >= 0) scrollers.splice(i, 1); };
}
/** The drag in progress (null: none). */
export function currentDrag(): DragInfo | null { return active; }
