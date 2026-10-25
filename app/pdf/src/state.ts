// The reader's state and its actions, called by the buttons, the page view's gestures and the test script. The page view shows the
// part of the page from (ox, oy), in PDF points, at scale() pixels a point: at zoom 1 the whole page fitted to the view, centred.
// The ink is kept in page points too, so it stays on the page whatever the zoom; PDFium draws the page into one runtime image.
import { createSignal } from 'zinc:ui/solid';
import { refreshDisplay } from 'zinc:gfx';
import { Ink, parseStrokes } from 'zinc:ink';
import * as pdf from 'zinc:pdf';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as storage from 'zinc:storage';
import { DOCS_DIR, MAX_ZOOM, PEN_WIDTH, ERASER_RADIUS } from './constants';

export const SCREEN_LIBRARY: i32 = 0;
export const SCREEN_READER: i32 = 1;

export const [screen, setScreen] = createSignal<i32>(SCREEN_LIBRARY);
export const [status, setStatus] = createSignal<string>('');
export const [pageLabel, setPageLabel] = createSignal<string>('');
export const [penMode, setPenMode] = createSignal<boolean>(false);   // desktop: the mouse writes instead of turning pages
export const [eraser, setEraserSignal] = createSignal<boolean>(false);
export const [files, setFiles] = createSignal<string[]>([]);
export const [docName, setDocName] = createSignal<string>('');
export const onTablet: boolean = sys.platform() === 'rmpp';

/** What the page view draws: the page of the document, its picture and the part of the page that picture shows. */
export class View {
  doc: pdf.PdfDocument | null = null;
  path: string = ''; name: string = '';
  page: i32 = 0; count: i32 = 0;
  pw: number = 0; ph: number = 0;               // the page's size in points
  zoom: number = 1; ox: number = 0; oy: number = 0;
  w: i32 = 0; h: i32 = 0;                       // the page view's size in pixels
  img: i32 = -1;                                // the picture: the view as of (iox, ioy) at iscale
  iox: number = 0; ioy: number = 0; iscale: number = 1;
}
export const view = new View();
export const ink = new Ink();
ink.width = PEN_WIDTH;
ink.eraserRadius = ERASER_RADIUS;
let savedVersion: i32 = 0;

export function say(message: string): void { setStatus(message); console.log('pdf: ' + message); }

/** Pixels a point now. */
export function scale(): number {
  if (view.pw <= 0 || view.ph <= 0 || view.w === 0) return 1;
  return Math.min(view.w / view.pw, view.h / view.ph) * view.zoom;
}

function clampAxis(o: number, page: number, visible: number): number {
  return page <= visible ? (page - visible) / 2 : Math.max(0, Math.min(o, page - visible));
}
function clampView(): void {
  const s = scale();
  view.ox = clampAxis(view.ox, view.pw, view.w / s);
  view.oy = clampAxis(view.oy, view.ph, view.h / s);
  setPageLabel(view.doc === null ? '' : (view.zoom > 1 ? Math.round(view.zoom * 100).toString() + '% · ' : '') + (view.page + 1).toString() + ' / ' + view.count.toString());
}

/** PDFium draws what the view shows now. */
function draw(): void {
  const d = view.doc;
  if (d === null || view.w === 0) return;
  const s = scale();
  try {
    view.img = (d as pdf.PdfDocument).render(view.page, s, view.ox * s, view.oy * s, view.w, view.h, view.img);
    view.iox = view.ox; view.ioy = view.oy; view.iscale = s;
  } catch (e) { say(e.message); }
}

/** The page, zoom and position of the document, for the next time it opens (zinc:storage). */
export function remember(): void {
  if (view.path === '') return;
  storage.set('pdf:pos:' + view.path, view.page.toString() + ' ' + view.zoom.toString() + ' ' + view.ox.toString() + ' ' + view.oy.toString());
}

