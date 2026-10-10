// Points of interest: a model or a panorama fills the middle of the window, shown by the table's own views (../src/viewer.ts,
// ../src/panorama.ts), so a point is where visitors will find it. A drag turns the object or looks around, the wheel comes closer; a click
// on the object places a point, a click on a point selects it, a drag moves it. The panel at the right (inspector.tsx) names the point,
// describes it, gives it the view it opens with ("use this view": what is seen now) and the sequence its card leads to.
// The files are those of the project folder: preview.tsx has pointed ../src/files.ts there.
import { createSignal, createEffect, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rect, rrect, border, font, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { Media, Point, copyProject } from '../src/project';
import { ObjectView } from '../src/viewer';
import { PanoramaView } from '../src/panorama';
import { Frame } from '../src/frame';
import { files } from '../src/files';
import { project, lang, pointing, selectedPoint, pickPoint, addPoint, movePoint, closePoints, setStatus, logging } from './state';
import { Shape, parseShape, hit } from './pick';
import { Ico, Tool, ACCENT, DARK, INK, KIND_ICON, KIND_COLOUR, kindIndex } from './widgets';
import * as L from './strings';
import { t, f } from './strings';

/** Degrees the object turns for a pixel of drag. */
const TURN = 0.4;
/** A point takes a click this far from its centre, in pixels. */
const NEAR = 14;
const NUMBER = font('sans-bold', 11);

// ---------------------------------------------------------------- what is shown

// The view of the medium being pointed: an object viewer and, for an OBJ file, its triangles (to find the place under a click), or a
// panorama. Made when the medium is opened and kept while its file is the same; its angles are the author's, not the document's.
let object: ObjectView | null = null, pano: PanoramaView | null = null, shape: Shape | null = null, shownKey = '';
/** Why the file cannot be shown ('' when it can). */
const [failed, setFailed] = createSignal<string>('');
// the box of the view on the window, known once it was drawn
let bx: number = 0, by: number = 0, bw: number = 0, bh: number = 0;

function forget(): void {
  const o = object, p = pano;
  if (o !== null) o.dispose();
  if (p !== null) p.dispose();
  object = null; pano = null; shape = null; shownKey = '';
}
function show(m: Media): void {
  const key = `${m.kind} ${m.file} ${m.texture}`;
  if (key === shownKey) return;
  forget();
  shownKey = key;
  let why = '';
  try {
    if (m.kind === 'model') {
      // the viewer reads a medium and its project once: it gets a copy, so that an undo cannot leave it with objects the document dropped
      const snap = copyProject(project()), own = snap.medium(m.id);
      if (own !== null) object = new ObjectView(snap, own, snap.theme, lang(), new Frame(snap.table.width, snap.table.height), false);
      if (m.file.toLowerCase().endsWith('.obj')) shape = parseShape(files.text(m.file));
    } else {
      const picture = files.picture(m.file);
      if (picture >= 0) pano = new PanoramaView(picture, m.view); else why = m.file;
    }
  } catch (e) { why = e.message; object = null; shape = null; }
  setFailed(why);
}

/** What the author sees now: yaw, pitch, and the distance of a model or the field of view of a panorama. */
export function currentView(): number[] {
  const o = object, p = pano;
  return o !== null ? [o.yaw, o.pitch, o.reach] : p !== null ? [p.yaw, p.pitch, p.fov] : [0, 0, 0];
}
/** Glides to a view: the one a point opens with, or the one the medium opens with. */
export function showView(yaw: number, pitch: number, reach: number): void {
  const o = object, p = pano;
  if (o !== null) o.glide(yaw, pitch, reach, 0.6);
  if (p !== null) p.glide(yaw, pitch, reach, 0.6);
  ui.repaint();
}
function resetView(): void {
  const m = pointing();
  if (m !== null) showView(m.view.yaw, m.view.pitch, m.kind === 'panorama' ? m.view.fov : m.view.distance);
}

// ---------------------------------------------------------------- points on the screen

// the point being dragged and where the pointer has it
let pressed = false, moved = false, pressX: number = 0, pressY: number = 0, lastX: number = 0, lastY: number = 0, dragX: number = 0, dragY: number = 0;
let grabbed: Point | null = null;
let mx: number = 0, my: number = 0;
/** Where a point is drawn: into mx, my. False when it is on the far side of the object or out of the picture. */
function where(q: Point): boolean {
  const o = object, p = pano;
  if (grabbed === q && moved) { mx = dragX; my = dragY; return true; }
  if (o !== null) { o.locate(q.at); mx = o.px; my = o.py; return o.pfacing; }
  if (p !== null) {
    const s = p.project(q.at, bx, by, bw, bh);
    if (s.length === 2) { mx = s[0]; my = s[1]; return true; }
  }
  return false;
}
function pointAt(gx: number, gy: number): Point | null {
  const m = pointing();
  if (m === null) return null;
  for (let i = m.points.length - 1; i >= 0; i--) {
    if (where(m.points[i]) && Math.abs(mx - gx) <= NEAR && Math.abs(my - gy) <= NEAR) return m.points[i];
  }
  return null;
}
/** The place of the object, or the direction of the panorama, under a point of the window ([] when there is none). */
function under(gx: number, gy: number): number[] {
  const o = object, p = pano;
  if (o !== null) {
    const r = o.ray(gx, gy), s = shape;
    // ponytail: a glTF model has no triangles here, so its point goes on the plane through the middle of the object that faces the author;
    // a ray cast in zinc:3d, or the depth of a pixel, would put it on the surface. The advanced mode has the three numbers.
    const far = s !== null ? hit(s, [r[0], r[1], r[2]], [r[3], r[4], r[5]]) : 1;
    return far < 0 ? [] : [r[0] + r[3] * far, r[1] + r[4] * far, r[2] + r[5] * far];
  }
  if (p !== null) return p.unproject(gx, gy, bx, by, bw, bh);
  return [];
}
/** --log: where a point was put and where the view draws the place the file keeps for it. */
function log(q: Point, gx: number, gy: number): void {
  const m = pointing();
  if (!logging || m === null) return;
  const seen = where(q);
  console.log(`point ${m.id}/${q.id} at ${q.at[0]} ${q.at[1]} ${q.at[2]} clicked ${gx} ${gy} drawn ${mx.toFixed(1)} ${my.toFixed(1)}${seen ? '' : ' hidden'}`);
}

function down(e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  pressed = true; moved = false; pressX = e.gx; pressY = e.gy; lastX = e.gx; lastY = e.gy;
  grabbed = pointAt(e.gx, e.gy);
  if (grabbed !== null) pickPoint(grabbed);
}
function move(e: ui.PointerEvent): void {
  if (!pressed || (!moved && Math.abs(e.gx - pressX) + Math.abs(e.gy - pressY) < 4)) return;
  moved = true;
  const o = object, p = pano;
  if (grabbed !== null) { dragX = e.gx; dragY = e.gy; }
  else if (o !== null) o.turn(-(e.gx - lastX) * TURN, (e.gy - lastY) * TURN, 0);   // no time: the object stops with the hand, a precise tool
  else if (p !== null) p.drag(e.gx - lastX, e.gy - lastY, bh, 0);
  lastX = e.gx; lastY = e.gy;
  ui.repaint();
}
function up(e: ui.PointerEvent): void {
  if (!pressed) return;
  pressed = false;
  const q = grabbed, dragged = moved;
  grabbed = null; moved = false;
  ui.repaint();
  if (q !== null) {   // a point: a click selected it, a drag moves it to what is under the pointer
    if (!dragged) return;
    const to = under(e.gx, e.gy);
    if (to.length === 3) { movePoint(q, to); log(q, e.gx, e.gy); }
    return;
  }
  if (dragged) return;   // the object was turned
  const at = under(e.gx, e.gy);
  if (at.length !== 3) {
    if (selectedPoint() !== null) pickPoint(null); else setStatus(t(L.MISSED));
    return;
  }
  const v = currentView(), made = addPoint(at, v[0], v[1], v[2]);
  if (made !== null) log(made, e.gx, e.gy);
}
function wheel(e: ui.PointerEvent): void {
  const o = object, p = pano, k = Math.pow(1.1, e.wheel) * e.pinch;
  if (o !== null) o.closer(k);
  if (p !== null) p.zoom(k);
  ui.repaint();
}

function draw(x: i32, y: i32, w: i32, h: i32): void {
  bx = x; by = y; bw = w; bh = h;
  const m = pointing(), o = object, p = pano;
  if (m === null) return;
  rect(x, y, w, h, project().theme.background);
  if (o !== null) {
    o.x = w / 2; o.y = h / 2; o.w = w; o.h = h;   // its box is the view, at one pixel a unit
    if (o.light !== m.light) o.setLight(m.light);
    o.render(x, y, 1);
  } else if (p !== null) p.draw(x, y, w, h);
  else return;
  const chosen = selectedPoint();
  for (let i = 0; i < m.points.length; i++) {
    const q = m.points[i], seen = where(q), r = q === chosen ? 13 : 11;
    if (!seen) {   // on the far side: a faint ring where it will come back
      if (o !== null) border(mx - 7, my - 7, 14, 14, 7, 1.5, INK, 90);
      continue;
    }
    const label = `${i + 1}`;
    rrect(mx - r, my - r, 2 * r, 2 * r, r, q === chosen ? ACCENT : DARK, q === chosen ? 255 : 215);
    border(mx - r, my - r, 2 * r, 2 * r, r, 2, q === chosen ? 0xfde68a : INK, 255);
    drawText(NUMBER, mx - textWidth(NUMBER, label, 0) / 2, my - lineHeight(NUMBER) / 2, label, q === chosen ? DARK : INK, 255, 0);
  }
}

/** Once per frame (main.tsx): the view of the medium being pointed exists, and its glide goes on. */
export function pointsTick(dt: number): void {
  const m = pointing(), o = object, p = pano;
  if (m === null) { if (shownKey.length > 0) forget(); return; }
  show(m);
  if (o !== null) { o.step(dt, pressed); if (o.moving()) ui.repaint(); }
  if (p !== null) { p.step(dt, pressed); if (p.moving()) ui.repaint(); }
}

export function PointsEditor(): i32 {
  // the view is drawn by hand: repaint when what it shows changes
  createEffect(() => { project(); pointing(); selectedPoint(); failed(); ui.repaint(); });
  const kind = (): i32 => Math.max(0, kindIndex(pointing()));
  const title = (): string => { const m = pointing(); return m === null ? '' : project().say(m.title, lang()); };
  return <view class="grow basis-0 min-w-0 flex-col">
    <view class="flex-row items-center gap-2 h-11 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
      <Tool icon="chevron-left" label={t(L.BACK_TO_TABLE)} look="plain" off={() => false} onClick={closePoints} />
      <view class="w-px h-5 mx-1 bg-zinc-800" />
      <Ico name={KIND_ICON[kind()]} size={15} color={KIND_COLOUR[kind()]} />
      <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 560 }}>{title()}</text>
    </view>
    <view class="grow basis-0 min-h-0 relative overflow-hidden bg-zinc-950 cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel}
      onDoubleClick={(e: ui.PointerEvent) => {}}>
      <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={draw} />
      <Show when={failed().length > 0}>
        <view class="absolute inset-0 items-center justify-center"><text class="text-sm text-center text-orange-300" style={{ width: 420 }}>{f(L.CANNOT_SHOW, failed())}</text></view>
      </Show>
      <view class="absolute left-[8] bottom-[8] px-2 py-1 rounded bg-zinc-950"><text class="text-[11px] text-zinc-500">{t(kind() === 2 ? L.POINTS_HINT_PANORAMA : L.POINTS_HINT_MODEL)}</text></view>
      <view class="absolute right-[10] top-[10] flex-row items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800" onPointerDown={(e: ui.PointerEvent) => {}}>
        <Tool icon="rotate-ccw" label={t(L.RESET_VIEW)} look="quiet" off={() => false} onClick={resetView} />
      </view>
    </view>
  </view>;
}
