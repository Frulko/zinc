// The Mac side's state: the web view of the window, the link to the tablet (a second process of this program, see screen.tsx) and what
// the tablet reports. No drawing here.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import * as webview from 'zinc:webview';
import { ROLE_ENV, ROLE_SCREEN, START_URL } from './constants';

export const web = webview.create({ url: START_URL, html: '', x: 0, y: 0, w: 1, h: 1 });

export const [typed, setTyped] = createSignal<string>('');
export const [streaming, setStreaming] = createSignal<boolean>(false);
export const [connected, setConnected] = createSignal<boolean>(false);
export const [status, setStatus] = createSignal<string>('');
export const [tabletUrl, setTabletUrl] = createSignal<string>(START_URL);
/** The window is a pad for the tablet's page: the mouse and the keys go to it. */
export const [controlling, setControlling] = createSignal<boolean>(false);
/** The tablet's screen, width over height; its driver says its pixels. */
export const [aspect, setAspect] = createSignal<number>(1.6);
export const [zoom, setZoomSignal] = createSignal<number>(1);
/** The address of a screen on the network; ZINC_SIDECAR fills it in. */
export const [screenHost, setScreenHost] = createSignal<string>(sys.env('ZINC_SIDECAR'));

const ZOOMS: number[] = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];   // Safari's steps

let tablet: proc.Process | null = null;
let onReady: () => void = () => {};
/** Runs f once the tablet's side shows its page (the scripted run of main.tsx). */
export function whenReady(f: () => void): void { onReady = f; }

web.onLoad((url: string) => { if (!streaming()) setTyped(url); });

/** What the person typed as a URL: kept when it has a scheme, https:// added to a host name, a web search for the rest. */
export function urlOf(text: string): string {
  const t = text.trim();
  if (t.indexOf('://') > 0) return t;
  if (t.indexOf(' ') < 0 && t.indexOf('.') > 0) return 'https://' + t;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(t);
}

/** Opens what was typed: on the tablet while streaming, else in the window. */
export function go(): void {
  if (typed().trim() === '') return;
  const url = urlOf(typed());
  setTyped(url);
  if (tablet !== null) tablet.write('go ' + url + '\n');
  else web.navigate(url);
}
export function open(url: string): void { setTyped(url); go(); }
export function history(order: string): void {
  if (tablet !== null) { tablet.write(order + '\n'); return; }
  web.eval(order === 'back' ? 'history.back()' : order === 'forward' ? 'history.forward()' : 'location.reload()');
}

/** The page's zoom one step in (+1) or out (-1), or back to 100 % (0): the tablet's page while streaming, else the window's. */
export function zoomStep(dir: i32): void {
  let i = ZOOMS.indexOf(zoom());
  if (i < 0) i = 4;
  const z = dir === 0 ? 1 : ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))];
  setZoomSignal(z);
  if (tablet !== null) tablet.write(`zoom ${z}\n`); else web.setZoom(z);
}

/** A key of the Mac's keyboard for the tablet's page: its KeyboardEvent.code from the key's name, what it types, the modifiers
 *  (1 shift, 2 control, 4 option, 8 command). False when nothing streams. */
export function typeOnTablet(key: string, text: string, mods: i32): boolean {
  if (tablet === null) return false;
  const c = key.length === 1 ? key.toUpperCase() : '';
  const code = c >= 'A' && c <= 'Z' ? 'Key' + c : c >= '0' && c <= '9' ? 'Digit' + c : c === ' ' ? 'Space' : key.length === 1 ? '' : key;
  tablet.write(`key ${code}\t${mods}\t${text}\n`);
  return true;
}

/** The Mac's mouse for the tablet's page, x and y from 0 to 1 over its screen; kind as WebView.pointer. */
export function pointOnTablet(kind: i32, x: number, y: number, dx: number, dy: number): void {
  if (tablet !== null) tablet.write(`ptr ${kind} ${x} ${y} ${dx} ${dy}\n`);
}

/** Starts the tablet's process (this program again, its screen the tablet over display-sidecar) on the page the window shows. */
export function startStream(host: string): void {
  if (tablet !== null) return;
  const exe = sys.execPath();
  // under `zinc run` (ZINC_LAUNCH_DIR is set) the executable is the engine, whatever its dev bundle names it, and the program starts in
  // its project: it runs that project again; a built app is the program
  const args: string[] = sys.env('ZINC_LAUNCH_DIR') !== '' ? ['run', sys.cwd()] : [];
  // ZINC_HEADLESS=0: a scripted run of the window (SIDECAR_BROWSER_DEMO) is headless, the tablet's side never is
  const p = proc.spawn(exe, args, { env: [`${ROLE_ENV}=${ROLE_SCREEN}`, 'ZINC_DISPLAY=sidecar', `ZINC_SIDECAR=${host}`, 'ZINC_BACKGROUND=1', 'ZINC_HEADLESS=0'] });
  tablet = p;
  setStreaming(true); setConnected(false); setStatus(`Connecting to ${host}...`);
  web.hide();
  p.onStdout((line: string) => {
    if (line === 'ready') {
      p.write('go ' + urlOf(typed() === '' ? START_URL : typed()) + '\n');
      if (zoom() !== 1) p.write(`zoom ${zoom()}\n`);
      onReady();
    }
    else if (line.startsWith('load ')) { setTabletUrl(line.substring(5)); setTyped(line.substring(5)); }
  });
  p.onStderr((line: string) => {
    if (!line.startsWith('display-sidecar: ')) return;
    setStatus(line.substring(17));
    const pixels = line.indexOf(' pixels, ');
    if (pixels > 0) {   // "adb, 1280x800 pixels, the app at 640x400 points": the tablet answered
      setConnected(true);
      const size = line.substring(line.lastIndexOf(' ', pixels - 1) + 1, pixels).split('x');
      if (size.length === 2 && parseInt(size[1]) > 0) setAspect(parseInt(size[0]) / parseInt(size[1]));
    }
    // no screen: the driver gave up and the process would show the page in a window of its own on the Mac
    if (line.indexOf('no Sidecar screen') > 0 || line.indexOf('not a colour Sidecar screen') > 0) p.kill(15);
  });
  p.onExit((code: i32) => {
    tablet = null;
    setStreaming(false); setConnected(false); setControlling(false);
    if (code !== 0 && code !== 143) setStatus(`The tablet's side stopped (code ${code}). ${status()}`);
    else if (code === 143) setStatus(`${status()} Open the Sidecar app on the tablet, then stream again.`);
    web.show();
  });
}
export function stopStream(): void { if (tablet !== null) tablet.closeStdin(); }
