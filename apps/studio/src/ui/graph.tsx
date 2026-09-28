// Flow diagram editor: a pannable / zoomable canvas of box cards linked output -> input with bezier curves.
//   drag a card: move (the whole selection)      shift+click: add / remove from the selection
//   drag the background: pan                     shift+drag the background: rectangle selection
//   wheel / pinch: zoom around the pointer       click a link: select it (Delete removes it)
//   drag from a port to a port of the other kind: link (dragging a linked input picks its link up)
// Coordinates: "world" units are the cards' own (project.json x / y); "view" units are pixels relative to the
// viewport's top-left corner: view = pan + world * zoom.
import { createSignal, createNodeRef, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { stroke, rrect, border } from 'zinc:gfx';
import * as model from '../model';
import { Box, Link } from '../model';
import { PortDef, categoryColor } from '../library';
import { setCenterTab, notify } from './state';

export const BOX_W = 192, HEAD = 34, ROW = 22;
const BAR_W = 24, BAR_PORT_Y = 72, PORT = 12;

export function boxHeight(b: Box): number {
  const rows = Math.max(1, Math.max(b.def.inputs.length, b.def.outputs.length));
  return HEAD + rows * ROW + 10;
}

// ---------------------------------------------------------------- view state
const [zoom, setZoom] = createSignal<number>(1);
const [panX, setPanX] = createSignal<number>(BAR_W + 16);
const [panY, setPanY] = createSignal<number>(24);
let vw = 800, vh = 600;               // viewport size, from the links canvas
const viewport = createNodeRef();
const world = createNodeRef();

export function zoomLevel(): number { return zoom(); }
export function resetView(): void { setZoom(1); setPanX(BAR_W + 16); setPanY(24); }

/** View position of a port (bars included). */
function portPoint(id: string, name: string, output: boolean): number[] {
  if (id === '@start') return [BAR_W, BAR_PORT_Y];
  if (id === '@end') return [vw - BAR_W, BAR_PORT_Y];
  const b = model.findBox(id);
  if (b === null) return [-1000, -1000];
  const list = output ? b.def.outputs : b.def.inputs;
  let i = 0;
  for (let k = 0; k < list.length; k++) if (list[k].name === name) i = k;
  const wx = output ? b.x() + BOX_W : b.x(), wy = b.y() + HEAD + i * ROW + ROW / 2;
  const z = zoom();
  return [panX() + wx * z, panY() + wy * z];
}
/** Surface position of a port (scripted sessions, tests). */
export function portScreen(id: string, name: string, output: boolean): number[] {
  const r = ui.screenBox(viewport.node), p = portPoint(id, name, output);
  return [r[0] + p[0], r[1] + p[1]];
}
function viewOf(e: ui.PointerEvent): number[] { return ui.toLocal(viewport.node, e.gx, e.gy); }
function worldOfView(x: number, y: number): number[] { const z = zoom(); return [(x - panX()) / z, (y - panY()) / z]; }

/** Port ring class: grey signals, amber numbers, green strings (the link colours). */
function portClass(p: PortDef): string {
  const c = p.isSignal ? 'border-zinc-500' : p.type === 'number' ? 'border-amber-600' : 'border-emerald-600';
  return `absolute ${p.isSignal ? 'rounded-full' : 'rounded-sm'} border-2 ${c} bg-white cursor-crosshair hover:bg-sky-100`;
}
function portColor(p: PortDef | null): i32 {
  if (p === null || p.isSignal) return 0x71717a;
  return p.type === 'number' ? 0xd97706 : 0x059669;
}
/** Samples of the cubic bezier between two view points (horizontal tangents), as [x0, y0, x1, y1...]. */
function curve(x0: number, y0: number, x1: number, y1: number, ox: number, oy: number): number[] {
  const pts: number[] = [];
  const dx = Math.max(40 * zoom(), Math.abs(x1 - x0) / 2);
  for (let k = 0; k <= 20; k++) {
    const t = k / 20, u = 1 - t;
    pts.push(ox + u * u * u * x0 + 3 * u * u * t * (x0 + dx) + 3 * u * t * t * (x1 - dx) + t * t * t * x1);
    pts.push(oy + u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1);
  }
  return pts;
}

// ---------------------------------------------------------------- interactions
let mode = '';                        // '' | pan | move | link | marquee
let startX = 0, startY = 0;           // view position where the drag started
let panFromX = 0, panFromY = 0;
let moved = false;
const origins = new Map<string, number[]>();
// link being dragged: its fixed end, and the pointer
let linkId = '', linkPort = '', linkFromOutput = true, linkX = 0, linkY = 0;
let marqX = 0, marqY = 0;

function startMove(b: Box, e: ui.PointerEvent): void {
  if (e.shift) { model.toggleSelect(b.id); return; }
  if (!model.isSelected(b.id)) model.select([b.id]);
  if (e.button !== 0) return;
  const p = viewOf(e);
  mode = 'move'; startX = p[0]; startY = p[1]; moved = false;
  origins.clear();
  for (const id of model.selection()) { const s = model.findBox(id); if (s !== null) origins.set(id, [s.x(), s.y()]); }
}
function dragMove(e: ui.PointerEvent): void {
  const p = viewOf(e);
  if (mode === 'move') {
    const z = zoom(), dx = (p[0] - startX) / z, dy = (p[1] - startY) / z;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    if (!moved) { model.checkpoint(''); moved = true; }
    origins.forEach((o: number[], id: string) => {
      const b = model.findBox(id);
      if (b !== null) model.moveTo(b, Math.round((o[0] + dx) / 4) * 4, Math.round((o[1] + dy) / 4) * 4);
    });
  } else if (mode === 'link') { linkX = p[0]; linkY = p[1]; }
  else if (mode === 'pan') { setPanX(panFromX + p[0] - startX); setPanY(panFromY + p[1] - startY); }
  else if (mode === 'marquee') { marqX = p[0]; marqY = p[1]; }
}
function dragEnd(e: ui.PointerEvent): void {
  const p = viewOf(e);
  if (mode === 'link') finishLink(p[0], p[1]);
  else if (mode === 'marquee') finishMarquee();
  mode = '';
}

/** Pointer down on a port: start a new link, or pick up the link of an already linked input. */
function portDown(id: string, name: string, output: boolean, e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  const p = viewOf(e);
  mode = 'link'; linkX = p[0]; linkY = p[1];
  if (!output) {
    const ls = model.links().filter((l: Link) => l.to === id && l.inp === name);
    if (ls.length > 0) {
      const l = ls[ls.length - 1];
      model.removeLink(l.key);
      linkId = l.from; linkPort = l.out; linkFromOutput = true;
      return;
    }
  }
  linkId = id; linkPort = name; linkFromOutput = output;
}
/** Nearest port of the given direction within 16 px of a view point, as [id, name], or null. */
function portNear(x: number, y: number, outputs: boolean): string[] | null {
  const ids: string[] = [outputs ? '@start' : '@end'], names: string[] = [outputs ? 'onStart' : 'onStopped'];
  for (const b of model.boxes()) for (const pd of outputs ? b.def.outputs : b.def.inputs) { ids.push(b.id); names.push(pd.name); }
  let best = -1, bd = 16 * 16;
  for (let i = 0; i < ids.length; i++) {
    const q = portPoint(ids[i], names[i], outputs);
    const d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best < 0 ? null : [ids[best], names[best]];
}
function finishLink(x: number, y: number): void {
  const hit = portNear(x, y, !linkFromOutput);
  if (hit === null) return;
  const err = linkFromOutput ? model.connect(linkId, linkPort, hit[0], hit[1]) : model.connect(hit[0], hit[1], linkId, linkPort);
  if (err !== '' && err !== 'already linked') notify(`Cannot link: ${err}`);
}
function finishMarquee(): void {
  const x0 = Math.min(startX, marqX), y0 = Math.min(startY, marqY), x1 = Math.max(startX, marqX), y1 = Math.max(startY, marqY);
  const z = zoom(), ids: string[] = [];
  for (const b of model.boxes()) {
    const bx = panX() + b.x() * z, by = panY() + b.y() * z, bw = BOX_W * z, bh = boxHeight(b) * z;
    if (bx < x1 && bx + bw > x0 && by < y1 && by + bh > y0) ids.push(b.id);
  }
  model.select(ids);
}
/** The link under a view point (within 6 px), or ''. */
function linkAt(x: number, y: number): string {
  for (const l of model.links()) {
    const a = portPoint(l.from, l.out, true), b = portPoint(l.to, l.inp, false);
    const pts = curve(a[0], a[1], b[0], b[1], 0, 0);
    for (let k = 0; k + 3 < pts.length; k += 2) if (segDist(x, y, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]) < 6) return l.key;
  }
  return '';
}
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function backgroundDown(e: ui.PointerEvent): void {
  const p = viewOf(e);
  startX = p[0]; startY = p[1];
  const lk = linkAt(p[0], p[1]);
  if (lk !== '' && !e.shift) { model.selectLink(lk); return; }
  if (e.shift) { mode = 'marquee'; marqX = p[0]; marqY = p[1]; return; }
  model.select([]);
  mode = 'pan'; panFromX = panX(); panFromY = panY();
}
function zoomAt(e: ui.PointerEvent): void {
  const p = viewOf(e);
  const z = zoom(), f = e.pinch !== 1 ? e.pinch : e.wheel > 0 ? 1.1 : 1 / 1.1;
  zoomAround(p[0], p[1], Math.max(0.35, Math.min(2.5, z * f)));
}
function zoomAround(x: number, y: number, z2: number): void {
  const z = zoom(), wx = (x - panX()) / z, wy = (y - panY()) / z;
  setZoom(z2); setPanX(x - wx * z2); setPanY(y - wy * z2);
}
export function zoomBy(f: number): void { zoomAround(vw / 2, vh / 2, Math.max(0.35, Math.min(2.5, zoom() * f))); }
/** Zooms and pans so every box is visible. */
export function fitView(): void {
  const list = model.boxes();
  if (list.length === 0) { resetView(); return; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of list) { x0 = Math.min(x0, b.x()); y0 = Math.min(y0, b.y()); x1 = Math.max(x1, b.x() + BOX_W); y1 = Math.max(y1, b.y() + boxHeight(b)); }
  const m = 48, z = Math.max(0.35, Math.min(1.25, Math.min((vw - 2 * BAR_W - 2 * m) / (x1 - x0), (vh - 2 * m) / (y1 - y0))));
  setZoom(z);
  setPanX((vw - (x1 - x0) * z) / 2 - x0 * z);
  setPanY((vh - (y1 - y0) * z) / 2 - y0 * z);
}

/** Adds a box where a library item was dropped (surface coordinates); false when outside the diagram. */
export function dropAt(type: string, gx: number, gy: number): boolean {
  if (viewport.node < 0) return false;
  const r = ui.screenBox(viewport.node);
  if (gx < r[0] || gy < r[1] || gx >= r[0] + r[2] || gy >= r[1] + r[3]) return false;
  const w = worldOfView(gx - r[0], gy - r[1]);
  model.addBox(type, w[0] - BOX_W / 2, w[1] - HEAD / 2);
  return true;
}
/** Adds a box in the middle of the visible area (double click in the library). */
export function addAtCenter(type: string): void {
  const n = model.boxes().length;
  const w = worldOfView(vw / 2, vh / 3);
  model.addBox(type, w[0] - BOX_W / 2 + (n % 5) * 16, w[1] + (n % 5) * 16);
}

// ---------------------------------------------------------------- drawing (links canvas, under the cards)
function drawBackground(x: i32, y: i32, w: i32, h: i32): void {
  vw = w; vh = h;
  // dot grid, 24 world units apart (fewer dots when zoomed out)
  const z = zoom();
  let step = 24 * z;
  while (step < 14) step *= 2;
  const ox = ((panX() % step) + step) % step, oy = ((panY() % step) + step) % step;
  for (let gy = oy; gy < h; gy += step) for (let gx = ox; gx < w; gx += step) rrect(x + gx - 1, y + gy - 1, 2, 2, 1, 0xd4d4d8, 255);
  const sel = model.selectedLink();
  for (const l of model.links()) {
    const a = portPoint(l.from, l.out, true), b = portPoint(l.to, l.inp, false);
    const on = l.key === sel;
    stroke(curve(a[0], a[1], b[0], b[1], x, y), (on ? 3 : 2) * Math.max(0.75, z), on ? 0x0284c7 : portColor(model.portOf(l.from, l.out, true)), 255, false);
  }
}
/** Over the cards: the link being dragged and the selection rectangle. */
function drawOverlay(x: i32, y: i32, w: i32, h: i32): void {
  if (mode === 'link') {
    const a = portPoint(linkId, linkPort, linkFromOutput);
    const pts = linkFromOutput ? curve(a[0], a[1], linkX, linkY, x, y) : curve(linkX, linkY, a[0], a[1], x, y);
    stroke(pts, 2, 0x0284c7, 255, false);
    const hit = portNear(linkX, linkY, !linkFromOutput);
    if (hit !== null) { const q = portPoint(hit[0], hit[1], !linkFromOutput); border(x + q[0] - 9, y + q[1] - 9, 18, 18, 9, 2, 0x0284c7, 255); }
  }
  if (mode === 'marquee') {
    const x0 = Math.min(startX, marqX), y0 = Math.min(startY, marqY);
    rrect(x + x0, y + y0, Math.abs(marqX - startX), Math.abs(marqY - startY), 2, 0x0284c7, 30);
    border(x + x0, y + y0, Math.abs(marqX - startX), Math.abs(marqY - startY), 2, 1, 0x0284c7, 200);
  }
}

// ---------------------------------------------------------------- cards
function Port(b: Box, p: PortDef, i: i32, output: boolean): i32 {
  const top = HEAD + i * ROW + ROW / 2 - PORT / 2;
  return <view class={portClass(p)}
    style={{ left: output ? BOX_W - PORT / 2 : -PORT / 2, top: top, width: PORT, height: PORT }}
    onPointerDown={(e: ui.PointerEvent) => portDown(b.id, p.name, output, e)}
    onPointerMove={(e: ui.PointerEvent) => dragMove(e)} onPointerUp={(e: ui.PointerEvent) => dragEnd(e)} />;
}
function PortLabel(p: PortDef, i: i32, output: boolean): i32 {
  const left = output ? BOX_W / 2 - 2 : 12;
  return <view class="absolute flex-row items-center" style={{ left: left, top: HEAD + i * ROW + 2, width: BOX_W / 2 - 12, height: ROW - 4 }}>
    <Show when={output}><view class="grow" /></Show>
    <text class={p.isSignal ? 'text-[11] text-zinc-600' : 'text-[11] text-zinc-500'}>{p.isSignal ? p.name : `${p.name}: ${p.type === 'number' ? 'num' : 'str'}`}</text>
  </view>;
}
/** The card of a box. */
function Card(b: Box): i32 {
  const def = b.def;
  const card = <view class={model.isSelected(b.id) ? 'absolute rounded-lg bg-white border-2 border-sky-500 shadow-md cursor-grab'
      : 'absolute rounded-lg bg-white border border-zinc-200 shadow-sm hover:border-zinc-400 cursor-grab'}
    style={{ left: b.x(), top: b.y(), width: BOX_W, height: boxHeight(b) }}
    onPointerDown={(e: ui.PointerEvent) => startMove(b, e)} onPointerMove={(e: ui.PointerEvent) => dragMove(e)}
    onPointerUp={(e: ui.PointerEvent) => dragEnd(e)}
    onDoubleClick={(e: ui.PointerEvent) => { model.select([b.id]); if (b.type === 'script') setCenterTab('Script'); }}>
    <view class="absolute left-0 w-full h-[1] bg-zinc-100" style={{ top: HEAD - 2 }} />
    <view class="flex-row items-center gap-2 px-3" style={{ height: HEAD - 2 }}>
      <view class="w-[8] h-[8] rounded-full" style={{ bg: categoryColor(def.category) }} />
      <text class="text-[13] font-semibold text-zinc-900">{b.title()}</text>
      <view class="grow" />
      <text class="text-[10] text-zinc-400">{b.id}</text>
    </view>
  </view>;
  for (let i = 0; i < def.inputs.length; i++) { ui.insert(card, PortLabel(def.inputs[i], i, false), -1); ui.insert(card, Port(b, def.inputs[i], i, false), -1); }
  for (let i = 0; i < def.outputs.length; i++) { ui.insert(card, PortLabel(def.outputs[i], i, true), -1); ui.insert(card, Port(b, def.outputs[i], i, true), -1); }
  return card;
}

/** A diagram bar: the start bar (output onStart) on the left, the end bar (input onStopped) on the right. */
interface BarProps { start: boolean }
function Bar(props: BarProps): i32 {
  const start = props.start;
  return <view class={start ? 'absolute left-0 top-0 bottom-0 w-[24] bg-zinc-100' : 'absolute right-0 top-0 bottom-0 w-[24] bg-zinc-100'}>
    <view class={start ? 'absolute right-0 top-0 bottom-0 w-[1] bg-zinc-200' : 'absolute left-0 top-0 bottom-0 w-[1] bg-zinc-200'} />
    <view class="absolute rounded-full border-2 border-zinc-500 bg-white cursor-crosshair hover:bg-sky-100"
      style={{ left: start ? BAR_W - PORT / 2 : -PORT / 2, top: BAR_PORT_Y - PORT / 2, width: PORT, height: PORT }}
      onPointerDown={(e: ui.PointerEvent) => portDown(start ? '@start' : '@end', start ? 'onStart' : 'onStopped', start, e)}
      onPointerMove={(e: ui.PointerEvent) => dragMove(e)} onPointerUp={(e: ui.PointerEvent) => dragEnd(e)} />
  </view>;
}

export function FlowEditor(): i32 {
  return <view ref={viewport} class="grow overflow-hidden bg-zinc-50 cursor-default"
    onPointerDown={(e: ui.PointerEvent) => backgroundDown(e)} onPointerMove={(e: ui.PointerEvent) => dragMove(e)}
    onPointerUp={(e: ui.PointerEvent) => dragEnd(e)} onWheel={(e: ui.PointerEvent) => zoomAt(e)}>
    <canvas class="absolute inset-0" onDraw={drawBackground} />
    <view ref={world} class="absolute left-0 top-0 w-[1] h-[1]" style={{ scale: zoom(), translateX: panX(), translateY: panY() }}>
      <For each={model.boxes()}>{(b: Box, _i: i32) => Card(b)}</For>
    </view>
    <canvas class="absolute inset-0" onDraw={drawOverlay} />
    <Bar start={true} />
    <Bar start={false} />
    <text class="absolute left-[34] top-[64] text-[11] font-medium text-zinc-500">onStart</text>
    <view class="absolute right-[34] top-[64] w-[80] flex-row"><view class="grow" /><text class="text-[11] font-medium text-zinc-500">onStopped</text></view>
    <Show when={model.boxes().length === 0}>
      <view class="absolute inset-0 flex-col items-center justify-center gap-1">
        <text class="text-sm font-medium text-zinc-500">Empty diagram</text>
        <text class="text-[12] text-zinc-400">Drag boxes from the library, or double-click one</text>
      </view>
    </Show>
    <text class="absolute left-[34] bottom-[10] text-[11] text-zinc-400">Drag ports to link · Shift+drag to select · Wheel to zoom · Del removes</text>
  </view>;
}
