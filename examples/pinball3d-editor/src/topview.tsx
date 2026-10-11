// The top view: the whole table seen from above, drawn from its file (shapes.ts), and beside it the same table seen from its right
// side, which shows what stands how high.
// Click selects, a drag moves, the round handle on a stalk turns. A selected path shows its points: a square moves a point, the round
// dot of a stretch bends it into an arc, a double click on a stretch adds a point. With an entry of the palette chosen, clicks place
// it instead. Points snap to the points of other things, to the table's axis and to the grid. Dragging the background pans, the wheel
// zooms. A distance around a thing (the body of a bumper, the hole of a kicker, the glow of a light) is a circle with a round
// handle on it: pulling the handle sets the distance. The painting of an upper playfield is shown inside its outline.
// Moving and turning a whole element change the document once, when the gesture ends (the element is drawn where it would go while
// it lasts); a point or an arc being dragged changes it as it goes, the whole drag being one step for undo.
import { createSignal, createEffect, Show, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { stroke, path as fillPath, rect, rrect, border, font, drawText, textWidth, clip, unclip, drawImage, drawImageRect, imageWidth, imageHeight } from 'zinc:gfx';
import { doc, table, placed, outlineOf, selected, select, hovered, setHovered, selectionTurns, selectionPlaced, advanced, zoom, panX, panY, setPanX, setPanY, zoomBy, fit, fitSoon, viewW, viewH,
  setViewSize, moveSelected, turnSelected, level, levels, nextLevel, onLevel, grid, setGrid, GRIDS, axis, setAxis, snapped, tool, clicks, placeAt, finishPlacing, activeRow, setActiveRow, dragRow, changeRows } from './state';
import { centreOf, schemaAt, fieldAt, isPoint, isPath, isClosed, isRadius } from './doc';
import { Outline, Shape, Draw, boardColor, mix } from './shapes';
import { pointsNeeded, rowsNeeded } from './presets';
import { view3d, dropping, dropBall, flashes, gameIfAny, moved, boardPainting, paintingOf } from './play';
import { Pane3D, PaneSwitch } from './view3d';
import { Tool, Heading, ACCENT, chord } from './widgets';
import * as L from './strings';
import { t, f, listName, uiLang } from './strings';

// ---------------------------------------------------------------- the gesture in progress

const enum Gesture { None, Press, Move, Turn, Pan, Point, Bend, Axis, Reach }
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

// ---------------------------------------------------------------- the points of the selection

/** A handle of the selection: the square of a point, or the round dot of a stretch of a path. */
class Handle {
  /** The row it sets: "walls[2].points[1]", "gates[0].a". */
  row: string;
  x: number; y: number;
  /** The round dot of the stretch that starts at `row`: it sets the row's bulge. (ax, ay) to (bx, by) is the stretch. */
  bend: boolean = false;
  ax: number = 0; ay: number = 0; bx: number = 0; by: number = 0;
  /** The handle of a distance around (ax, ay): `row` is the field that holds the distance, `reach` the distance now. */
  around: boolean = false;
  reach: number = 0;
  constructor(row: string, x: number, y: number) { this.row = row; this.x = x; this.y = y; }
}
/** The handles of the selection: one per point, one per stretch of its path. A thing that is at one point has none: it is moved
 *  as a whole. */
function handles(): Handle[] {
  const out: Handle[] = [], path = selected(), g = gesture();
  if (!selectionPlaced() || g === Gesture.Move || g === Gesture.Turn) return out;
  const s = schemaAt(path), item: any = doc().get(path);
  let points = 0, paths = 0;
  for (const fd of s.fields) { if (isPoint(fd)) points++; else if (isPath(fd)) paths++; }
  // a distance around its point: the handle is on the circle, at the right of the point (just off the thing while the distance is 0)
  if (points === 1) for (const fd of s.fields) {
    if (!isRadius(fd)) continue;
    const c = centre(), r: number = item[fd.name], h = new Handle(`${path}.${fd.name}`, c[0] + Math.max(r, 12 / zoom()), c[1]);
    h.around = true; h.ax = c[0]; h.ay = c[1]; h.reach = r;
    out.push(h);
  }
  if (points < 2 && paths === 0) return out;
  for (const fd of s.fields) {
    const v: any = item[fd.name];
    if (isPoint(fd)) { const x: number = v[0], y: number = v[1]; out.push(new Handle(`${path}.${fd.name}`, x, y)); continue; }
    if (!isPath(fd)) continue;
    const n: i32 = v.length, last = isClosed(fd, item) ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n, ax: number = v[i][0], ay: number = v[i][1], bx: number = v[j][0], by: number = v[j][1], bulge: number = v[i].length > 2 ? v[i][2] : 0;
      const dx = bx - ax, dy = by - ay, chord = Math.max(0.001, Math.sqrt(dx * dx + dy * dy)), sag = bulge * chord / 2;
      // the top of the arc: to the left of the way, as the game's geometry bends it
      const h = new Handle(`${path}.${fd.name}[${i}]`, (ax + bx) / 2 + dy / chord * sag, (ay + by) / 2 - dx / chord * sag);
      h.bend = true; h.ax = ax; h.ay = ay; h.bx = bx; h.by = by;
      out.push(h);
    }
    for (let i = 0; i < n; i++) { const x: number = v[i][0], y: number = v[i][1]; out.push(new Handle(`${path}.${fd.name}[${i}]`, x, y)); }
  }
  return out;
}
/** The handle at a place of the view (pixels), the squares before the dots; null for none. */
function handleUnder(x: number, y: number): Handle | null {
  const all = handles(), z = zoom();
  for (let pass = 0; pass < 2; pass++) {
    for (const h of all) if (h.bend === (pass === 1) && Math.abs(panX() + h.x * z - x) < 7 && Math.abs(panY() + h.y * z - y) < 7) return h;
  }
  return null;
}
let held: Handle | null = null;

