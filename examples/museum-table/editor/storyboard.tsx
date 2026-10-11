// The storyboard: the map of the project. Every sequence is a node at its storyboard position (title, a miniature of what lies on the table,
// the kinds of its media), every link an arrow with a handle. Drag a node to move it, the handle under it onto another node to link them, the
// background to pan; the wheel zooms; a double click on the background makes a sequence, on a node opens its table.
// Zoom is done by laying the nodes out at the zoom (four steps), not by a transform, so that texts stay sharp at every step.
import { createSignal, createNodeRef, createMemo, createEffect, For, Show, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { stroke, polygon, rect, setTransform, resetTransform } from 'zinc:gfx';
import { Sequence, Link, Item, unreachable } from '../src/project';
import { project, lang, selected, selectedLink, select, zoom, zoomStep, panX, panY, setPanX, setPanY, zoomBy, CARD_W, CARD_H, setViewSize, addSequence, addSequenceInView,
  moveSequence, link, sourceOf, setStatus, hovered, setHovered, openSequence, fit, viewW, viewH, ZOOMS } from './state';
import { isChosen, toggleSequence, contextMenu } from './tools';
import { Ico, IcoAt, Tool, ACCENT, INK, MUTED, WARN, DARK, KIND_ICON, KIND_COLOUR, kindIndex, drawMedia, shapeOf } from './widgets';
import { PreviewTools } from './preview';
import * as L from './strings';
import { t } from './strings';

function kindOf(it: Item): i32 { return kindIndex(project().medium(it.media)); }
/** "0 3": the kind (an index in KINDS) and how many items of the sequence show one. */
function kindsOf(s: Sequence): string[] {
  project();
  const n: i32[] = [0, 0, 0, 0, 0, 0], out: string[] = [];
  for (const it of s.items) { const k = kindOf(it); if (k >= 0) n[k]++; }
  for (let k = 0; k < n.length; k++) if (n[k] > 0) out.push(`${k} ${n[k]}`);
  return out;
}

// ---------------------------------------------------------------- gestures in progress

const viewRef = createNodeRef();
/** The node being dragged and how far, in storyboard units: the document changes once, when it is dropped. */
const [dragged, setDragged] = createSignal<Sequence | null>(null);
const [dragDX, setDragDX] = createSignal<number>(0);
const [dragDY, setDragDY] = createSignal<number>(0);
/** The node a link is being drawn from, where the pointer is, and the node it is over. */
const [linking, setLinking] = createSignal<Sequence | null>(null);
const [linkX, setLinkX] = createSignal<number>(0);
const [linkY, setLinkY] = createSignal<number>(0);
const [target, setTarget] = createSignal<Sequence | null>(null);

function cx(s: Sequence): number { project(); return s.storyX + (dragged() === s ? dragDX() : 0); }
function cy(s: Sequence): number { project(); return s.storyY + (dragged() === s ? dragDY() : 0); }
/** Storyboard units to pixels of the view. */
function vx(x: number): number { return panX() + x * zoom(); }
function vy(y: number): number { return panY() + y * zoom(); }
/** The storyboard point under the pointer. */
function pointOf(e: ui.PointerEvent): number[] {
  const p = ui.toLocal(viewRef.node, e.gx, e.gy);
  return [(p[0] - panX()) / zoom(), (p[1] - panY()) / zoom()];
}
function within(x: number, y: number, s: Sequence, margin: number): boolean {
  return Math.abs(x - cx(s)) < CARD_W / 2 + margin && Math.abs(y - cy(s)) < CARD_H / 2 + margin;
}
function sequenceAt(x: number, y: number): Sequence | null {
  const all = project().sequences;
  for (let i = all.length - 1; i >= 0; i--) if (within(x, y, all[i], 0)) return all[i];
  return null;
}

// ---------------------------------------------------------------- arrows

/** The arrow of a link from `a` to `b` as points in storyboard units: a curve from the edge of one node to the edge of the other (the last
 *  two points give the direction it arrives with). It bends to the right of its way, so the way back bends to the other side; a long one
 *  bends more and passes clear of a node standing between the two. `lane`: 0 for the first link between the two, 1 for the next: each bends
 *  a little more. Empty when the two nodes overlap.
 *  ponytail: no routing around nodes; a link across a crowded storyboard can pass under one (the author moves the nodes). */
function route(a: Sequence, b: Sequence, lane: i32): number[] {
  const ax = cx(a), ay = cy(a), bx = cx(b), by = cy(b), dx = bx - ax, dy = by - ay, len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const bend = 2 * ((len < 500 ? 16 + len * 0.1 : len * 0.22) + 30 * lane), mx = (ax + bx) / 2 - dy / len * bend, my = (ay + by) / 2 + dx / len * bend;
  const px = (u: number): number => (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx;
  const py = (u: number): number => (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by;
  if (within(px(0.5), py(0.5), a, 3) || within(px(0.5), py(0.5), b, 3)) return [];
  // where the curve leaves the first node and where it reaches the second, by halving
  let out = 0, clear = 0.5, short = 0.5, inside = 1;
  for (let k = 0; k < 14; k++) {
    const u = (out + clear) / 2, v = (short + inside) / 2;
    if (within(px(u), py(u), a, 3)) out = u; else clear = u;
    if (within(px(v), py(v), b, 3)) inside = v; else short = v;
  }
  const pts: number[] = [];
  for (let k = 0; k <= 24; k++) { const u = clear + (short - clear) * k / 24; pts.push(px(u)); pts.push(py(u)); }
  return pts;
}
/** Which of the links from its sequence to the same target this one is. */
function laneOf(a: Sequence, l: Link): i32 {
  let lane: i32 = 0;
  for (const other of a.links) { if (other === l) break; if (other.to === l.to) lane++; }
  return lane;
}
/** Every link that has an arrow: the ones that lead to another sequence. */
function arrows(): Link[] {
  const p = project(), out: Link[] = [];
  for (const s of p.sequences) for (const l of s.links) if (l.to !== s.id && p.sequence(l.to) !== null) out.push(l);
  return out;
}
/** Where the handle of a link sits: the middle of its arrow, in pixels of the view. */
function handleAt(l: Link): number[] {
  const a = sourceOf(l), b = project().sequence(l.to);
  if (a === null || b === null) return [0, 0];
  const pts = route(a, b, laneOf(a, l));
  if (pts.length < 2) return [vx((cx(a) + cx(b)) / 2), vy((cy(a) + cy(b)) / 2)];
  const k = Math.floor(pts.length / 4) * 2;
  return [vx(pts[k]), vy(pts[k + 1])];
}
/** An arrow in window pixels: the line stops at the base of the head, whose tip is the last point and which points along the last segment. */
function arrow(pts: number[], width: number, head: number, color: i32, dashed: boolean): void {
  const n = pts.length, tx = pts[n - 2], ty = pts[n - 1], dx = tx - pts[n - 4], dy = ty - pts[n - 3], len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy)), ux = dx / len, uy = dy / len;
  pts[n - 2] = tx - ux * head * 0.8; pts[n - 1] = ty - uy * head * 0.8;
  if (dashed) { for (let k = 0; k + 3 < n; k += 4) stroke([pts[k], pts[k + 1], pts[k + 2], pts[k + 3]], width, color, 255, false); }
  else stroke(pts, width, color, 255, false);
  polygon([tx, ty, tx - ux * head - uy * head * 0.5, ty - uy * head + ux * head * 0.5, tx - ux * head + uy * head * 0.5, ty - uy * head - ux * head * 0.5], color, 255);
}
/** Draws the grid, the arrows under the nodes and the link being drawn. (x, y): the view's corner on the window. */
function drawArrows(x: i32, y: i32, w: i32, h: i32): void {
  setViewSize(w, h);
  const z = zoom(), ox = x + panX(), oy = y + panY(), p = project(), thick = Math.max(0.75, z);
  // a dot every 40 units (80 when zoomed out): the storyboard reads as a surface, and panning shows
  const gap = (z < 1 ? 80 : 40) * z;
  for (let gy = oy - Math.floor((oy - y) / gap) * gap; gy < y + h; gy += gap) {
    for (let gx = ox - Math.floor((ox - x) / gap) * gap; gx < x + w; gx += gap) rect(Math.round(gx), Math.round(gy), 1, 1, 0x3f3f46);
  }
  const chosen = selectedLink();
  for (const a of p.sequences) {
    for (const l of a.links) {
      const b = p.sequence(l.to);
      if (b === null || b === a) continue;
      const pts = route(a, b, laneOf(a, l)), n = pts.length;
      if (n < 4) continue;
      for (let k = 0; k < n; k += 2) { pts[k] = ox + pts[k] * z; pts[k + 1] = oy + pts[k + 1] * z; }
      // a link that opens its target over the sequence is dashed
      arrow(pts, (l === chosen ? 2.5 : 1.75) * thick, 11 * thick, l === chosen ? ACCENT : l === hovered() ? 0xd4d4d8 : 0x8b8b94, l.overlay);
    }
  }
  const from = linking();
  if (from !== null) arrow([ox + cx(from) * z, oy + (cy(from) + CARD_H / 2 + 10) * z, ox + linkX() * z, oy + linkY() * z], 2.5, 12, target() !== null ? ACCENT : MUTED, false);
}

// ---------------------------------------------------------------- a node

// text sizes at each zoom step (ZOOMS): the title, the small print
const TITLE: string[] = ['text-[9px]', 'text-[11px]', 'text-[14px]', 'text-[20px]'];
const SMALL: string[] = ['text-[7px]', 'text-[9px]', 'text-[11px]', 'text-[16px]'];
/** The miniature of the table inside a node: its height in storyboard units. */
const STAGE_H = 96;

// the node under the button, where it was pressed, and whether the pointer has moved far enough to be a drag
let pressed: Sequence | null = null, pressX: number = 0, pressY: number = 0, moving = false;
function nodeDown(s: Sequence, e: ui.PointerEvent): void {
  if (e.button === 2) { if (selected() !== s && !isChosen(s)) select(s, null); contextMenu('sequence', e.gx, e.gy); return; }
  if (e.button !== 0) return;
  if (e.shift || e.meta || e.ctrl) { toggleSequence(s); return; }
  select(s, null);
  const p = pointOf(e);
  pressed = s; pressX = p[0]; pressY = p[1]; moving = false;
}
function nodeMove(s: Sequence, e: ui.PointerEvent): void {
  if (pressed !== s) return;   // a node also hears the pointer passing over it with no button down
  const p = pointOf(e), dx = p[0] - pressX, dy = p[1] - pressY;
  if (!moving && Math.abs(dx) + Math.abs(dy) < 4 / zoom()) return;
  moving = true;
  batch(() => { setDragged(s); setDragDX(dx); setDragDY(dy); });
}
function nodeUp(s: Sequence, e: ui.PointerEvent): void {
  pressed = null;
  if (!moving) return;
  moving = false;
  const x = s.storyX + dragDX(), y = s.storyY + dragDY();
  batch(() => { setDragged(null); setDragDX(0); setDragDY(0); moveSequence(s, x, y); });
}
function handleDown(s: Sequence, e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  select(s, null);
  const p = pointOf(e);
  batch(() => { setLinking(s); setLinkX(p[0]); setLinkY(p[1]); setTarget(null); });
}
function handleMove(e: ui.PointerEvent): void {
  const from = linking();
  if (from === null) return;
  const p = pointOf(e), over = sequenceAt(p[0], p[1]);
  batch(() => { setLinkX(p[0]); setLinkY(p[1]); setTarget(over !== from ? over : null); });
}
function handleUp(e: ui.PointerEvent): void {
  const from = linking(), to = target();
  batch(() => { setLinking(null); setTarget(null); });
  if (from !== null && to !== null) link(from, to);
  else if (from !== null) setStatus(t(L.HOW_TO_LINK));
}

const lost = createMemo<string[]>(() => project().sequences.length > 0 ? unreachable(project()) : [], []);

/** The table of a sequence in small: every item where it lies, turned as it is turned. */
function Miniature(p: { of: Sequence }): i32 {
  const s = p.of;
  const W = (): number => project().table.width, H = (): number => project().table.height;
  const k = (): number => STAGE_H * zoom() / H();   // table units to pixels
  return <view class="relative self-center overflow-hidden rounded-sm" style={{ width: STAGE_H * zoom() * W() / H(), height: STAGE_H * zoom(), bg: project().theme.background }}>
    <For each={(project(), s.items)}>{(it: Item, i: i32) => {
      const h = (): number => { project(); return it.height > 0 ? it.height : it.width * shapeOf(project().medium(it.media)); };
      return <canvas class="absolute" style={{ left: (it.x - it.width / 2) * k(), top: (it.y - h() / 2) * k(), width: Math.max(2, it.width * k()), height: Math.max(2, h() * k()), lazy: 1 }}
        onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          if (it.rotation === 0) { drawMedia(project().medium(it.media), x, y, w, h); return; }
          const a = it.rotation * Math.PI / 180;
          setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), x + w / 2, y + h / 2);
          drawMedia(project().medium(it.media), -w / 2, -h / 2, w, h);
          resetTransform();
        }} />;
    }}</For>
    <Show when={(project(), s.items.length === 0) && zoomStep() > 0}>
      <view class="absolute inset-0 items-center justify-center"><text class={`text-zinc-500 ${SMALL[zoomStep()]}`}>{t(L.NO_MEDIA_YET)}</text></view>
    </Show>
  </view>;
}
/** The size of the link handle under a node, in pixels. */
function knob(): number { return Math.max(12, Math.round(20 * zoom())); }
function Node(s: Sequence): i32 {
  const z = zoom;
  const frame = (): string => target() === s ? 'border-amber-300 bg-zinc-800'
    : (selected() === s && selectedLink() === null) || isChosen(s) ? 'border-amber-400 bg-zinc-800'
    : lost().indexOf(s.id) >= 0 ? 'border-orange-500 border-dashed bg-zinc-900' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900';
  return <view class="absolute" style={{ left: vx(cx(s) - CARD_W / 2), top: vy(cy(s) - CARD_H / 2), width: CARD_W * z(), height: CARD_H * z() }}>
    <view class={`absolute inset-0 flex-col rounded-lg border-2 shadow-lg overflow-hidden cursor-grab ${frame()}`}
      onPointerDown={(e: ui.PointerEvent) => nodeDown(s, e)} onPointerMove={(e: ui.PointerEvent) => nodeMove(s, e)} onPointerUp={(e: ui.PointerEvent) => nodeUp(s, e)}
      onDoubleClick={(e: ui.PointerEvent) => { pressed = null; openSequence(s); }}>
      <view class="flex-row items-center" style={{ height: 28 * z(), paddingLeft: 8 * z(), paddingRight: 8 * z(), gap: 5 * z() }}>
        <Show when={project().start === s.id}><IcoAt name="flag" size={() => 13 * z()} color={ACCENT} /></Show>
        <text class={`grow truncate font-bold text-zinc-100 ${TITLE[zoomStep()]}`}>{project().say(s.title, lang())}</text>
        <Show when={lost().indexOf(s.id) >= 0}><IcoAt name="triangle-alert" size={() => 13 * z()} color={WARN} /></Show>
      </view>
      <view class="flex-row justify-center bg-zinc-950" style={{ height: STAGE_H * z() }}><Miniature of={s} /></view>
      <view class="flex-row items-center" style={{ height: 26 * z(), paddingLeft: 8 * z(), paddingRight: 8 * z(), gap: 8 * z() }}>
        <For each={kindsOf(s)}>{(entry: string, i: i32) => {
          const kind: i32 = parseInt(entry.slice(0, 1), 10);
          return <view class="flex-row items-center" style={{ gap: 3 * z() }}>
            <IcoAt name={KIND_ICON[kind]} size={() => 12 * z()} color={KIND_COLOUR[kind]} />
            <text class={`text-zinc-300 ${SMALL[zoomStep()]}`}>{entry.slice(2)}</text>
          </view>;
        }}</For>
        <view class="grow" />
        <Show when={(project(), s.links.length > 0)}>
          <view class="flex-row items-center" style={{ gap: 3 * z() }}>
            <IcoAt name="arrow-right" size={() => 12 * z()} color={MUTED} />
            <text class={`text-zinc-400 ${SMALL[zoomStep()]}`}>{(project(), `${s.links.length}`)}</text>
          </view>
        </Show>
      </view>
    </view>
    <view class={`absolute items-center justify-center rounded-full border cursor-crosshair ${linking() === s ? 'bg-amber-400 border-amber-300' : 'bg-zinc-700 border-zinc-500 hover:bg-amber-400 hover:border-amber-300'}`}
      style={{ left: CARD_W * z() / 2 - knob() / 2, top: CARD_H * z() - knob() / 2, width: knob(), height: knob() }}
      onPointerDown={(e: ui.PointerEvent) => handleDown(s, e)} onPointerMove={(e: ui.PointerEvent) => handleMove(e)} onPointerUp={(e: ui.PointerEvent) => handleUp(e)}
      onDoubleClick={(e: ui.PointerEvent) => {}}>
      <IcoAt name="link" size={() => knob() * 0.55} color={INK} />
    </view>
  </view>;
}
/** The handle of a link in the middle of its arrow: a click selects the link. It is a dot until the link matters (selected, under the pointer,
 *  or one of the selected sequence's), then it shows the label, so that a storyboard with many links stays readable. */
