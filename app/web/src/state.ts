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
export const SCREEN_TABS: i32 = 3;

export const conf = new Conf(WEB_DIR + '/web.conf');
export const relay = new Relay();
relay.url = conf.get('relay') !== '' ? conf.get('relay') : DEFAULT_RELAY;
relay.token = conf.get('token');
relay.mode = conf.get('mode') === 'color' ? 'color' : 'grey';
relay.style = conf.get('style') === 'page' ? 'page' : 'eink';
relay.reader = conf.get('reader') === 'on';
export const [reader, setReader] = createSignal<boolean>(relay.reader);
// page sizes, as device pixels per CSS pixel: 2 is 100 %, the tablet's own; 1.1 fits a desktop layout on the screen
const SCALES: number[] = [1.1, 1.33, 1.6, 2, 2.5, 3];
relay.dpr = SCALES.indexOf(parseFloat(conf.get('scale'))) >= 0 ? parseFloat(conf.get('scale')) : 2;
export const [scale, setScale] = createSignal<number>(relay.dpr);
export const [full, setFull] = createSignal<boolean>(conf.get('full') === 'on');   // full screen: the page under the top bar alone
relay.contrast = contrastValue(conf.get('contrast')).toString();

export const [screen, setScreen] = createSignal<i32>(conf.get('relay') === '' ? SCREEN_SETTINGS : SCREEN_PAGE);
export const [address, setAddress] = createSignal<string>(conf.get('last') !== '' ? conf.get('last') : HOME_PAGE);
export const [status, setStatus] = createSignal<string>(conf.get('relay') === '' ? 'Set the relay address, and its token unless it runs with --no-token.' : '');
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
  shot: i32 = 0;                                // bumps with each picture (the ink's baked layer is drawn again)
}
export const view = new View();
export const ink = new Ink();
ink.width = 4;
let inkFile = '';

// ---------------------------------------------------------------- tabs: each keeps its page, where it was read and its way back
export class Tab { url: string = ''; title: string = ''; oy: number = 0; history: string[] = []; }
const TABS_FILE = WEB_DIR + '/tabs.txt';   // one tab per line: oy \t url \t title
function readTabs(): Tab[] {
  const list: Tab[] = [];
  if (fs.exists(TABS_FILE)) for (const line of fs.readText(TABS_FILE).split('\n')) {
    const f = line.split('\t');
    if (f.length < 2 || f[1] === '') continue;
    const t = new Tab(); t.oy = parseFloat(f[0]); t.url = f[1]; t.title = f.length > 2 ? f[2] : '';
    list.push(t);
  }
  if (list.length === 0) { const t = new Tab(); t.url = conf.get('last') !== '' ? conf.get('last') : HOME_PAGE; list.push(t); }
  return list;
}
let tabs: Tab[] = readTabs();
let current: i32 = Math.max(0, Math.min(tabs.length - 1, parseInt(conf.get('tab') !== '' ? conf.get('tab') : '0'))) as i32;
export const [tabList, setTabList] = createSignal<Tab[]>(tabs);
export const [tabIndex, setTabIndex] = createSignal<i32>(current);
function saveTabs(): void {
  try {
    fs.mkdir(WEB_DIR, true);
    fs.writeText(TABS_FILE, tabs.map((t: Tab) => t.oy.toString() + '\t' + t.url + '\t' + t.title.split('\t').join(' ').split('\n').join(' ')).join('\n') + '\n');
  } catch (e) { console.log('web: cannot save the tabs: ' + e.message); }
  conf.set('tab', current.toString());
  setTabList(tabs.slice(0)); setTabIndex(current);
}

