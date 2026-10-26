// Zinc web relay (ZN-844): renders web pages for a reMarkable (app/web), a headless Zinc program on the Mac.
//   zinc run app/web-relay -- [--port 8790] [--data web-relay-data] [--chrome <path>] [--no-token]
// The tablet cannot run a browser; the relay loads the page in headless Chrome at the tablet's width and sends pictures of it: whole
// e-ink pages (or any zoomed part) as PNG, grey by default, and the map of its links so that a tap can follow one.
//
// HTTP, every request with `Authorization: Bearer <token>` (the token is in <data>/relay.token, made on first start, mode 600):
//   GET  /render?url=&w=&h=&dpr=2&mode=grey|color&contrast=normal|high|max   loads the page with a viewport of w x h device pixels (w/dpr CSS pixels) ->
//        {"url", "title", "width", "height", "page", "links": [[x, y, w, h, href], ...]}, all in device pixels of the whole page (height capped)
//   GET  /shot?url=&w=&h=&dpr=&mode=&x=&y=&cw=&ch=&zoom=1   PNG of the page rectangle (x, y, cw, ch) at `zoom`: cw*zoom x ch*zoom pixels.
//        Page k at zoom 1 is x=0, y=k*h, cw=w, ch=h. The page is loaded again only when url, w, h, dpr or mode change, or with
//        &fresh=1 (the dashboard's timer): the same tab reloads it, bypassing the cache; Chrome keeps running between requests.
//   POST /export?url=&w=&h=&dpr=&mode=                body: an SVG of the ink in page pixels -> PNG of the whole page with the ink over it
//   GET  /health                                     "ok" (no token)
// Only http:// and https:// pages are rendered: a file:// URL would read this Mac's files.
import { serveAsync, Request, Reply } from 'zinc:net';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { base64Decode } from 'zinc:web';
import { Chrome, findChrome, sleep } from './chrome';