/** The page view's size; a new one draws the page again. */
export function resize(w: i32, h: i32): void {
  if (w === view.w && h === view.h) return;
  view.w = w; view.h = h;
  clampView();
  draw();
}

// ---------------------------------------------------------------- library
export function scanLibrary(): void {
  fs.mkdir(DOCS_DIR, true);
  const list = fs.list(DOCS_DIR).filter((f: string) => f.toLowerCase().endsWith('.pdf') && !f.startsWith('.'));
  list.sort((a: string, b: string): number => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  setFiles(list);
  const why = pdf.status();
  if (why !== '') say(why);
  else if (list.length === 0) say('No PDF in ' + DOCS_DIR + ' yet: copy some there.');
  else say(list.length.toString() + (list.length === 1 ? ' document' : ' documents') + ' in ' + DOCS_DIR + '.');
}
export function showLibrary(): void {
  saveInk(); remember();
  setScreen(SCREEN_LIBRARY);
  scanLibrary();
}

// ---------------------------------------------------------------- the document
/** Opens a PDF of the library (a name) or any path, at the page and zoom it was left at. */
export function openDoc(file: string): void {
  const path = file.indexOf('/') >= 0 ? file : DOCS_DIR + '/' + file;
  closeDoc();
  let d: pdf.PdfDocument;
  try { d = pdf.open(path); } catch (e) { say('Cannot open ' + file + ': ' + e.message); return; }
  view.doc = d; view.path = path; view.name = path.slice(path.lastIndexOf('/') + 1);
  setDocName(view.name);
  view.count = d.pageCount;
  view.page = 0; view.zoom = 1; view.ox = 0; view.oy = 0;
  const pos = storage.get('pdf:pos:' + path).split(' ');
  if (pos.length === 4) {
    view.page = Math.max(0, Math.min(view.count - 1, parseInt(pos[0]))) as i32;
    view.zoom = Math.max(1, Math.min(MAX_ZOOM, parseFloat(pos[1])));
    view.ox = parseFloat(pos[2]); view.oy = parseFloat(pos[3]);
  }
  storage.set('pdf:last', path);
  setScreen(SCREEN_READER);
  showPage();
  say('Opened ' + view.name + ' · ' + view.count.toString() + ' pages · page ' + (view.page + 1).toString() + ' · ' + ink.strokes.length.toString() + ' strokes.');
}
/** The document opened last, if it is still there. */
export function reopenLast(): boolean {
  const p = storage.get('pdf:last');
  if (p === '' || !fs.exists(p)) return false;
  openDoc(p);
  return view.doc !== null;
}
function closeDoc(): void {
  const d = view.doc;
  if (d === null) return;
  saveInk(); remember();
  (d as pdf.PdfDocument).close();
  view.doc = null; view.path = '';
}

function showPage(): void {
  const d = view.doc;
  if (d === null) return;
  const size = (d as pdf.PdfDocument).pageSize(view.page);
  view.pw = size.width; view.ph = size.height;
  clampView();
  loadInk();
  draw();
  remember();
}

/** Page `p` (0-based), from its top. */
export function goTo(p: i32): void {
  if (view.doc === null) return;
  const n = Math.max(0, Math.min(view.count - 1, p)) as i32;
  if (n === view.page) { say(p > view.page ? 'Last page.' : p < view.page ? 'First page.' : 'Page ' + (n + 1).toString() + '.'); return; }
  saveInk();
  view.page = n; view.oy = 0;
  showPage();
  say('Page ' + (n + 1).toString() + ' / ' + view.count.toString() + '.');
}

/** Next or previous: a whole page at zoom 1; zoomed, one screen down the page first, then the next page. */
export function turn(dir: i32): void {
  if (view.doc === null) return;
  if (view.zoom > 1) {
    const before = view.oy;
    view.oy += dir * view.h / scale() * 0.9;
    clampView();
    if (view.oy !== before) { draw(); remember(); return; }
    if (dir < 0 && view.page > 0) { goTo(view.page - 1); view.oy = view.ph; clampView(); draw(); return; }
  }
  goTo(view.page + dir);
}

/** Zoom to `z` keeping the page point under (cx, cy) of the view in place. */
export function zoomTo(z: number, cx: number, cy: number): void {
  if (view.doc === null) return;
  const s0 = scale();
  const px = view.ox + cx / s0, py = view.oy + cy / s0;
  view.zoom = Math.max(1, Math.min(MAX_ZOOM, z));
  const s = scale();
  view.ox = px - cx / s; view.oy = py - cy / s;
  clampView();
  draw();
  remember();
}

/** A zoomed view moved by (dx, dy) pixels of the view (a finger drag). */
export function pan(dx: number, dy: number): void {
  if (view.doc === null) return;
  const s = scale();
  view.ox -= dx / s; view.oy -= dy / s;
  clampView();
  draw();
  remember();
}

// ---------------------------------------------------------------- ink, per page in points, beside the document
function inkDir(): string { return view.path + '.ink'; }
function inkFile(page: i32): string { return inkDir() + '/p' + (page + 1).toString() + '.json'; }
function loadInk(): void {
  let strokes = parseStrokes('');
  const f = inkFile(view.page);
  if (fs.exists(f)) { try { strokes = parseStrokes(fs.readText(f)); } catch (e) { strokes = parseStrokes(''); } }
  ink.setStrokes(strokes);
  savedVersion = ink.version;
}
/** Writes the page's ink when it changed (a page with none left loses its file). */
export function saveInk(): boolean {
  if (view.doc === null || ink.version === savedVersion) return true;
  try {
    const f = inkFile(view.page);
    if (ink.strokes.length === 0) { if (fs.exists(f)) fs.remove(f); }
    else {
      fs.mkdir(inkDir(), true);
      ink.w = Math.ceil(view.pw) as i32; ink.h = Math.ceil(view.ph) as i32;
      fs.writeText(f + '.tmp', ink.toJSON());
      fs.rename(f + '.tmp', f);
    }
    savedVersion = ink.version;
    say('Ink saved, page ' + (view.page + 1).toString() + ' (' + ink.strokes.length.toString() + ' strokes).');
    return true;
  } catch (e) { say('Cannot save the ink: ' + e.message); return false; }
}
export function undoInk(): void { ink.undo(); }
export function setEraser(on: boolean): void { ink.eraser = on; setEraserSignal(on); }

/** A copy of the PDF with every page's ink as ink annotations: <name>.annotated.pdf beside it, readable by any PDF viewer. */
export function exportPdf(): void {
  if (view.doc === null) { say('Open a document first.'); return; }
  saveInk();
  const out = view.path.slice(0, view.path.length - 4) + '.annotated.pdf';
  let copy: pdf.PdfDocument;
  try { copy = pdf.open(view.path); } catch (e) { say('Cannot export: ' + e.message); return; }
  let n: i32 = 0;
  try {
    for (let p: i32 = 0; p < view.count; p++) {
      const f = inkFile(p);
      if (!fs.exists(f)) continue;
      for (const s of parseStrokes(fs.readText(f))) {
        const xy: number[] = [];
        let pressure: number = 0;
        for (let i: i32 = 0; i < s.pts.length; i += 3) { xy.push(s.pts[i]); xy.push(s.pts[i + 1]); pressure += s.pts[i + 2]; }
        if (xy.length === 0) continue;
        copy.addInk(p, xy, s.color, s.width * (0.3 + 0.7 * pressure / (xy.length / 2)));
        n++;
      }
    }
    copy.save(out);
    say('Exported ' + out.slice(out.lastIndexOf('/') + 1) + ' (' + n.toString() + ' strokes), beside the document.');
  } catch (e) { say('Cannot export: ' + e.message); }
  copy.close();
}

export function refresh(): void { if (!refreshDisplay()) say('This display has no full refresh.'); }
