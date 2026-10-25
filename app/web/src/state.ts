// The reader's state and its actions, called by the buttons, the page view's gestures and the test script. The page view shows the
// part (ox, oy, viewW / zoom, viewH / zoom) of the page, in page pixels; at zoom 1 that is one whole page of the tablet, k * viewH down.
import { createSignal } from 'zinc:ui/solid';
import { imageFromBytes, destroyImage, refreshDisplay } from 'zinc:gfx';
import { Ink, parseStrokes } from 'zinc:ink';
import { sha256, toHex } from 'zinc:web';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Conf } from './conf';
import { Relay, Doc, Link } from './relay';
import { WEB_DIR, DEFAULT_RELAY, HOME_PAGE, MAX_ZOOM } from './constants';

export const SCREEN_PAGE: i32 = 0;
export const SCREEN_BOOKMARKS: i32 = 1;
export const SCREEN_SETTINGS: i32 = 2;

export const conf = new Conf(WEB_DIR + '/web.conf');
export const relay = new Relay();
relay.url = conf.get('relay') !== '' ? conf.get('relay') : DEFAULT_RELAY;
relay.token = conf.get('token');
relay.mode = conf.get('mode') === 'color' ? 'color' : 'grey';

export const [screen, setScreen] = createSignal<i32>(relay.token === '' ? SCREEN_SETTINGS : SCREEN_PAGE);
export const [address, setAddress] = createSignal<string>(conf.get('last') !== '' ? conf.get('last') : HOME_PAGE);
export const [status, setStatus] = createSignal<string>(relay.token === '' ? 'Set the relay address and its token (relay.token on the Mac).' : '');
export const [busy, setBusy] = createSignal<boolean>(false);
export const [pageLabel, setPageLabel] = createSignal<string>('');
export const [penMode, setPenMode] = createSignal<boolean>(false);   // desktop: the mouse writes instead of turning pages
export const [bookmarks, setBookmarks] = createSignal<string[]>(readBookmarks());
export const onTablet: boolean = sys.platform() === 'rmpp';

/** What the page view draws: the page, the picture of one part of it, and the ink in page pixels. */
export class View {
  doc: Doc | null = null;
  ox: number = 0; oy: number = 0; zoom: number = 1;
  w: i32 = 0; h: i32 = 0;                       // the page view's size, the relay's viewport
  img: i32 = -1;                                // the last picture and the page rectangle it shows
  ix: number = 0; iy: number = 0; iw: number = 0; ih: number = 0;
}
export const view = new View();
export const ink = new Ink();
ink.width = 4;
let history: string[] = [];
let inkFile = '';

export function say(message: string): void { setStatus(message); console.log('web: ' + message); }
export function saveConf(): void {
  conf.set('relay', relay.url); conf.set('token', relay.token); conf.set('mode', relay.mode);
  conf.save();
}

/** Runs one action with the busy flag; its error becomes the status line. */
async function run(action: () => Promise<string>): Promise<void> {
  if (busy()) return;
  setBusy(true);
  try { const m = await action(); if (m !== '') say(m); }
  catch (e) { say(e.message); }
  setBusy(false);
}

// ---------------------------------------------------------------- pages
function step(): number { return view.h / view.zoom; }
function lastTop(): number {
  const d = view.doc;
  if (d === null) return 0;
  const s = step();
  return Math.max(0, Math.floor(((d as Doc).height - 1) / s) * s);
}
function clampView(): void {
  const d = view.doc;
  const wMax = d === null ? 0 : Math.max(0, (d as Doc).width - view.w / view.zoom);
  view.ox = Math.max(0, Math.min(view.ox, wMax));
  view.oy = Math.max(0, Math.min(view.oy, lastTop()));
  const d2 = view.doc;
  if (d2 === null) { setPageLabel(''); return; }
  const n = Math.max(1, Math.ceil((d2 as Doc).height / view.h));
  const k = Math.min(n, Math.floor(view.oy / view.h + 0.001) + 1);
  setPageLabel((view.zoom > 1 ? Math.round(view.zoom * 100).toString() + '% · ' : '') + k.toString() + ' / ' + n.toString());
}