// ---------------------------------------------------------------- drawing

// the sizes asked here are the ones baked into the program
let SMALL: i32 = -1, BOLD: i32 = -1;
function fonts(): void { if (SMALL < 0) { SMALL = font('sans', 10); BOLD = font('sans-bold', 11); } }
const GUIDE: i32 = 0x22d3ee;

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
/** One shape. `grow` > 0: its outline alone, that many pixels wider (what is selected, what the pointer is over). */
export function drawShape(s: Shape, m: Placing, ox: number, oy: number, z: number, push: number, color: i32, alpha: i32, grow: number): void {
  const pts = onScreen(s, m, ox, oy, z, push);
  if (s.draw === Draw.Disc) {
    const r = Math.max(1.5, s.r * z) + grow;
    rrect(pts[0] - r, pts[1] - r, r * 2, r * 2, r, color, alpha);
  } else if (s.draw === Draw.Line) stroke(pts, Math.max(1.25, s.r * z) + grow * 2, color, alpha, false);
  else if (grow > 0) stroke(pts, grow * 2, color, alpha, true);
  else { const contour: number[] = [pts.length / 2]; for (const v of pts) contour.push(v); fillPath(contour, color, alpha); }
}
/** The shapes of an outline as they are, for a drawing outside the view (the palette). */
export function drawPlain(o: Outline, ox: number, oy: number, z: number): void { for (const s of o.shapes) drawShape(s, STILL, ox, oy, z, 0, s.color, s.alpha, 0); }
function drawOutline(o: Outline, ox: number, oy: number, z: number, halo: i32): void {
  const m = placingOf(o);
  // what is on another level than the one being worked on is only hinted at
  if (!onLevel(o)) { for (const s of o.shapes) drawShape(s, m, ox, oy, z, 0, s.color, Math.round(s.alpha * 0.16), 0); return; }
  // what stands higher throws a longer shadow: the height read at a glance (from the level it stands on, when one is chosen)
  const top = o.z1 - (level() > 0 && o.level >= 0 ? level() : 0);
  // the painting of an upper playfield, over the box around it as the game lays it, under a veil as the board's is, and inside
  // its outline as the game cuts it
  if (o.plate && o.image !== '' && m === STILL) {
    const im = paintingOf(o.image), bx = ox + o.x0 * z, by = oy + o.y0 * z, bw = (o.x1 - o.x0) * z, bh = (o.y1 - o.y0) * z;
    const shape = o.shapes.length > 0 && o.shapes[0].draw === Draw.Fill ? onScreen(o.shapes[0], STILL, ox, oy, z, 0) : ([] as number[]);
    if (im >= 0 && (shape.length < 6 || fillsBox(shape, bw * bh))) { drawImage(im, bx, by, bw, bh, 255, 0); rrect(bx, by, bw, bh, 0, 0x05060c, 110); }
    else if (im >= 0) {
      drawInside(im, bx, by, bw, bh, shape);
      const veil: number[] = [shape.length / 2];
      for (const p of shape) veil.push(p);
      fillPath(veil, 0x05060c, 110);
    }
  }
  if (!o.plate && o.layer > 0 && top > 0.3) {
    const push = Math.min(top, 14) * 0.11 * z;
    for (const s of o.shapes) if (s.alpha > 100) drawShape(s, m, ox, oy, z, push, 0x000000, 70, 0);
  }
  if (halo >= 0) for (const s of o.shapes) if (s.alpha > 100) drawShape(s, m, ox, oy, z, 0, halo, 255, 2);
  for (const s of o.shapes) drawShape(s, m, ox, oy, z, 0, s.color, s.alpha, 0);
}
/** Whether an outline (x, y pairs) covers the whole box around it, whose area is given: a rectangle with straight sides. */
function fillsBox(poly: number[], area: number): boolean {
  let twice = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; twice += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1]; }
  return Math.abs(Math.abs(twice) / 2 - area) < 1;
}
/** An image laid over a box of the window (x, y, w, h), shown only inside an outline (x, y pairs, in window pixels).
 *  ponytail: zinc:gfx clips to a box (clip), not to a path. The image is drawn in strips one pixel high, each cut where the
 *  outline crosses the middle of that row: exact to the pixel, without smoothing of the edge, and as many draws as the outline is
 *  tall. A path clip in zinc:gfx (the raster and the GL renderer) would draw it once, with a smooth edge. */
