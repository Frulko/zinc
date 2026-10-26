// The reader's state and its actions, called by the buttons, the page view's gestures and the test script: the library, the open
// document (its source, tree and paged layout), page turns, the table of contents, links, task boxes, ink and the Notion sync.
import { createSignal } from 'zinc:ui/solid';
import { refreshDisplay } from 'zinc:gfx';
import { Ink, parseStrokes } from 'zinc:ink';
import { sha256, toHex } from 'zinc:web';
import * as md from 'zinc:markdown';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as storage from 'zinc:storage';
import * as net from 'zinc:net';
import { Conf } from './conf';
import { Layout, Hit, layout, slug, remotePictures, cachedPicture } from './layout';
import { Notion, pageId } from './notion';
import { DOCS_DIR, DATA_DIR, FONT_SIZES, DEFAULT_FONT, REQUEST_TIMEOUT_MS } from './constants';

export const SCREEN_LIBRARY: i32 = 0;
export const SCREEN_READ: i32 = 1;
export const SCREEN_TOC: i32 = 2;
export const SCREEN_SETTINGS: i32 = 3;

const conf = new Conf(DATA_DIR + '/read.conf');
export const onTablet: boolean = sys.platform() === 'rmpp';

export const [screen, setScreen] = createSignal<i32>(SCREEN_LIBRARY);
export const [status, setStatus] = createSignal<string>('');
export const [busy, setBusy] = createSignal<boolean>(false);
export const [pageLabel, setPageLabel] = createSignal<string>('');
export const [library, setLibrary] = createSignal<string[]>([]);
export const [docTitle, setDocTitle] = createSignal<string>('');
export const [fontIndex, setFontIndex] = createSignal<i32>(storedInt('read.font', DEFAULT_FONT));
export const [penMode, setPenMode] = createSignal<boolean>(false);   // desktop: the mouse writes instead of turning pages
export const [version, setVersion] = createSignal<i32>(0);          // bumps when the page view must redraw from a new layout

/** The open document and what the page view draws. */
export class Doc {
  path: string = '';
  src: string = '';
  tree: md.Node = new md.Node(md.DOC);
  lay: Layout = new Layout();
  page: i32 = 0;
  w: i32 = 0; h: i32 = 0;   // the page view's size: the pages' size
}
export const doc = new Doc();
export const ink = new Ink();
ink.width = 4;
let inkFile = '', savedVersion: i32 = 0;
const history: string[] = [];   // path#page of the documents left by a link

function storedInt(key: string, fallback: i32): i32 { const v = parseInt(storage.get(key)); return isNaN(v) ? fallback : v as i32; }
export function say(message: string): void { setStatus(message); console.log('read: ' + message); }

// ---------------------------------------------------------------- the library
/** The .md files of the library folder and of its sub-folders (notion/...), sorted, as paths relative to it. */
export function scanLibrary(): void {
  const out: string[] = [];
  const walk = (dir: string, rel: string, depth: i32): void => {
    if (!fs.exists(dir)) return;
    for (const e of fs.readDir(dir)) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory && depth < 2) walk(dir + '/' + e.name, rel + e.name + '/', depth + 1);
      else if (e.isFile && e.name.toLowerCase().endsWith('.md')) out.push(rel + e.name);
    }
  };
  try { walk(DOCS_DIR, '', 0); } catch (e) { say('Cannot read the library ' + DOCS_DIR + ': ' + e.message); }
  setLibrary(out);
  if (out.length === 0) say('No .md file in ' + DOCS_DIR + ' yet: copy some there, or import a Notion page in Settings.');
}

// ---------------------------------------------------------------- the document
function dirOf(p: string): string { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); }
/** `rel` against the folder `dir`, with '.' and '..' resolved. */
function resolve(dir: string, rel: string): string {
  const parts = (rel.startsWith('/') ? rel : dir + '/' + rel).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '.' || (p === '' && out.length > 0)) continue;
    if (p === '..' && out.length > 0 && out[out.length - 1] !== '') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function relayout(): void {
  if (doc.w === 0 || doc.path === '') return;
  doc.lay = layout(doc.tree, doc.w, doc.h, FONT_SIZES[fontIndex()], dirOf(doc.path));
  goTo(doc.page);
  loadInk();
}
function goTo(page: i32): void {
  doc.page = Math.max(0, Math.min(page, doc.lay.pages.length - 1)) as i32;
  setPageLabel((doc.page + 1).toString() + ' / ' + doc.lay.pages.length.toString());
  storage.set('read.page', doc.page.toString());
  setVersion(version() + 1);
}

/** The page view's size: the pages are laid out at it. */
export function resize(w: i32, h: i32): void {
  if (w === doc.w && h === doc.h) return;
  saveInk();
  doc.w = w; doc.h = h;
  relayout();
}