/** Fetches the picture of what the view shows now. */
async function fetchShot(): Promise<void> {
  const d = view.doc;
  if (d === null) return;
  const x = view.ox, y = view.oy, w = view.w / view.zoom, h = view.h / view.zoom;
  const bytes = await relay.shot((d as Doc).url, x, y, w, h, view.zoom);
  const img = imageFromBytes(bytes);
  if (img < 0) throw new Error('The relay sent a picture that is not a PNG.');
  if (view.img >= 0) destroyImage(view.img);
  view.img = img; view.ix = x; view.iy = y; view.iw = w; view.ih = h;
}

/** The page view's size: the relay renders at it. A new size renders the page again. */
export function resize(w: i32, h: i32): void {
  if (w === view.w && h === view.h) return;
  view.w = w; view.h = h;
  relay.w = w; relay.h = h;
  const d = view.doc;
  if (d !== null) openUrl((d as Doc).url, false);
}

function normalize(u: string): string {
  const t = u.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.indexOf(' ') >= 0 || t.indexOf('.') < 0) return 'https://duckduckgo.com/html/?q=' + encodeURIComponent(t);
  return 'https://' + t;
}

/** Opens a page: the relay loads it at the view's size, then the first page's picture; its ink is loaded. */
export async function openUrl(u: string, remember: boolean = true): Promise<void> {
  if (view.w === 0) { say('The page view has no size yet.'); return; }
  const target = normalize(u);
  await run(async (): Promise<string> => {
    saveInk();
    const d = await relay.render(target);
    const prev = view.doc;
    if (remember && prev !== null && (prev as Doc).url !== d.url) history.push((prev as Doc).url);
    view.doc = d; view.ox = 0; view.oy = 0; view.zoom = 1;
    clampView();
    await fetchShot();
    loadInk(d.url);
    setAddress(d.url);
    conf.set('last', d.url); saveConf();
    setScreen(SCREEN_PAGE);
    return (d.title !== '' ? d.title : d.url) + ' · ' + d.links.length.toString() + ' links';
  });
}

export async function back(): Promise<void> {
  if (history.length === 0) { say('No page to go back to.'); return; }
  const u = history.pop();
  await openUrl(u, false);
}

/** Next or previous screenful: a whole page turn at zoom 1, one zoomed screen down or up otherwise. */
export async function turn(dir: i32): Promise<void> {
  if (view.doc === null) return;
  const before = view.oy;
  view.oy += dir * step();
  clampView();
  if (view.oy === before) { say(dir > 0 ? 'Last page.' : 'First page.'); return; }
  await run(async (): Promise<string> => { await fetchShot(); return ''; });
}

/** Zoom to `z` keeping the page point under (cx, cy) of the view in place; 1 goes back to whole pages. */
export async function zoomTo(z: number, cx: number, cy: number): Promise<void> {
  if (view.doc === null) return;
  const nz = Math.max(1, Math.min(MAX_ZOOM, z));
  const px = view.ox + cx / view.zoom, py = view.oy + cy / view.zoom;
  view.zoom = nz;
  if (nz === 1) { view.ox = 0; view.oy = Math.floor(py / view.h) * view.h; }
  else { view.ox = px - cx / nz; view.oy = py - cy / nz; }
  clampView();
  await run(async (): Promise<string> => { await fetchShot(); return ''; });
}

/** A zoomed view moved by (dx, dy) pixels of the view (a finger drag). */
export async function pan(dx: number, dy: number): Promise<void> {
  if (view.doc === null) return;
  view.ox -= dx / view.zoom; view.oy -= dy / view.zoom;
  clampView();
  await run(async (): Promise<string> => { await fetchShot(); return ''; });
}

/** The link under (vx, vy) of the view, or null. A finger is wide: 16 px of slack around each link. */
export function linkAt(vx: number, vy: number): Link | null {
  const d = view.doc;
  if (d === null) return null;
  const x = view.ox + vx / view.zoom, y = view.oy + vy / view.zoom, m = 16;
  for (const l of (d as Doc).links) if (x >= l.x - m && x <= l.x + l.w + m && y >= l.y - m && y <= l.y + l.h + m) return l;
  return null;
}
/** A tap on the view: follows the link under it. */
export async function tapAt(vx: number, vy: number): Promise<void> {
  const l = linkAt(vx, vy);
  if (l !== null) await openUrl((l as Link).href);
}