function Handle(l: Link): i32 {
  const chosen = (): boolean => selectedLink() === l;
  const open = (): boolean => chosen() || hovered() === l || (selectedLink() === null && selected() !== null && selected() === sourceOf(l));
  return <view class="absolute items-center justify-center" style={{ left: handleAt(l)[0] - 90, top: handleAt(l)[1] - 11, width: 180, height: 22 }}>
    <button class={`flex-row items-center justify-center gap-1 rounded-full border cursor-pointer ${open() ? 'h-[22] px-2' : zoomStep() > 1 ? 'w-[14] h-[14] p-0' : 'w-[10] h-[10] p-0'} ${chosen() ? 'bg-amber-400 border-amber-300' : 'bg-zinc-800 border-zinc-500 hover:border-zinc-300'}`}
      onClick={() => { const a = sourceOf(l); if (a !== null) select(a, l); }}
      onPointerEnter={(e: ui.PointerEvent) => setHovered(l)} onPointerLeave={(e: ui.PointerEvent) => { if (hovered() === l) setHovered(null); }}>
      <Show when={open() && !chosen() && (project(), l.overlay)}><Ico name="layers" size={11} color={MUTED} /></Show>
      <Show when={chosen() && (project(), l.overlay)}><Ico name="layers" size={11} color={DARK} /></Show>
      <Show when={open()}>
        <text class={`truncate text-[11px] ${chosen() ? 'font-bold text-zinc-900' : 'text-zinc-200'}`} style={{ maxWidth: 140 }}>{project().say(l.label, lang())}</text>
      </Show>
    </button>
  </view>;
}