function drawInside(im: i32, x: number, y: number, w: number, h: number, poly: number[]): void {
  const iw = imageWidth(im), ih = imageHeight(im), n = poly.length / 2;
  if (iw <= 0 || ih <= 0 || w <= 0 || h <= 0) return;
  let top = poly[1], bottom = poly[1];
  for (let i = 1; i < n; i++) { top = Math.min(top, poly[i * 2 + 1]); bottom = Math.max(bottom, poly[i * 2 + 1]); }
  for (let row = Math.floor(top); row < Math.ceil(bottom); row++) {
    const at = row + 0.5, cuts: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ay = poly[i * 2 + 1], by = poly[j * 2 + 1];
      if ((ay <= at) !== (by <= at)) cuts.push(poly[i * 2] + (at - ay) / (by - ay) * (poly[j * 2] - poly[i * 2]));
    }
    cuts.sort((a: number, b: number): number => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const from = Math.round(cuts[k]), to = Math.round(cuts[k + 1]);
      if (to > from) drawImageRect(im, (from - x) / w * iw, (row - y) / h * ih, (to - from) / w * iw, ih / h, from, row, to - from, 1);
    }
  }
}
/** The step of the grid and of the rulers at a zoom: 5 cm, 10 when the table is small on screen. */
function gridStep(z: number): number { return z < 4.5 ? 10 : 5; }