export function say(message: string): void { setStatus(message); console.log('web: ' + message); }
export function saveConf(): void {
  conf.set('relay', relay.url); conf.set('token', relay.token); conf.set('mode', relay.mode); conf.set('contrast', relay.contrast); conf.set('style', relay.style); conf.set('reader', relay.reader ? 'on' : 'off'); conf.set('scale', relay.dpr.toString()); conf.set('full', full() ? 'on' : 'off');
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

// The next screen's picture, asked while the current one is read: a page turn then waits for nothing.
// ponytail: one slot (the screen below), not the one above; add it if going back is common.
let aheadKey = '';
let ahead: Promise<u8[]> | null = null;
function shotKey(u: string, x: number, y: number, w: number, h: number, z: number): string {
  return u + ' ' + x.toString() + ' ' + y.toString() + ' ' + w.toString() + ' ' + h.toString() + ' ' + z.toString();
}

/** Fetches the picture of what the view shows now, then asks for the next screen's. */
async function fetchShot(): Promise<void> {
  const d = view.doc;
  if (d === null) return;
  const u = (d as Doc).url, x = view.ox, y = view.oy, w = view.w / view.zoom, h = view.h / view.zoom, z = view.zoom;
  const t0 = Date.now();
  const p = ahead;
  const hit = p !== null && aheadKey === shotKey(u, x, y, w, h, z);
  aheadKey = ''; ahead = null;
  let bytes: u8[] = [];
  if (hit) { try { bytes = await (p as Promise<u8[]>); } catch (e) { bytes = []; } }
  if (bytes.length === 0) bytes = await relay.shot(u, x, y, w, h, z);
  if (y + h <= lastTop()) { aheadKey = shotKey(u, x, y + h, w, h, z); ahead = relay.shot(u, x, y + h, w, h, z); }
  const t1 = Date.now();
  const img = imageFromBytes(bytes);
  console.log('web: picture ' + (t1 - t0).toString() + (hit ? ' ms (asked ahead), decode ' : ' ms, decode ') + (Date.now() - t1).toString() + ' ms, ' + bytes.length.toString() + ' bytes');
  if (img < 0) throw new Error('The relay sent a picture that is not a PNG.');
  if (view.img >= 0) destroyImage(view.img);
  view.img = img; view.ix = x; view.iy = y; view.iw = w; view.ih = h; view.shot++;
}

/** The page view's size: the relay renders at it. A new size renders the page again. */
export function resize(w: i32, h: i32): void {
  if (w === view.w && h === view.h) return;
  view.w = w; view.h = h;
  relay.w = w; relay.h = h;
  rerender();
}

/** The page again, at the same place (a new size or setting). */
function rerender(): void {
  const d = view.doc;
  if (d !== null) openUrl((d as Doc).url, false, view.oy);
}

function normalize(u: string): string {
  const t = u.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.indexOf(' ') >= 0 || t.indexOf('.') < 0) return 'https://duckduckgo.com/html/?q=' + encodeURIComponent(t);
  return 'https://' + t;
}

/** Opens a page: the relay loads it at the view's size, then the first page's picture; its ink is loaded. */
export async function openUrl(u: string, remember: boolean = true, top: number = 0): Promise<void> {
  if (u === BLANK) { showBlank(remember); return; }
  if (view.w === 0) { say('The page view has no size yet.'); return; }
  const target = normalize(u);
  await run(async (): Promise<string> => {
    saveInk();
    const t0 = Date.now();
    const d = await relay.render(target);
    console.log('web: relay loaded the page in ' + (Date.now() - t0).toString() + ' ms');
    const prev = view.doc;
    if (remember && prev !== null && (prev as Doc).url !== d.url) tabs[current].history.push((prev as Doc).url);
    view.doc = d; view.ox = 0; view.oy = top; view.zoom = 1;
    clampView();
    tabs[current].url = d.url; tabs[current].title = d.title; tabs[current].oy = view.oy;
    await fetchShot();
    loadInk(d.url);
    setAddress(d.url);
    conf.set('last', d.url); saveTabs(); saveConf();
    setScreen(SCREEN_PAGE);
    return (d.title !== '' ? d.title : d.url) + ' · ' + d.links.length.toString() + ' links';
  });
}

/** about:blank: a white page in the current tab, no relay request; its tab line is `about:blank` and is not fetched on restore either. */
export const BLANK = 'about:blank';
export function showBlank(remember: boolean = true): void {
  const prev = view.doc;
  saveInk();
  if (remember && prev !== null) tabs[current].history.push((prev as Doc).url);
  if (view.img >= 0) { destroyImage(view.img); view.img = -1; }
  view.doc = null; view.ox = 0; view.oy = 0; view.zoom = 1; view.shot++;
  aheadKey = ''; ahead = null;
  inkFile = ''; ink.setStrokes(parseStrokes('')); savedVersion = ink.version;
  clampView();
  tabs[current].url = BLANK; tabs[current].title = ''; tabs[current].oy = 0;
  setAddress(''); saveTabs(); setScreen(SCREEN_PAGE);
  say('Blank page');
}
/** The first page: the home page in the current tab. */
export async function goHome(): Promise<void> { await openUrl(HOME_PAGE); }

export async function back(): Promise<void> {
  const h = tabs[current].history;
  if (h.length === 0) { say('No page to go back to.'); return; }
  const u = h.pop();
  await openUrl(u, false);
}

/** Next or previous screenful: a whole page turn at zoom 1, one zoomed screen down or up otherwise. */
export async function turn(dir: i32): Promise<void> {
  if (view.doc === null) return;
  const before = view.oy;
  view.oy += dir * step();
  clampView();
  if (view.oy === before) { say(dir > 0 ? 'Last page.' : 'First page.'); return; }
  await run(async (): Promise<string> => { await fetchShot(); tabs[current].oy = view.oy; saveTabs(); conf.save(); return ''; });
}

/** Back to the first screenful of the page (its top, zoom kept). */
export async function firstPage(): Promise<void> {
  if (view.doc === null) return;
  if (view.oy === 0) { say('First page.'); return; }
  view.oy = 0;
  clampView();
  await run(async (): Promise<string> => { await fetchShot(); tabs[current].oy = view.oy; saveTabs(); conf.save(); return ''; });
}

/** The view zoomed by `f` around (cx, cy) of the view, then moved by (dx, dy) view pixels (ZoomView's onView); zoom 1 goes back to whole
 *  pages. Resolves once the relay's picture of it is here. */
