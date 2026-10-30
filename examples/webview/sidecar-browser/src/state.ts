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

/** Starts the tablet's process (this program again, its screen the tablet over display-sidecar) on the page the window shows. */
export function startStream(host: string): void {
  if (tablet !== null) return;
  const exe = sys.execPath();
  // ponytail: under `zinc run --interp` the executable is zinc itself, which runs the project again; a built app is the program
  const args: string[] = exe.endsWith('/zinc') ? ['run', sys.cwd()] : [];
  // ZINC_HEADLESS=0: a scripted run of the window (SIDECAR_BROWSER_DEMO) is headless, the tablet's side never is
  const p = proc.spawn(exe, args, { env: [`${ROLE_ENV}=${ROLE_SCREEN}`, 'ZINC_DISPLAY=sidecar', `ZINC_SIDECAR=${host}`, 'ZINC_BACKGROUND=1', 'ZINC_HEADLESS=0'] });
  tablet = p;
  setStreaming(true); setConnected(false); setStatus(`Connecting to ${host}...`);
  web.hide();
  p.onStdout((line: string) => {
    if (line === 'ready') { p.write('go ' + urlOf(typed() === '' ? START_URL : typed()) + '\n'); onReady(); }
    else if (line.startsWith('load ')) { setTabletUrl(line.substring(5)); setTyped(line.substring(5)); }
  });
  p.onStderr((line: string) => {
    if (!line.startsWith('display-sidecar: ')) return;
    setStatus(line.substring(17));
    if (line.indexOf(' pixels, ') > 0) setConnected(true);   // "adb, 1280x800 pixels, the app at 640x400 points": the tablet answered
    // no screen: the driver gave up and the process would show the page in a window of its own on the Mac
    if (line.indexOf('no Sidecar screen') > 0 || line.indexOf('not a colour Sidecar screen') > 0) p.kill(15);
  });
  p.onExit((code: i32) => {
    tablet = null;
    setStreaming(false); setConnected(false);
    if (code !== 0 && code !== 143) setStatus(`The tablet's side stopped (code ${code}). ${status()}`);
    else if (code === 143) setStatus(`${status()} Open the Sidecar app on the tablet, then stream again.`);
    web.show();
  });
}
export function stopStream(): void { if (tablet !== null) tablet.closeStdin(); }