function drawTop(x: i32, y: i32, w: i32, h: i32): void {
  fonts();
  setViewSize(w, h);
  const tb = table(), z = zoom(), ox = x + panX(), oy = y + panY(), W = tb.playfield.width, Len = tb.playfield.length, board = boardColor(tb);
  clip(x, y, w, h);
  // the board and its grid
  rrect(ox - 3, oy - 3, W * z + 6, Len * z + 6, 5, 0x27272a, 255);
  rect(ox, oy, W * z, Len * z, board);
  // the painting of the board, under a veil: it is what the elements are placed on, not what is being drawn
  const painting = boardPainting();
  if (painting >= 0) { drawImage(painting, ox, oy, W * z, Len * z, 255, 0); rrect(ox, oy, W * z, Len * z, 0, 0x05060c, 150); }
  const step = gridStep(z);
  for (let g = step; g < W; g += step) rect(Math.round(ox + g * z), oy, 1, Len * z, mix(board, 0xffffff, g % 10 === 0 ? 0.1 : 0.03));
  for (let g = step; g < Len; g += step) rect(ox, Math.round(oy + g * z), W * z, 1, mix(board, 0xffffff, g % 10 === 0 ? 0.1 : 0.03));
  // the axis the table is mirrored about
  const gx = Math.round(ox + axis() * z);
  for (let d = 0; d < Len * z; d += 10) rect(gx, oy + d, 1, 5, mix(board, GUIDE, 0.5));
  // everything on it, the lowest first; what is selected and what the pointer is over wear a halo
  const all = placed(), chosen = selected(), over = hovered();
  for (const o of all) drawOutline(o, ox, oy, z, o.path === chosen ? ACCENT : o.path === over ? 0xe4e4e7 : -1);
  const sel = outlineOf(chosen);
  if (sel !== null) drawHandles(sel, ox, oy, z);
  drawPlacing(ox, oy, z);
  drawGame(ox, oy, z);
  // the rulers, in centimetres: beside the board, or along the edge of the view when the board goes past it
  const top = Math.max(oy - 19, y + 4), pinnedTop = top > oy - 19, left = Math.max(ox - 30, x + 2), pinnedLeft = left > ox - 30;
  if (pinnedTop) rect(x, y, w, 20, 0x09090b);
  if (pinnedLeft) rect(x, y, 30, h, 0x09090b);
  for (let g = 0; g <= W; g += 10) { const s = `${g}`; drawText(SMALL, Math.round(ox + g * z - textWidth(SMALL, s, 0) / 2), top, s, 0x71717a, 255, 0); }
  for (let g = 0; g <= Len; g += 10) { const s = `${g}`; drawText(SMALL, Math.round(left + 21 - textWidth(SMALL, s, 0)), Math.round(oy + g * z - 6), s, 0x71717a, 255, 0); }
  // the marker of the axis, on the ruler: it is dragged to move the axis
  fillPath([3, gx - 6, top + 12, gx + 6, top + 12, gx, top + 19], GUIDE, 255);
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
  // its points: a dot to bend each stretch, a square to move each point (the one last pressed is filled)
  const active = activeRow();
  for (const hd of handles()) {
    const hx = Math.round(ox + hd.x * z), hy = Math.round(oy + hd.y * z);
    if (hd.around) {
      // the circle the distance draws, and the handle on it
      const ring: number[] = [], rr = hd.reach * z;
      for (let i = 0; i <= 48 && rr > 0; i++) { ring.push(ox + hd.ax * z + Math.cos(i * Math.PI / 24) * rr); ring.push(oy + hd.ay * z + Math.sin(i * Math.PI / 24) * rr); }
      if (rr > 0) stroke(ring, 1.5, ACCENT, 200, false);
      rrect(hx - 6, hy - 6, 12, 12, 6, ACCENT, 255);
      rrect(hx - 3, hy - 3, 6, 6, 3, hd.reach > 0 ? ACCENT : 0x18181b, 255);
      continue;
    }
    if (hd.bend) { rrect(hx - 4, hy - 4, 8, 8, 4, 0x18181b, 255); border(hx - 4, hy - 4, 8, 8, 4, 1.5, ACCENT, 255); continue; }
    rect(hx - 5, hy - 5, 10, 10, 0x18181b);
    rect(hx - 4, hy - 4, 8, 8, hd.row === active ? ACCENT : 0xfafafa);
  }
  // its name, and what the gesture is doing to it
  let tag = doc().nameOf(o.path);
  if (gesture() === Gesture.Move) tag += `   ${sign(dragX())}, ${sign(dragY())} cm`;
  else if (gesture() === Gesture.Turn) tag += `   ${sign(dragTurn())}°`;
  else if (gesture() === Gesture.Reach && held !== null) tag += `   ${doc().get(held.row)} cm`;
  else if ((gesture() === Gesture.Point || gesture() === Gesture.Bend) && held !== null) {
    const row: any = doc().get(held.row);
    if (row !== undefined) tag += gesture() === Gesture.Bend ? `   ${row.length > 2 ? row[2] : 0}` : `   ${row[0]}, ${row[1]} cm`;
  }
  const tw = textWidth(BOLD, tag, 0), tx = Math.round(ox + (o.x0 + o.x1) / 2 * z + dragX() * z - tw / 2), ty = Math.round(oy + o.y1 * z + dragY() * z + 11);
  rrect(tx - 6, ty - 2, tw + 12, 18, 4, 0x18181b, 235);
  border(tx - 6, ty - 2, tw + 12, 18, 4, 1, ACCENT, 200);
  drawText(BOLD, tx, ty + 1, tag, ACCENT, 255, 0);
}
/** What is being placed: the points clicked so far, and the stretch to where the next click would go. */
function drawPlacing(ox: number, oy: number, z: number): void {
  const p = tool();
  if (p === null || p.list === '') return;
  const got = clicks(), pts: number[] = [];
  for (const c of got) { pts.push(ox + c[0] * z); pts.push(oy + c[1] * z); }
  let nx = 0, ny = 0;
  if (inside()) { const n = snapped(pointX(), pointY(), '', false); nx = ox + n[0] * z; ny = oy + n[1] * z; pts.push(nx); pts.push(ny); }
  if (pts.length >= 4) stroke(pts, 2, ACCENT, 255, false);
  for (const c of got) rect(Math.round(ox + c[0] * z) - 4, Math.round(oy + c[1] * z) - 4, 8, 8, ACCENT);
  if (inside()) { rect(Math.round(nx) - 7, Math.round(ny), 15, 1, ACCENT); rect(Math.round(nx), Math.round(ny) - 7, 1, 15, ACCENT); }
}
const TOUCHED: i32 = 0xffffff, FIRED: i32 = 0x4ade80;
/** The game being played, on the top view: what the balls touched lights up white for a moment, a switch or a rule that fired
 *  lights up green with the name of its event, and each ball is where the physics has it (its shadow farther the higher it is). */
