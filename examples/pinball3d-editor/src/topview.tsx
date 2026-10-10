// The top view: the whole table seen from above, drawn from its file (shapes.ts), and beside it the same table seen from its right
// side, which shows what stands how high. Click selects, a drag moves, the round handle of the selection turns it; dragging the
// background pans, the wheel zooms. A gesture changes the document once, when it ends: while it lasts the element is drawn where it
// would go.
import { createSignal, createEffect, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { stroke, path as fillPath, rect, rrect, border, font, drawText, textWidth, clip, unclip } from 'zinc:gfx';
import { doc, table, placed, outlineOf, selected, select, hovered, setHovered, selectionTurns, advanced, zoom, panX, panY, setPanX, setPanY, zoomBy, fit, viewW, viewH, setViewSize,
  moveSelected, turnSelected } from './state';
import { centreOf, schemaAt } from './doc';
import { Outline, Shape, Draw, boardColor, mix } from './shapes';
import { Tool, Heading, ACCENT, chord } from './widgets';
import * as L from './strings';
import { t } from './strings';

// ---------------------------------------------------------------- the gesture in progress

const enum Gesture { None, Press, Move, Turn, Pan }
const [gesture, setGesture] = createSignal<i32>(Gesture.None);
/** How far the selection is being moved (centimetres) or turned (degrees). */
const [dragX, setDragX] = createSignal<number>(0);
const [dragY, setDragY] = createSignal<number>(0);
const [dragTurn, setDragTurn] = createSignal<number>(0);
/** Where the pointer is on the table, in centimetres. */
const [pointX, setPointX] = createSignal<number>(0);
const [pointY, setPointY] = createSignal<number>(0);
const [inside, setInside] = createSignal<boolean>(false);
let pressX: number = 0, pressY: number = 0, panFromX: number = 0, panFromY: number = 0, turnFrom: number = 0, wheelSum: number = 0;

/** How the shapes of one outline are placed: moved by (dx, dy), then turned by `turn` degrees around (cx, cy). */
class Placing { dx: number = 0; dy: number = 0; turn: number = 0; cx: number = 0; cy: number = 0; }
const STILL = new Placing();
function placingOf(o: Outline): Placing {
  if (o.path !== selected() || (gesture() !== Gesture.Move && gesture() !== Gesture.Turn)) return STILL;
  const p = new Placing(), c = centre();
  p.dx = dragX(); p.dy = dragY(); p.turn = dragTurn(); p.cx = c[0]; p.cy = c[1];
  return p;
}
/** The middle of the selection, as the document turns it. */
function centre(): number[] { const p = selected(); return centreOf(schemaAt(p), doc().get(p)); }

// ---------------------------------------------------------------- drawing

// the sizes asked here are the ones baked into the program
let SMALL: i32 = -1, BOLD: i32 = -1;
function fonts(): void { if (SMALL < 0) { SMALL = font('sans', 10); BOLD = font('sans-bold', 11); } }

/** The points of a shape in window pixels. (ox, oy): the table's corner in the window; `push`: pixels added to x and y (a shadow). */
function onScreen(s: Shape, m: Placing, ox: number, oy: number, z: number, push: number): number[] {
  const out: number[] = [], a = m.turn * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  for (let i = 0; i + 1 < s.pts.length; i += 2) {
    let x = s.pts[i] + m.dx, y = s.pts[i + 1] + m.dy;
    if (m.turn !== 0) { const rx = x - m.cx - m.dx, ry = y - m.cy - m.dy; x = m.cx + m.dx + rx * c - ry * sn; y = m.cy + m.dy + rx * sn + ry * c; }
    out.push(ox + x * z + push); out.push(oy + y * z + push);
  }
  return out;
}
/** One shape. `halo` >= 0: its outline alone, in that colour and `grow` pixels wider (what is selected, what the pointer is over). */
function drawShape(s: Shape, m: Placing, ox: number, oy: number, z: number, push: number, color: i32, alpha: i32, grow: number): void {
  const pts = onScreen(s, m, ox, oy, z, push);
  if (s.draw === Draw.Disc) {
    const r = Math.max(1.5, s.r * z) + grow;
    rrect(pts[0] - r, pts[1] - r, r * 2, r * 2, r, color, alpha);
  } else if (s.draw === Draw.Line) stroke(pts, Math.max(1.25, s.r * z) + grow * 2, color, alpha, false);
  else if (grow > 0) stroke(pts, grow * 2, color, alpha, true);
  else { const contour: number[] = [pts.length / 2]; for (const v of pts) contour.push(v); fillPath(contour, color, alpha); }
}
function drawOutline(o: Outline, ox: number, oy: number, z: number, halo: i32): void {
  const m = placingOf(o);
  // what stands higher throws a longer shadow: the height read at a glance
  if (o.layer > 0 && o.z1 > 0.3) {
    const push = Math.min(o.z1, 14) * 0.11 * z;
    for (const s of o.shapes) if (s.alpha > 100) drawShape(s, m, ox, oy, z, push, 0x000000, 70, 0);
  }
  if (halo >= 0) for (const s of o.shapes) if (s.alpha > 100) drawShape(s, m, ox, oy, z, 0, halo, 255, 2);
  for (const s of o.shapes) drawShape(s, m, ox, oy, z, 0, s.color, s.alpha, 0);
}
/** The step of the grid and of the rulers at a zoom: 5 cm, 10 when the table is small on screen. */
function gridStep(z: number): number { return z < 4.5 ? 10 : 5; }

function drawTop(x: i32, y: i32, w: i32, h: i32): void {
  fonts();
  setViewSize(w, h);
  const tb = table(), z = zoom(), ox = x + panX(), oy = y + panY(), W = tb.playfield.width, Len = tb.playfield.length, board = boardColor(tb);
  clip(x, y, w, h);
  // the board, its grid and its rulers
  rrect(ox - 3, oy - 3, W * z + 6, Len * z + 6, 5, 0x27272a, 255);
  rect(ox, oy, W * z, Len * z, mix(board, 0x000000, 0.42));
  const step = gridStep(z);
  for (let g = step; g < W; g += step) rect(Math.round(ox + g * z), oy, 1, Len * z, mix(board, 0xffffff, g % 10 === 0 ? 0.1 : 0.03));
  for (let g = step; g < Len; g += step) rect(ox, Math.round(oy + g * z), W * z, 1, mix(board, 0xffffff, g % 10 === 0 ? 0.1 : 0.03));
  // everything on it, the lowest first; what is selected and what the pointer is over wear a halo
  const all = placed(), chosen = selected(), over = hovered();
  for (let layer = 0; layer < 3; layer++) {
    for (const o of all) if (o.layer === layer) drawOutline(o, ox, oy, z, o.path === chosen ? ACCENT : o.path === over ? 0xe4e4e7 : -1);
  }
  const sel = outlineOf(chosen);
  if (sel !== null) drawHandles(sel, ox, oy, z);
  // the rulers, in centimetres: beside the board, or along the edge of the view when the board goes past it
  const top = Math.max(oy - 19, y + 4), pinnedTop = top > oy - 19, left = Math.max(ox - 30, x + 2), pinnedLeft = left > ox - 30;
  if (pinnedTop) rect(x, y, w, 20, 0x09090b);
  if (pinnedLeft) rect(x, y, 30, h, 0x09090b);
  for (let g = 0; g <= W; g += 10) { const s = `${g}`; drawText(SMALL, Math.round(ox + g * z - textWidth(SMALL, s, 0) / 2), top, s, 0x71717a, 255, 0); }
  for (let g = 0; g <= Len; g += 10) { const s = `${g}`; drawText(SMALL, Math.round(left + 21 - textWidth(SMALL, s, 0)), Math.round(oy + g * z - 6), s, 0x71717a, 255, 0); }
  unclip();
}
/** How far the turn handle is from the middle of the selection, in pixels. */
function handleReach(o: Outline, z: number): number { return Math.max(34, Math.sqrt((o.x1 - o.x0) * (o.x1 - o.x0) + (o.y1 - o.y0) * (o.y1 - o.y0)) / 2 * z + 20); }
/** Where the turn handle of the selection is, in pixels of the view; empty when it has none. */
function handleAt(): number[] {
  const o = outlineOf(selected());
  if (o === null || !selectionTurns()) return [];
  const c = centre(), a = (dragTurn() - 90) * Math.PI / 180, r = handleReach(o, zoom());
  return [panX() + (c[0] + dragX()) * zoom() + Math.cos(a) * r, panY() + (c[1] + dragY()) * zoom() + Math.sin(a) * r];
}
function drawHandles(o: Outline, ox: number, oy: number, z: number): void {
  const c = centre(), cx = ox + (c[0] + dragX()) * z, cy = oy + (c[1] + dragY()) * z;
  const hp = handleAt();
  if (hp.length > 0) {
    const hx = ox - panX() + hp[0], hy = oy - panY() + hp[1];
    stroke([cx, cy, hx, hy], 1, ACCENT, 150, false);
    rrect(hx - 7, hy - 7, 14, 14, 7, ACCENT, 255);
    rrect(hx - 4, hy - 4, 8, 8, 4, 0x18181b, 255);
  }
  rrect(cx - 2, cy - 2, 4, 4, 2, ACCENT, 255);
  // its name, and what the gesture is doing to it
  let tag = doc().nameOf(o.path);
  if (gesture() === Gesture.Move) tag += `   ${sign(dragX())}, ${sign(dragY())} cm`;
  else if (gesture() === Gesture.Turn) tag += `   ${sign(dragTurn())}°`;
  const tw = textWidth(BOLD, tag, 0), tx = Math.round(ox + (o.x0 + o.x1) / 2 * z + dragX() * z - tw / 2), ty = Math.round(oy + o.y1 * z + dragY() * z + 9);
  rrect(tx - 6, ty - 2, tw + 12, 18, 4, 0x18181b, 235);
  border(tx - 6, ty - 2, tw + 12, 18, 4, 1, ACCENT, 200);
  drawText(BOLD, tx, ty + 1, tag, ACCENT, 255, 0);
}
function round1(v: number): string { return `${Math.round(v * 10) / 10}`; }
function sign(v: number): string { const r = Math.round(v * 100) / 100; return r > 0 ? `+${r}` : `${r}`; }

/** The table seen from its right side: the playfield at the left, the glass at the right, each thing from its foot to its top
 *  along the stretch of the table it covers. It follows the top view down the table. */
function drawProfile(x: i32, y: i32, w: i32, h: i32): void {
  fonts();
  const tb = table(), z = zoom(), oy = y + panY(), Len = tb.playfield.length, glass = tb.playfield.glass;
  const x0 = x + 16, kz = (w - 36) / glass, chosen = selected();
  clip(x, y, w, h);
  rect(x0, oy, glass * kz, Len * z, 0x131316);
  for (let g = gridStep(z); g < Len; g += gridStep(z)) rect(x0, Math.round(oy + g * z), glass * kz, 1, g % 10 === 0 ? 0x27272a : 0x1c1c20);
  for (let g = 0; g <= glass; g += 5) {
    const s = `${g}`, gx = Math.round(x0 + g * kz);
    if (g > 0) rect(gx, oy, 1, Len * z, 0x27272a);
    drawText(SMALL, Math.round(gx - textWidth(SMALL, s, 0) / 2), oy - 19, s, 0x71717a, 255, 0);
  }
  for (let layer = 0; layer < 3; layer++) {
    for (const o of placed()) {
      if (o.layer !== layer) continue;
      const m = placingOf(o), lit = o.path === chosen;
      if (o.section.length > 0) {
        const pts: number[] = [];
        for (let i = 0; i + 1 < o.section.length; i += 2) { pts.push(x0 + o.section[i + 1] * kz); pts.push(oy + (o.section[i] + m.dy) * z); }
        if (lit) stroke(pts, 6, ACCENT, 255, false);
        stroke(pts, 3, o.tone, 255, false);
        continue;
      }
      const bx = Math.round(x0 + o.z0 * kz), by = Math.round(oy + (o.y0 + m.dy) * z), bw = Math.max(2, Math.round((o.z1 - o.z0) * kz)), bh = Math.max(2, Math.round((o.y1 - o.y0) * z));
      const near = o.path === hovered();
      rrect(bx, by, bw, bh, 1, lit ? ACCENT : o.tone, lit ? 150 : near ? 90 : 22);
      border(bx, by, bw, bh, 1, lit ? 2 : 1, lit ? ACCENT : near ? 0xe4e4e7 : o.tone, lit || near ? 255 : 96);
    }
  }
  // the selection's foot and top, in figures
  const sel = outlineOf(chosen);
  if (sel !== null) {
    const says = sel.z0 === sel.z1 ? `${round1(sel.z0)} cm` : `${round1(sel.z0)} – ${round1(sel.z1)} cm`, m = placingOf(sel);
    const tx = Math.round(x0 + 4), ty = Math.round(oy + (sel.y1 + m.dy) * z + 7);
    rrect(tx - 4, ty - 2, textWidth(BOLD, says, 0) + 8, 18, 4, 0x18181b, 235);
    drawText(BOLD, tx, ty + 1, says, ACCENT, 255, 0);
  }
  // the playfield and the glass
  rect(x0 - 2, oy, 2, Len * z, mix(boardColor(tb), 0xffffff, 0.45));
  for (let g = 0; g < Len * z; g += 8) rect(Math.round(x0 + glass * kz), oy + g, 1, 4, 0x71717a);
  unclip();
}

// ---------------------------------------------------------------- picking and gestures

/** The element at a point of the table (centimetres): the smallest of those the point is on, so that a light under a ramp, or a
 *  switch in a lane, can be picked; '' for none. */
function pick(x: number, y: number): string {
  const reach = 5 / zoom();
  let best = '', size = 1e12;
  for (const o of placed()) {
    if (o.distance(x, y) > reach) continue;
    const area = (o.x1 - o.x0 + 0.5) * (o.y1 - o.y0 + 0.5);
    if (area <= size) { size = area; best = o.path; }
  }
  return best;
}
function down(e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  const hp = handleAt();
  if (hp.length > 0 && Math.abs(e.x - hp[0]) < 10 && Math.abs(e.y - hp[1]) < 10) {
    const c = centre();
    turnFrom = Math.atan2(e.y - (panY() + c[1] * zoom()), e.x - (panX() + c[0] * zoom())) * 180 / Math.PI;
    batch(() => { setDragTurn(0); setGesture(Gesture.Turn); });
    return;
  }
  const x = (e.x - panX()) / zoom(), y = (e.y - panY()) / zoom(), hit = pick(x, y);
  pressX = e.x; pressY = e.y;
  if (hit === '') { panFromX = e.x - panX(); panFromY = e.y - panY(); setGesture(Gesture.Pan); return; }
  batch(() => { if (hit !== selected()) select(hit); setDragX(0); setDragY(0); setGesture(Gesture.Press); });
}
function move(e: ui.PointerEvent): void {
  const z = zoom(), g = gesture();
  batch(() => { setPointX((e.x - panX()) / z); setPointY((e.y - panY()) / z); setInside(true); });
  if (g === Gesture.None) { setHovered(pick((e.x - panX()) / z, (e.y - panY()) / z)); return; }
  if (g === Gesture.Pan) { batch(() => { setPanX(Math.round(e.x - panFromX)); setPanY(Math.round(e.y - panFromY)); }); return; }
  if (g === Gesture.Turn) {
    const c = centre(), a = Math.atan2(e.y - (panY() + c[1] * z), e.x - (panX() + c[0] * z)) * 180 / Math.PI;
    // whole degrees; with Shift, steps of 15
    let d = Math.round(a - turnFrom);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    setDragTurn(e.shift ? Math.round(d / 15) * 15 : d);
    return;
  }
  if (g === Gesture.Press && Math.abs(e.x - pressX) + Math.abs(e.y - pressY) < 4) return;
  // millimetres; with Alt, tenths of a millimetre
  const grain = e.alt ? 100 : 10;
  batch(() => { setGesture(Gesture.Move); setDragX(Math.round((e.x - pressX) / z * grain) / grain); setDragY(Math.round((e.y - pressY) / z * grain) / grain); });
}
function up(e: ui.PointerEvent): void {
  const g = gesture(), dx = dragX(), dy = dragY(), turn = dragTurn();
  batch(() => {
    setGesture(Gesture.None); setDragX(0); setDragY(0); setDragTurn(0);
    if (g === Gesture.Move) { doc().seal(); moveSelected(dx, dy); doc().seal(); }
    else if (g === Gesture.Turn && turn !== 0) turnSelected(turn);
    else if (g === Gesture.Pan && Math.abs(e.x - pressX) + Math.abs(e.y - pressY) < 4) select('');
  });
}
function wheel(e: ui.PointerEvent): void {
  // a notch of a mouse wheel is one step; a trackpad sends fractions, and a pinch a factor per event
  wheelSum += e.wheel;
  if (e.pinch !== 1 && e.pinch > 0) { zoomBy(e.pinch, e.x, e.y); return; }
  if (Math.abs(wheelSum) < 1) return;
  const steps = wheelSum > 0 ? 1 : -1;
  wheelSum = 0;
  zoomBy(steps > 0 ? 1.2 : 1 / 1.2, e.x, e.y);
}

export function TopView(): i32 {
  // both views are drawn by hand: ask for a repaint when what they show changes
  createEffect(() => { doc(); selected(); hovered(); zoom(); panX(); panY(); gesture(); dragX(); dragY(); dragTurn(); ui.repaint(); });
  const where = (): string => inside() ? `x ${pointX().toFixed(1)}   y ${pointY().toFixed(1)} ${t(L.CM)}` : '';
  return <view class="grow basis-0 min-w-0 flex-row">
    <view class="grow basis-0 min-w-0 flex-col">
      <view class="flex-row items-center gap-1 h-9 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
        <Heading label={t(L.TOP_VIEW)} />
        <text class="ml-3 font-mono text-[11px] text-zinc-500">{where()}</text>
        <view class="grow" />
        <Tool icon="minus" label="" look="quiet" keys={() => ''} off={() => false} onClick={() => zoomBy(1 / 1.2, viewW / 2, viewH / 2)} />
        <text class="w-[64] text-center text-xs text-zinc-300">{`${zoom().toFixed(1)} px/cm`}</text>
        <Tool icon="plus" label="" look="quiet" keys={() => ''} off={() => false} onClick={() => zoomBy(1.2, viewW / 2, viewH / 2)} />
        <Tool icon="maximize" label={t(L.FIT)} look="quiet" keys={() => advanced() ? chord('0') : ''} off={() => false} onClick={fit} />
      </view>
      <view class="grow basis-0 min-h-0 relative overflow-hidden bg-zinc-950 cursor-default"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} onPointerLeave={(e: ui.PointerEvent) => { batch(() => { setInside(false); setHovered(''); }); }}>
        <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={drawTop} />
      </view>
    </view>
    <view class="w-[148] shrink-0 flex-col bg-zinc-900 border-l border-zinc-800">
      <view class="flex-row items-center h-9 px-3 shrink-0 border-b border-zinc-800"><Heading label={t(L.PROFILE)} /></view>
      <view class="grow basis-0 min-h-0 relative overflow-hidden"><canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={drawProfile} /></view>
    </view>
  </view>;
}