export async function setView(f: number, cx: number, cy: number, dx: number, dy: number): Promise<void> {
  if (view.doc === null) return;
  const nz = Math.max(1, Math.min(MAX_ZOOM, view.zoom * f));
  const px = view.ox + cx / view.zoom, py = view.oy + cy / view.zoom;
  view.zoom = nz;
  if (nz === 1) { view.ox = 0; view.oy = Math.floor(py / view.h) * view.h; }
  else { view.ox = px - (cx + dx) / nz; view.oy = py - (cy + dy) / nz; }
  clampView();
  await run(async (): Promise<string> => { await fetchShot(); return ''; });
}
/** Zoom to `z` keeping the page point under (cx, cy) of the view in place. */
export async function zoomTo(z: number, cx: number, cy: number): Promise<void> { await setView(z / view.zoom, cx, cy, 0, 0); }

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
/** Reading mode on or off (the article alone, as Firefox's Reader View): the page is rendered again. */
export function toggleReader(): void {
  relay.reader = !relay.reader; setReader(relay.reader);
  saveConf();
  rerender();
}
/** The relay's e-ink stylesheet on or off: the page is rendered again. */
export function setEinkStyle(on: boolean): void {
  relay.style = on ? 'eink' : 'page';
  saveConf();
  rerender();
}
/** A page sent from the Mac opens in a new tab, the page being read stays in its own (polled every few seconds, not while it works). */
export async function checkInbox(): Promise<void> {
  if (busy() || conf.get('relay') === '') return;
  let u = '';
  const d = view.doc;
  try { u = await relay.inbox(d === null ? '' : (d as Doc).url); } catch (e) { return; }
  if (u !== '') { say('Received ' + u + ' from the relay.'); await newTab(u); }
}

/** The page in a new tab, or the tab that already shows it. */
export async function newTab(u: string): Promise<void> {
  const target = normalize(u);
  for (let i: i32 = 0; i < tabs.length; i++) if (tabs[i].url === target) { await switchTab(i); return; }
  if (view.doc !== null) { tabs[current].oy = view.oy; saveInk(); }
  const t = new Tab(); t.url = target;
  tabs.push(t); current = tabs.length - 1;
  saveTabs();
  await openUrl(target, false);
}
export async function switchTab(i: i32): Promise<void> {
  if (i < 0 || i >= tabs.length) return;
  if (view.doc !== null) tabs[current].oy = view.oy;
  current = i;
  saveTabs();
  await openUrl(tabs[i].url, false, tabs[i].oy);
}
export async function closeTab(i: i32): Promise<void> {
  if (i < 0 || i >= tabs.length) return;
  const shown = i === current;
  tabs.splice(i, 1);
  if (tabs.length === 0) { const t = new Tab(); t.url = HOME_PAGE; tabs.push(t); }
  if (i < current || current >= tabs.length) current = Math.max(0, current - 1) as i32;
  saveTabs();
  if (shown) await openUrl(tabs[current].url, false, tabs[current].oy);
}
/** Every tab closed, their histories with them: one tab on the home page. */
export async function closeAllTabs(): Promise<void> {
  if (view.doc !== null) saveInk();
  const t = new Tab(); t.url = HOME_PAGE;
  tabs.splice(0, tabs.length); tabs.push(t); current = 0;
  saveTabs();
  await openUrl(HOME_PAGE, false);
}
/** The tab to open at start. */
export function currentTab(): Tab { return tabs[current]; }
/** The page drawn smaller (dir -1: more of it per screen) or larger; rendered again. */
// ponytail: ink is kept in page pixels of the size it was drawn at; it moves if the page size changes
export function pageSize(dir: i32): void {
  const i = SCALES.indexOf(relay.dpr) + dir;
  if (i < 0 || i >= SCALES.length) { say(dir < 0 ? 'Smallest page size.' : 'Largest page size.'); return; }
  relay.dpr = SCALES[i]; setScale(relay.dpr);
  saveConf();
  say('Page size ' + Math.round(relay.dpr * 50).toString() + ' %.');
  rerender();
}
export function setFullScreen(on: boolean): void { setFull(on); saveConf(); }
/** The contrast factor of a saved setting: 1 the page as it is, up to 4; the names of older versions (normal, high, max) read as 1, 1.6, 3. */
export function contrastValue(c: string): number {
  const f = c === 'high' ? 1.6 : c === 'max' ? 3 : parseFloat(c);
  return f > 1 ? Math.min(4, Math.round(f * 10) / 10) : 1;
}
let contrastTimer = 0;
/** The slider: saved at once, the page rendered again once the thumb has rested 600 ms (one render, not one per step: e-paper). */
export function setContrast(f: number): void {
  relay.contrast = contrastValue(f.toString()).toString();
  saveConf();
  if (contrastTimer !== 0) clearTimeout(contrastTimer);
  contrastTimer = setTimeout(() => { contrastTimer = 0; rerender(); }, 600);
}
export function setColour(on: boolean): void {
  relay.mode = on ? 'color' : 'grey';
  saveConf();
  rerender();
}
export function refresh(): void { if (!refreshDisplay()) say('This display has no full refresh.'); }