// ---------------------------------------------------------------- ink, saved per URL in page pixels
function inkPath(url: string): string { return WEB_DIR + '/ink/' + toHex(sha256(sys.utf8Encode(url))).slice(0, 32); }
function loadInk(url: string): void {
  inkFile = inkPath(url);
  let strokes = parseStrokes('');
  if (fs.exists(inkFile + '.json')) { try { strokes = parseStrokes(fs.readText(inkFile + '.json')); } catch (e) { strokes = parseStrokes(''); } }
  ink.setStrokes(strokes);
  savedVersion = ink.version;
}
let savedVersion: i32 = 0;
/** Writes the page's ink when it changed. */
export function saveInk(): boolean {
  const d = view.doc;
  if (d === null || inkFile === '' || ink.version === savedVersion) return true;
  try {
    fs.mkdir(WEB_DIR + '/ink', true);
    ink.w = (d as Doc).width as i32; ink.h = (d as Doc).height as i32;
    fs.writeText(inkFile + '.json', ink.toJSON());
    fs.writeText(inkFile + '.txt', (d as Doc).url + '\n');
    savedVersion = ink.version;
    say('Ink saved (' + ink.strokes.length.toString() + ' strokes).');
    return true;
  } catch (e) { say('Cannot save the ink: ' + e.message); return false; }
}
export function undoInk(): void { ink.undo(); }

/** The whole page with the ink over it, as a PNG in exports/ (rendered by the relay). */
export async function exportPng(): Promise<void> {
  const d = view.doc;
  if (d === null) { say('Open a page first.'); return; }
  await run(async (): Promise<string> => {
    saveInk();
    ink.w = (d as Doc).width as i32; ink.h = (d as Doc).height as i32;
    const bytes = await relay.exportPage((d as Doc).url, ink.toSVG());
    fs.mkdir(WEB_DIR + '/exports', true);
    let name = (d as Doc).url.split('://')[1].split('?')[0].split('#')[0].split('/').join('_');
    if (name.length > 80) name = name.slice(0, 80);
    const path = WEB_DIR + '/exports/' + name + '-' + Date.now().toString() + '.png';
    fs.writeBytes(path, bytes);
    return 'Exported ' + path + ' (' + Math.round(bytes.length / 1024).toString() + ' KB).';
  });
}

// ---------------------------------------------------------------- bookmarks, settings, display
function readBookmarks(): string[] {
  const p = WEB_DIR + '/bookmarks.txt';
  return fs.exists(p) ? fs.readText(p).split('\n').filter((l: string) => l.trim() !== '') : [];
}
function writeBookmarks(list: string[]): void {
  fs.mkdir(WEB_DIR, true);
  fs.writeText(WEB_DIR + '/bookmarks.txt', list.join('\n') + '\n');
  setBookmarks(list);
}
export function addBookmark(): void {
  const d = view.doc;
  if (d === null) return;
  const u = (d as Doc).url;
  if (bookmarks().indexOf(u) >= 0) { say('Already in the bookmarks.'); return; }
  writeBookmarks(bookmarks().concat([u]));
  say('Bookmarked ' + u + '.');
}
export function removeBookmark(u: string): void { writeBookmarks(bookmarks().filter((b: string) => b !== u)); }

export function saveRelay(url: string, token: string): void {
  const u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) { say('The relay address starts with http://.'); return; }
  relay.url = u; relay.token = token.trim();
  saveConf();
  say('Relay set to ' + u + '.');
}
export function setColour(on: boolean): void {
  relay.mode = on ? 'color' : 'grey';
  saveConf();
  const d = view.doc;
  if (d !== null) openUrl((d as Doc).url, false);
}
export function refresh(): void { if (!refreshDisplay()) say('This display has no full refresh.'); }