// http(s) pictures: fetched once into DATA_DIR/pictures (read offline afterwards), then the document is laid out again. A URL that failed
// is not asked again until the reader restarts. ponytail: the cache is never pruned; a few pictures per document.
const MAX_PICTURE_BYTES: i32 = 16 * 1024 * 1024;
const triedPictures: string[] = [];
export let picturesLoading: Promise<void> = Promise.resolve();
async function fetchPictures(tree: md.Node, path: string): Promise<void> {
  const want = remotePictures(tree).filter((u: string) => !fs.exists(cachedPicture(u)) && triedPictures.indexOf(u) < 0);
  if (want.length === 0) return;
  if (path !== '') say('Loading ' + want.length.toString() + ' picture' + (want.length === 1 ? '' : 's') + '…');
  fs.mkdir(DATA_DIR + '/pictures', true);
  let got: i32 = 0;
  for (const u of want) {
    triedPictures.push(u);
    try {
      const r = await net.fetch(u, { timeoutMs: REQUEST_TIMEOUT_MS });
      if (!r.ok) { console.log('read: picture ' + u + ': ' + r.status.toString()); continue; }
      const b = await r.bytes();
      if (b.length === 0 || b.length > MAX_PICTURE_BYTES) continue;
      const p = cachedPicture(u);
      fs.writeBytes(p + '.part', b);
      fs.rename(p + '.part', p);
      got++;
    } catch (e) { console.log('read: picture ' + u + ': ' + e.message); }
  }
  if (path !== '' && doc.path === path) {
    if (got > 0) relayout();
    say(got === want.length ? 'Pictures loaded.' : got.toString() + ' of ' + want.length.toString() + ' pictures loaded (no network?).');
  }
}

/** Opens a document of the library (a path relative to it, or absolute) at `page`. */
export function openDoc(path: string, page: i32 = 0, remember: boolean = false): boolean {
  const full = path.startsWith('/') ? path : DOCS_DIR + '/' + path;
  if (!fs.exists(full)) { say('No such document: ' + path); return false; }
  saveInk();
  if (remember && doc.path !== '') history.push(doc.path + '#' + doc.page.toString());
  try { doc.src = fs.readText(full); } catch (e) { say('Cannot read ' + path + ': ' + e.message); return false; }
  doc.path = full;
  doc.tree = md.parse(doc.src);
  doc.page = page;
  const name = full.startsWith(DOCS_DIR + '/') ? full.slice(DOCS_DIR.length + 1) : full;
  setDocTitle(name);
  storage.set('read.doc', full);
  setScreen(SCREEN_READ);
  relayout();
  say(name + ' · ' + doc.lay.pages.length.toString() + ' pages · ' + doc.lay.headings.length.toString() + ' headings');
  picturesLoading = fetchPictures(doc.tree, doc.path);
  return true;
}

export function turn(dir: i32): void {
  if (doc.path === '') return;
  const before = doc.page;
  saveInk();
  goTo(doc.page + dir);
  if (doc.page === before) say(dir > 0 ? 'Last page.' : 'First page.');
}
export function jump(page: i32): void { if (doc.path !== '') { saveInk(); goTo(page); setScreen(SCREEN_READ); } }

export function setFont(delta: i32): void {
  const i = Math.max(0, Math.min(FONT_SIZES.length - 1, fontIndex() + delta)) as i32;
  if (i === fontIndex()) return;
  saveInk();
  // keep the reader near the same place: the same fraction of the document
  const frac = doc.lay.pages.length > 1 ? doc.page / doc.lay.pages.length : 0;
  setFontIndex(i);
  storage.set('read.font', i.toString());
  if (doc.path === '') return;
  doc.lay = layout(doc.tree, doc.w, doc.h, FONT_SIZES[i], dirOf(doc.path));
  goTo(Math.floor(frac * doc.lay.pages.length) as i32);
  loadInk();
  say('Text ' + FONT_SIZES[i].toString() + ' px · ' + doc.lay.pages.length.toString() + ' pages');
}

/** Back to the document a link was followed from. */
export function back(): void {
  if (history.length === 0) { say('Nothing to go back to.'); return; }
  const h = history.pop();
  const k = h.lastIndexOf('#');
  openDoc(h.slice(0, k), parseInt(h.slice(k + 1)) as i32);
}