function drawGame(ox: number, oy: number, z: number): void {
  for (const fl of flashes) {
    const o = outlineOf(fl.path);
    if (o === null) continue;
    const fired = fl.event !== '';
    for (const s of o.shapes) if (s.alpha > 100) drawShape(s, STILL, ox, oy, z, 0, fired ? FIRED : TOUCHED, 255, fired ? 3 : 1.5);
    for (const s of o.shapes) drawShape(s, STILL, ox, oy, z, 0, s.color, s.alpha, 0);
    if (!fired) continue;
    const tw = textWidth(BOLD, fl.event, 0), tx = Math.round(ox + o.x1 * z + 6), ty = Math.round(oy + o.y0 * z - 8);
    rrect(tx - 4, ty - 2, tw + 8, 17, 4, 0x052e16, 235);
    drawText(BOLD, tx, ty, fl.event, FIRED, 255, 0);
  }
  const g = gameIfAny();
  if (g === null) return;
  const r = Math.max(3, table().physics.ball.radius * z);
  for (const b of g.physics.balls) {
    if (!b.live) continue;
    const bx = ox + b.x * z, by = oy + b.y * z, push = Math.max(0, Math.min(b.z, 14)) * 0.11 * z;
    rrect(bx - r + push, by - r + push, r * 2, r * 2, r, 0x000000, 110);
    rrect(bx - r, by - r, r * 2, r * 2, r, 0xe4e4e7, 255);
    rrect(bx - r * 0.55, by - r * 0.6, r * 0.6, r * 0.6, r * 0.3, 0xffffff, 255);
  }
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
  {
    for (const o of placed()) {
      const m = placingOf(o), lit = o.path === chosen, faint = !onLevel(o);
      if (o.section.length > 0) {
        const pts: number[] = [];
        for (let i = 0; i + 1 < o.section.length; i += 2) { pts.push(x0 + o.section[i + 1] * kz); pts.push(oy + (o.section[i] + m.dy) * z); }
        if (lit) stroke(pts, 6, ACCENT, 255, false);
        stroke(pts, 3, o.tone, faint ? 60 : 255, false);
        continue;
      }
      const bx = Math.round(x0 + o.z0 * kz), by = Math.round(oy + (o.y0 + m.dy) * z), bw = Math.max(2, Math.round((o.z1 - o.z0) * kz)), bh = Math.max(2, Math.round((o.y1 - o.y0) * z));
      const near = o.path === hovered();
      // an upper playfield is a plate across the table at its height: it reads as a level
      rrect(bx, by, bw, bh, 1, lit ? ACCENT : o.tone, lit ? 150 : near ? 90 : o.plate && !faint ? 120 : 22);
      border(bx, by, bw, bh, 1, lit ? 2 : 1, lit ? ACCENT : near ? 0xe4e4e7 : o.tone, lit || near ? 255 : faint ? 30 : o.plate ? 255 : 96);
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
  let best = '', size = 1e12, high = -1;
  for (const o of placed()) {
    // what is on another level than the one being worked on is not picked; with all levels shown, the upper one is on top
    if (!onLevel(o) || o.distance(x, y) > reach) continue;
    const area = (o.x1 - o.x0 + 0.5) * (o.y1 - o.y0 + 0.5), at = Math.max(0, o.level);
    if (at > high || (at === high && area <= size)) { size = area; best = o.path; high = at; }
  }
  return best;
}
/** Whether a place of the view is on the marker of the axis. */
function onAxisMarker(x: number, y: number): boolean {
  const top = Math.max(panY() - 19, 4);
  return Math.abs(x - (panX() + axis() * zoom())) < 8 && y > top + 6 && y < top + 24;
}
function down(e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  const z = zoom(), x = (e.x - panX()) / z, y = (e.y - panY()) / z;
  pressX = e.x; pressY = e.y;
  if (dropping()) { dropBall(Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.max(0, level())); return; }
  if (tool() !== null) { const p = snapped(x, y, '', e.alt); placeAt(p[0], p[1]); return; }
  if (onAxisMarker(e.x, e.y)) { setGesture(Gesture.Axis); return; }
  const hp = handleAt();
  if (hp.length > 0 && Math.abs(e.x - hp[0]) < 10 && Math.abs(e.y - hp[1]) < 10) {
    const c = centre();
    turnFrom = Math.atan2(e.y - (panY() + c[1] * z), e.x - (panX() + c[0] * z)) * 180 / Math.PI;
    batch(() => { setDragTurn(0); setGesture(Gesture.Turn); });
    return;
  }
  held = handleUnder(e.x, e.y);
  if (held !== null) {
    doc().seal();
    batch(() => { setActiveRow(held !== null && !held.bend && !held.around ? held.row : ''); setGesture(held !== null && held.around ? Gesture.Reach : held !== null && held.bend ? Gesture.Bend : Gesture.Point); });
    return;
  }
  const hit = pick(x, y);
  if (hit === '') { panFromX = e.x - panX(); panFromY = e.y - panY(); setGesture(Gesture.Pan); return; }
  batch(() => { if (hit !== selected()) select(hit); else setActiveRow(''); setDragX(0); setDragY(0); setGesture(Gesture.Press); });
}
/** The bulge an arc takes when the dot of its stretch is dragged to (x, y): how far the place is to the left of the stretch, over
 *  half its length. Near a straight line, a quarter circle or a half circle it is that exactly (not with `free`). */
function bulgeAt(h: Handle, x: number, y: number, free: boolean): number {
  const dx = h.bx - h.ax, dy = h.by - h.ay, chord = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const sag = ((x - (h.ax + h.bx) / 2) * dy - (y - (h.ay + h.by) / 2) * dx) / chord;
  let b = Math.max(-3, Math.min(3, sag / (chord / 2)));
  if (!free) for (const nice of [0, 0.4142, -0.4142, 1, -1]) if (Math.abs(b - nice) < 0.06) b = nice;
  return Math.round(b * 10000) / 10000;
}
function move(e: ui.PointerEvent): void {
  const z = zoom(), g = gesture(), x = (e.x - panX()) / z, y = (e.y - panY()) / z;
  batch(() => { setPointX(x); setPointY(y); setInside(true); });
  if (g === Gesture.None) { setHovered(tool() !== null ? '' : pick(x, y)); return; }
  if (g === Gesture.Pan) { batch(() => { setPanX(Math.round(e.x - panFromX)); setPanY(Math.round(e.y - panFromY)); }); return; }
  if (g === Gesture.Axis) { setAxis(Math.max(0, Math.min(table().playfield.width, Math.round(x * 20) / 20))); return; }
  if (g === Gesture.Turn) {
    const c = centre(), a = Math.atan2(e.y - (panY() + c[1] * z), e.x - (panX() + c[0] * z)) * 180 / Math.PI;
    // whole degrees; with Shift, steps of 15
    let d = Math.round(a - turnFrom);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    setDragTurn(e.shift ? Math.round(d / 15) * 15 : d);
    return;
  }
  if (g === Gesture.Reach && held !== null) {
    if (Math.abs(e.x - pressX) + Math.abs(e.y - pressY) < 4) return;
    // how far the pointer is from the thing's point, by millimetres (half centimetres on the grid), within the field's limits
    const fd = fieldAt(held.row), grain = e.alt || grid() === 0 ? 0.1 : 0.5, d = Math.sqrt((x - held.ax) * (x - held.ax) + (y - held.ay) * (y - held.ay));
    if (fd !== null) dragRow(held.row, Math.max(fd.min, Math.min(fd.max, Math.round(Math.round(d / grain) * grain * 10) / 10)));
    return;
  }
  if ((g === Gesture.Point || g === Gesture.Bend) && held !== null) {
    if (Math.abs(e.x - pressX) + Math.abs(e.y - pressY) < 4) return;
    const row: any = doc().get(held.row), next: number[] = [];
    if (row === undefined) return;
    if (g === Gesture.Point) {
      const p = snapped(x, y, selected(), e.alt);
      next.push(p[0]); next.push(p[1]);
      for (let k = 2; k < row.length; k++) next.push(row[k]);
    } else {
      const b = bulgeAt(held, x, y, e.alt);
      next.push(row[0]); next.push(row[1]);
      if (b !== 0) next.push(b);
    }
    dragRow(held.row, next);
    return;
  }
  if (g === Gesture.Press && Math.abs(e.x - pressX) + Math.abs(e.y - pressY) < 4) return;
  // by steps of the grid; with Alt, tenths of a millimetre
  const grain = e.alt || grid() === 0 ? 0.01 : grid();
  batch(() => { setGesture(Gesture.Move); setDragX(Math.round((e.x - pressX) / z / grain) * grain); setDragY(Math.round((e.y - pressY) / z / grain) * grain); });
}
function up(e: ui.PointerEvent): void {
  const g = gesture(), dx = dragX(), dy = dragY(), turn = dragTurn();
  batch(() => {
    setGesture(Gesture.None); setDragX(0); setDragY(0); setDragTurn(0);
    if (g === Gesture.Move) { doc().seal(); moveSelected(dx, dy); doc().seal(); }
    else if (g === Gesture.Turn && turn !== 0) turnSelected(turn);
    else if (g === Gesture.Point || g === Gesture.Bend || g === Gesture.Reach) doc().seal();
    else if (g === Gesture.Pan && Math.abs(e.x - pressX) + Math.abs(e.y - pressY) < 4) select('');
  });
  held = null;
}
/** A double click ends the path being placed; on a stretch of the selected path it adds a point there. */
function twice(e: ui.PointerEvent): void {
  if (tool() !== null) { finishPlacing(); return; }
  const z = zoom(), x = (e.x - panX()) / z, y = (e.y - panY()) / z;
  let best: Handle | null = null, near = 6 / z;
  for (const h of handles()) {
    if (!h.bend) continue;
    // the stretch as two straight pieces through the top of its arc
    const d = Math.min(toPiece(x, y, h.ax, h.ay, h.x, h.y), toPiece(x, y, h.x, h.y, h.bx, h.by));
    if (d < near) { near = d; best = h; }
  }
  if (best === null) return;
  const row = best.row, cut = row.lastIndexOf('['), at: i32 = parseInt(row.slice(cut + 1, row.length - 1), 10) + 1, p = snapped(x, y, selected(), e.alt);
  batch(() => { setGesture(Gesture.None); if (changeRows(row.slice(0, cut), at, [p[0], p[1]])) setActiveRow(`${row.slice(0, cut)}[${at}]`); });
  held = null;
}
function toPiece(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  return Math.sqrt((ax + dx * u - x) * (ax + dx * u - x) + (ay + dy * u - y) * (ay + dy * u - y));
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
/** "5 mm", "1 cm", or that points do not snap. */
function gridName(g: number): string { return g === 0 ? t(L.SNAP_OFF) : g >= 1 ? `${g} cm` : `${Math.round(g * 10)} mm`; }
/** What to do with the entry of the palette that is chosen. */
function placingHint(): string {
  const p = tool();
  if (p === null || p.list === '') return '';
  const name = p.en === '' ? listName(p.list, true) : uiLang() === 'fr' ? p.fr : p.en;
  return f(rowsNeeded(p.list) > 0 ? L.PLACE_PATH : pointsNeeded(p.list) > 1 ? L.PLACE_TWO : L.PLACE_ONE, name);
}

export function TopView(): i32 {
  // both views are drawn by hand: ask for a repaint when what they show changes
  createEffect(() => { doc(); selected(); hovered(); zoom(); panX(); panY(); gesture(); dragX(); dragY(); dragTurn(); axis(); activeRow(); tool(); clicks(); moved(); level(); if (tool() !== null) { pointX(); pointY(); } ui.repaint(); });
  // the top view is narrower beside the table in 3D: the whole table again, once the view has its new size
  createEffect(() => { view3d(); fitSoon(); });
  // where the pointer is on the table, and how large the table is shown
  const where = (): string => `${inside() ? `x ${pointX().toFixed(1)}  y ${pointY().toFixed(1)} ${t(L.CM)}   ` : ''}${zoom().toFixed(1)} px/cm`;
  return <view class="grow basis-0 min-w-0 flex-row">
    <view class="grow basis-0 min-w-0 flex-col">
      <view class="flex-row items-center gap-1 h-9 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
        <Heading label={t(L.TOP_VIEW)} />
        <view class="grow" />
        <Show when={levels().length > 1}>
          <button class={`flex-row items-center gap-1 h-7 px-2 rounded-md cursor-pointer ${level() < 0 ? 'bg-zinc-900 hover:bg-zinc-800' : 'bg-zinc-700'}`} onClick={nextLevel}>
            <text class="text-[11px] text-zinc-500">{t(L.LEVEL)}</text>
            <text class="text-xs font-bold text-zinc-200">{level() < 0 ? t(L.ALL_LEVELS) : `${level()} cm`}</text>
          </button>
        </Show>
        <button class="flex-row items-center gap-1 h-7 px-2 rounded-md cursor-pointer bg-zinc-900 hover:bg-zinc-800" onClick={() => setGrid(GRIDS[(GRIDS.indexOf(grid()) + 1) % GRIDS.length])}>
          <text class="text-[11px] text-zinc-500">{t(L.SNAP)}</text>
          <text class="text-xs font-bold text-zinc-200">{gridName(grid())}</text>
        </button>
        <Tool icon="minus" label="" look="quiet" keys={() => ''} off={() => false} onClick={() => zoomBy(1 / 1.2, viewW / 2, viewH / 2)} />
        <Tool icon="plus" label="" look="quiet" keys={() => ''} off={() => false} onClick={() => zoomBy(1.2, viewW / 2, viewH / 2)} />
        <Tool icon="maximize" label="" look="quiet" keys={() => advanced() ? chord('0') : ''} off={() => false} onClick={fit} />
      </view>
      <view class={`grow basis-0 min-h-0 relative overflow-hidden bg-zinc-950 ${tool() !== null || dropping() ? 'cursor-crosshair' : 'cursor-default'}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} onDoubleClick={twice}
        onPointerLeave={(e: ui.PointerEvent) => { batch(() => { setInside(false); setHovered(''); }); }}>
        <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={drawTop} />
        <view class="absolute left-[8] top-[8] px-2 py-1 rounded bg-zinc-900 border border-zinc-800"><text class="font-mono text-[10px] text-zinc-400">{where()}</text></view>
        <Show when={placingHint() !== ''}>
          <view class="absolute left-[12] right-[12] bottom-[12] flex-row px-3 py-2 rounded-md bg-zinc-900 border border-amber-400">
            <text class="grow basis-0 text-xs text-amber-200">{placingHint()}</text>
          </view>
        </Show>
      </view>
    </view>
    <Show when={!view3d()}>
      <view class="w-[148] shrink-0 flex-col bg-zinc-900 border-l border-zinc-800">
        <view class="flex-row items-center h-9 px-2 shrink-0 border-b border-zinc-800"><PaneSwitch /></view>
        <view class="grow basis-0 min-h-0 relative overflow-hidden"><canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={drawProfile} /></view>
      </view>
    </Show>
    <Show when={view3d()}><Pane3D /></Show>
  </view>;
}