// ---------------------------------------------------------------- the view

let panning = false, panFromX: number = 0, panFromY: number = 0, panned = false, wheelSum: number = 0, pinchSum: number = 1;
function viewWheel(e: ui.PointerEvent): void {
  // a notch of a mouse wheel is one step; a trackpad sends fractions, and a pinch a factor per event
  wheelSum += e.wheel;
  pinchSum *= e.pinch;
  let steps: i32 = 0;
  if (wheelSum >= 1 || pinchSum > 1.25) steps = 1;
  else if (wheelSum <= -1 || pinchSum < 0.8) steps = -1;
  if (steps === 0) return;
  wheelSum = 0; pinchSum = 1;
  zoomBy(steps, e.x, e.y);
}
function Empty(): i32 {
  return <view class="absolute inset-0 items-center justify-center">
    <view class="w-[420] flex-col items-center gap-3 p-8 rounded-xl bg-zinc-900 border border-zinc-800">
      <Ico name="mouse-pointer-click" size={36} color={ACCENT} />
      <text class="text-xl font-bold text-zinc-100">{t(L.EMPTY_TITLE)}</text>
      <text class="text-sm text-center text-zinc-400">{t(L.EMPTY_WHAT)}</text>
      <text class="text-sm text-center text-zinc-400">{t(L.EMPTY_HOW)}</text>
      <button class="flex-row items-center gap-2 h-9 px-4 mt-2 rounded-md cursor-pointer bg-amber-400 hover:bg-amber-300" onClick={() => addSequenceInView()}>
        <Ico name="plus" size={15} color={DARK} />
        <text class="text-sm font-bold text-zinc-900">{t(L.NEW_SEQUENCE)}</text>
      </button>
    </view>
  </view>;
}
export function Storyboard(): i32 {
  // the arrows are drawn by hand: ask for a repaint when what they show changes without any node moving
  createEffect(() => { project(); linking(); linkX(); linkY(); target(); selectedLink(); hovered(); dragDX(); dragDY(); panX(); panY(); zoomStep(); ui.repaint(); });
  return <view ref={viewRef} class="grow relative overflow-hidden bg-zinc-950 cursor-default"
    onPointerDown={(e: ui.PointerEvent) => {
      if (e.button === 0) { panning = true; panned = false; panFromX = e.x - panX(); panFromY = e.y - panY(); }
      else if (e.button === 2) { const p = pointOf(e); contextMenu('storyboard', e.gx, e.gy, Math.round(p[0]), Math.round(p[1])); }
    }}
    onPointerMove={(e: ui.PointerEvent) => {
      if (!panning) return;
      if (!panned && Math.abs(e.x - panFromX - panX()) + Math.abs(e.y - panFromY - panY()) < 4) return;
      panned = true;
      batch(() => { setPanX(e.x - panFromX); setPanY(e.y - panFromY); });
    }}
    onPointerUp={(e: ui.PointerEvent) => { if (panning && !panned) select(null, null); panning = false; }}
    onWheel={(e: ui.PointerEvent) => viewWheel(e)}
    onDoubleClick={(e: ui.PointerEvent) => { panning = false; const p = pointOf(e); addSequence(p[0], p[1]); }}>   {/* not panning: the release must not deselect the new sequence */}
    <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={drawArrows} />
    <For each={project().sequences}>{(s: Sequence, i: i32) => Node(s)}</For>
    <For each={arrows()}>{(l: Link, i: i32) => Handle(l)}</For>
    <Show when={project().sequences.length === 0}><Empty /></Show>
    <Show when={project().sequences.length > 0}>
      <view class="absolute left-[8] bottom-[8] px-2 py-1 rounded bg-zinc-950"><text class="text-[11px] text-zinc-500">{t(L.BOARD_HINT)}</text></view>
    </Show>
    <PreviewTools />
    <view class="absolute right-[10] top-[10] flex-row items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
      <Tool icon="minus" label="" look="quiet" off={() => zoomStep() === 0} onClick={() => zoomBy(-1, viewW / 2, viewH / 2)} />
      <text class="w-[40] text-center text-xs text-zinc-300">{`${Math.round(zoom() * 100)}%`}</text>
      <Tool icon="plus" label="" look="quiet" off={() => zoomStep() === ZOOMS.length - 1} onClick={() => zoomBy(1, viewW / 2, viewH / 2)} />
      <Tool icon="maximize" label={t(L.FIT)} look="quiet" off={() => false} onClick={fit} />
    </view>
  </view>;
}