function opt(name: string, def: string): string {
  const a = sys.args();
  for (let i: i32 = 0; i + 1 < a.length; i++) if (a[i] === '--' + name) return a[i + 1];
  return def;
}
function form(body: string, key: string): string {
  for (const pair of body.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq) === key) return decodeURIComponent(pair.slice(eq + 1).split('+').join(' '));
  }
  return '';
}
function query(path: string, key: string): string { const q = path.indexOf('?'); return q < 0 ? '' : form(path.slice(q + 1), key); }
function reply(status: i32, body: string, contentType: string = 'text/plain; charset=utf-8'): Reply { return { status: status, body: body, contentType: contentType }; }
function same(a: string, b: string): boolean {   // in time independent of where they differ
  if (a.length !== b.length || a.length === 0) return false;
  let d: i32 = 0;
  for (let i: i32 = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function hex(bytes: u8[]): string { const d = '0123456789abcdef'; let s = ''; for (const b of bytes) s += d.charAt((b >> 4) & 15) + d.charAt(b & 15); return s; }
function num(s: string, def: number, lo: number, hi: number): number { const n = parseFloat(s); return !(n >= lo && n <= hi) ? def : n; }

const port: i32 = parseInt(opt('port', '8790'));
const data = opt('data', 'web-relay-data');
const MAX_PAGES: i32 = 40;          // a page longer than 40 screens is cut there
const LOAD_TIMEOUT_MS: i32 = 7000;   // under the 10 s the HTTP server gives a reply: a slower page is shown as it is then
const SETTLE_MS: i32 = 400;         // after the load event: late fonts and images
let token = '';     // '' with --no-token: every request is served (a test on a trusted network)
let chromePath = '';
const chrome = new Chrome();

/** What the tab shows now: a request with other values loads the page again. */
class View {
  url: string = ''; w: i32 = 0; h: i32 = 0; dpr: number = 2; mode: string = 'grey'; contrast: string = 'normal';
  key(): string { return this.url + '\n' + this.w.toString() + 'x' + this.h.toString() + '@' + this.dpr.toString() + ' ' + this.mode + ' ' + this.contrast; }
}
let shown = '';
let info = '';   // the JSON of /render for what is shown

function viewOf(path: string): View {
  const v = new View();
  v.url = query(path, 'url').trim();
  v.w = num(query(path, 'w'), 1620, 200, 4000) as i32;
  v.h = num(query(path, 'h'), 2160, 200, 4000) as i32;
  v.dpr = num(query(path, 'dpr'), 2, 1, 4);
  v.mode = query(path, 'mode') === 'color' ? 'color' : 'grey';
  const c = query(path, 'contrast');
  v.contrast = c === 'high' || c === 'max' ? c : 'normal';
  return v;
}

// One tab, one request at a time: a second waits for the first.
let busy = false;
async function exclusive(): Promise<void> { while (busy) await sleep(20); busy = true; }

async function ensureChrome(): Promise<void> {
  if (chrome.alive) return;
  console.log('relay: starting Chrome');
  await chrome.start(chromePath, data + '/chrome-profile');
}

const INFO_JS = `(() => { const d = DPR, L = [];
  for (const a of document.querySelectorAll('a[href]')) { const h = a.href; if (!/^https?:/.test(h)) continue;
    for (const r of a.getClientRects()) if (r.width > 0 && r.height > 0)
      L.push([Math.round((r.left + scrollX) * d), Math.round((r.top + scrollY) * d), Math.round(r.width * d), Math.round(r.height * d), h]); }
  const e = document.documentElement, b = document.body;
  const height = Math.min(MAXH, Math.round(Math.max(e.scrollHeight, b ? b.scrollHeight : 0, innerHeight) * d));
  return JSON.stringify({ url: location.href, title: document.title, width: Math.round(innerWidth * d), height: height, page: PAGEH, links: L.filter(l => l[1] < height) }); })()`;

// e-ink contrast: the page's greys pushed apart, thin text thickened (high, max); layout is unchanged, so the link map holds.
const CONTRAST_HIGH = 'html{filter:contrast(1.6)!important}*{-webkit-text-stroke:0.25px currentColor}';
const CONTRAST_MAX = 'html{filter:contrast(3)!important}*{-webkit-text-stroke:0.5px currentColor}';
const CONTRAST_JS = `(() => { const s = document.createElement('style'); s.textContent = 'CSS'; document.documentElement.appendChild(s); })()`;

/** Loads the page of `v` in the tab unless it is already there; returns its JSON (size and links). */
async function show(v: View, fresh: boolean = false): Promise<string> {
  if (!v.url.startsWith('http://') && !v.url.startsWith('https://')) throw new Error('only http:// and https:// pages: ' + v.url);
  if (v.key() === shown && chrome.alive && !fresh) return info;
  const again = v.key() === shown && chrome.alive;
  await ensureChrome();
  shown = '';
  await chrome.call('Emulation.setDeviceMetricsOverride', '{"width":' + Math.round(v.w / v.dpr).toString() + ',"height":' + Math.round(v.h / v.dpr).toString() +
    ',"deviceScaleFactor":' + v.dpr.toString() + ',"mobile":false}');
  // grey: what the page looks like to someone who sees no colour, which keeps the contrast of the colours (Chrome's achromatopsia)
  await chrome.call('Emulation.setEmulatedVisionDeficiency', '{"type":' + (v.mode === 'grey' ? '"achromatopsia"' : '"none"') + '}');
  const loaded = chrome.event('Page.loadEventFired', LOAD_TIMEOUT_MS);
  const nav = await chrome.call(again ? 'Page.reload' : 'Page.navigate', again ? '{"ignoreCache":true}' : '{"url":' + JSON.stringify(v.url) + '}');
  if (nav.errorText !== undefined && ('' + nav.errorText) !== '') throw new Error('cannot load ' + v.url + ': ' + ('' + nav.errorText));
  if (!(await loaded)) console.log('relay: ' + v.url + ' still loading after ' + (LOAD_TIMEOUT_MS / 1000).toString() + ' s, shown as it is');
  await sleep(SETTLE_MS);
  if (v.contrast !== 'normal') await chrome.evaluate(CONTRAST_JS.split('CSS').join(v.contrast === 'max' ? CONTRAST_MAX : CONTRAST_HIGH));
  info = await chrome.evaluate(INFO_JS.split('DPR').join(v.dpr.toString()).split('MAXH').join((v.h * MAX_PAGES).toString()).split('PAGEH').join(v.h.toString()));
  shown = v.key();
  console.log('relay: rendered ' + v.url + ' at ' + v.w.toString() + 'x' + v.h.toString());
  return info;
}

/** PNG bytes of the page rectangle (x, y, w, h) in device pixels, at `zoom`. */
async function shot(v: View, x: number, y: number, w: number, h: number, zoom: number): Promise<u8[]> {
  const d = v.dpr;
  const r = await chrome.call('Page.captureScreenshot', '{"format":"png","captureBeyondViewport":true,"clip":{"x":' + (x / d).toString() + ',"y":' + (y / d).toString() +
    ',"width":' + (w / d).toString() + ',"height":' + (h / d).toString() + ',"scale":' + zoom.toString() + '}}');
  return base64Decode('' + r.data);
}
// A reply body is a string; fs.readText keeps the bytes unchanged where utf8Decode would repair the PNG (as the hub serves a .zapp).
// ponytail: a file between the two, until Reply takes bytes.
function png(bytes: u8[]): Reply { fs.writeBytes(data + '/last.png', bytes); return reply(200, fs.readText(data + '/last.png'), 'image/png'); }

async function render(req: Request): Promise<Reply> { return reply(200, await show(viewOf(req.path)), 'application/json'); }

async function shotOf(req: Request): Promise<Reply> {
  const v = viewOf(req.path);
  await show(v, query(req.path, 'fresh') === '1');
  const zoom = num(query(req.path, 'zoom'), 1, 0.25, 8);
  const cw = num(query(req.path, 'cw'), v.w, 1, 20000), ch = num(query(req.path, 'ch'), v.h, 1, 20000);
  return png(await shot(v, num(query(req.path, 'x'), 0, 0, 1e6), num(query(req.path, 'y'), 0, 0, 1e6), cw, ch, zoom));
}

async function exportOf(req: Request): Promise<Reply> {
  const v = viewOf(req.path);
  const j = JSON.parse(await show(v));
  const w: number = j.width as number, h: number = j.height as number;
  const svg = req.body;
  if (svg.indexOf('<svg') < 0) return reply(400, 'the body is the SVG of the ink\n');
  await chrome.evaluate(`(() => { const d = document.createElement('div'); d.id = '__zinc_ink';
    d.style.cssText = 'position:absolute;left:0;top:0;width:${(w / v.dpr).toString()}px;height:${(h / v.dpr).toString()}px;pointer-events:none;z-index:2147483647';
    d.innerHTML = ${JSON.stringify(svg)}; const s = d.querySelector('svg'); const bg = s.querySelector('rect'); if (bg) bg.remove();
    s.setAttribute('preserveAspectRatio', 'xMinYMin meet'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); document.documentElement.appendChild(d); return ''; })()`);
  const bytes = await shot(v, 0, 0, w, h, 1);
  await chrome.evaluate(`(() => { const d = document.getElementById('__zinc_ink'); if (d) d.remove(); return ''; })()`);
  console.log('relay: exported ' + v.url + ' with ink');
  return png(bytes);
}

async function handle(req: Request): Promise<Reply> {
  const q = req.path.indexOf('?');
  const path = q < 0 ? req.path : req.path.slice(0, q);
  if (path === '/health') return reply(200, 'ok\n');
  const a = req.headers.get('authorization');
  if (token !== '' && !same(a.startsWith('Bearer ') ? a.slice(7).trim() : '', token)) return reply(401, 'wrong or missing token (Authorization: Bearer <relay.token>)\n');
  const isGet = req.method === 'GET';
  if (!(isGet && (path === '/render' || path === '/shot')) && !(req.method === 'POST' && path === '/export')) return reply(404, 'not found\n');
  await exclusive();
  let r: Reply;
  try {
    if (path === '/render') r = await render(req);
    else if (path === '/shot') r = await shotOf(req);
    else r = await exportOf(req);
  } catch (e) {
    console.log('relay: ' + e.message);
    shown = '';
    r = reply(502, e.message + '\n');
  }
  busy = false;   // ponytail: not in a finally, which the async lowering skips on return
  return r;
}

/** Chrome started at once, so the first page does not wait for it (a request meanwhile waits its turn). */
async function warmUp(): Promise<void> {
  await exclusive();
  try { await ensureChrome(); } catch (e) { console.log('relay: ' + e.message); }
  busy = false;
}

function main(): void {
  chromePath = findChrome(opt('chrome', ''));
  if (chromePath === '') { console.log('relay: no Chrome found: install Google Chrome or pass --chrome <path to its executable>'); sys.exit(1); }
  fs.mkdir(data, true);
  const file = data + '/relay.token';
  if (sys.args().indexOf('--no-token') < 0) {
    if (!fs.exists(file)) { fs.writeText(file, hex(sys.randomBytes(16)) + '\n'); fs.chmod(file, 0o600); }
    token = fs.readText(file).trim();
  }
  const quit = (): void => { chrome.stop(); sys.exit(0); };
  sys.onSignal('SIGINT', quit);
  sys.onSignal('SIGTERM', quit);
  serveAsync(port, handle);
  warmUp();
  console.log('relay: listening on port ' + port.toString() + ', Chrome ' + chromePath);
  console.log(token === '' ? 'relay: no token (--no-token): whoever reaches port ' + port.toString() + ' can use it' : 'relay: token ' + token);
}
main();