// ---------------------------------------------------------------- taps: links and task boxes
/** The tap target under (x, y) of the page view, or null. */
export function hitAt(x: number, y: number): Hit | null {
  for (const t of doc.lay.hits) if (t.page === doc.page && x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return t;
  return null;
}
export function tapAt(x: number, y: number): void {
  const t = hitAt(x, y);
  if (t === null) return;
  const hit = t as Hit;
  if (hit.task >= 0) toggleTask(hit); else follow(hit.href);
}

/** A link: '#heading' jumps in the document, another .md (relative to this one) opens; web links cannot be opened here. */
export function follow(href: string): void {
  console.log('read: link ' + href);
  if (href.indexOf('://') > 0 || href.startsWith('mailto:')) { say('A web link (' + href + '): open it on a computer, or in Zinc Web.'); return; }
  const k = href.indexOf('#');
  const file = k < 0 ? href : href.slice(0, k), frag = k < 0 ? '' : slug(decodeURIComponent(href.slice(k + 1)));
  if (file !== '') {
    const target = resolve(dirOf(doc.path), decodeURIComponent(file));
    if (!target.toLowerCase().endsWith('.md')) { say('Only Markdown documents open here: ' + file); return; }
    if (!openDoc(target, 0, true)) return;
  }
  if (frag !== '') {
    for (const h of doc.lay.headings) if (h.slug === frag) { jump(h.page); say('§ ' + h.text); return; }
    say('No heading #' + frag + ' in this document.');
  }
}

/** Ticks or unticks a task: '[x]' or '[ ]' in the file itself, then the page is laid out again. */
export function toggleTask(t: Hit): void {
  const src = md.setTask(doc.src, t.task, !t.done);
  if (src === doc.src) { say('That task is not in the file any more.'); return; }
  try {
    fs.writeText(doc.path + '.tmp', src);
    fs.rename(doc.path + '.tmp', doc.path);
  } catch (e) { say('Cannot save the task: ' + e.message); return; }
  doc.src = src;
  doc.tree = md.parse(src);
  const page = doc.page;
  doc.lay = layout(doc.tree, doc.w, doc.h, FONT_SIZES[fontIndex()], dirOf(doc.path));
  goTo(page);
  say(t.done ? 'Task reopened (saved).' : 'Task done (saved).');
}

// ---------------------------------------------------------------- ink: per document and text size, in document pixels (page k is k * h down)
function inkPath(): string { return DATA_DIR + '/ink/' + toHex(sha256(sys.utf8Encode(doc.path + '@' + FONT_SIZES[fontIndex()].toString()))).slice(0, 32); }
function loadInk(): void {
  inkFile = inkPath();
  let strokes = parseStrokes('');
  if (fs.exists(inkFile + '.json')) { try { strokes = parseStrokes(fs.readText(inkFile + '.json')); } catch (e) { strokes = parseStrokes(''); } }
  ink.setStrokes(strokes);
  savedVersion = ink.version;
}
/** Writes the document's ink when it changed. */
export function saveInk(): boolean {
  if (doc.path === '' || inkFile === '' || ink.version === savedVersion) return true;
  try {
    fs.mkdir(DATA_DIR + '/ink', true);
    ink.w = doc.w; ink.h = doc.h * doc.lay.pages.length;
    fs.writeText(inkFile + '.json', ink.toJSON());
    fs.writeText(inkFile + '.txt', doc.path + '\n' + FONT_SIZES[fontIndex()].toString() + ' px\n');
    savedVersion = ink.version;
    say('Ink saved (' + ink.strokes.length.toString() + ' strokes).');
    return true;
  } catch (e) { say('Cannot save the ink: ' + e.message); return false; }
}

// ---------------------------------------------------------------- Notion
export const notionToken = (): string => conf.get('token');
export const notionPage = (): string => conf.get('page');
export function saveNotion(token: string, page: string): boolean {
  if (page.trim() !== '' && pageId(page) === '') { say('That is not a Notion page link or id (32 hex digits).'); return false; }
  conf.set('token', token.trim()); conf.set('page', page.trim());
  const id = pageId(page);
  const ids = conf.get('pages').split(' ').filter((s: string) => s !== '');
  if (id !== '' && ids.indexOf(id) < 0) ids.push(id);
  conf.set('pages', ids.join(' '));
  try { conf.save(); } catch (e) { say('Cannot save the settings: ' + e.message); return false; }
  say('Notion settings saved.');
  return true;
}

/** Imports every Notion page of the settings again, as notion/<title>-<id>.md in the library: read offline afterwards. */
export async function syncNotion(): Promise<void> {
  if (busy()) return;
  const ids = conf.get('pages').split(' ').filter((s: string) => s !== '');
  if (conf.get('token') === '' || ids.length === 0) { say('Set the integration token and a page in Settings first.'); return; }
  setBusy(true);
  const api = new Notion(conf.get('token'));
  let done: i32 = 0;
  let last = '';
  try {
    const dir = DOCS_DIR + '/notion';
    fs.mkdir(dir, true);
    for (const id of ids) {
      say('Syncing ' + id + '…');
      const r = await api.page(id);
      const short = id.split('-').join('').slice(0, 8);
      for (const e of fs.readDir(dir)) if (e.name.endsWith('-' + short + '.md')) fs.remove(dir + '/' + e.name);   // a renamed page
      const name = (slug(r[0]) !== '' ? slug(r[0]) : 'page') + '-' + short + '.md';
      fs.writeText(dir + '/' + name + '.tmp', r[1]);
      fs.rename(dir + '/' + name + '.tmp', dir + '/' + name);
      await fetchPictures(md.parse(r[1]), '');   // now: Notion's file URLs expire after an hour
      last = 'notion/' + name;
      done++;
    }
    scanLibrary();
    say('Notion: ' + done.toString() + ' page' + (done === 1 ? '' : 's') + ' saved (' + api.requests.toString() + ' requests), last ' + last + '.');
  } catch (e) { say(e.message); }
  setBusy(false);
}

export function refresh(): void { if (!refreshDisplay()) say('This display has no full refresh.'); }

/** The state of the last run (zinc:storage): the document and its page. */
export function restore(): void {
  scanLibrary();
  const last = storage.get('read.doc');
  if (last !== '' && fs.exists(last)) openDoc(last, storedInt('read.page', 0));
}
