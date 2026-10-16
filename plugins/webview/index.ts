// zinc:webview — web content inside the app window, Tauri-like (docs/plugins/webview.md).
// A WebView is a native web view (WKWebView on macOS and iOS, android.webkit.WebView on Android) over the surface, placed in
// logical pixels, best by a zinc:ui <NativeView view={web} /> (box, clip, hidden under overlays). The page talks
// to the program through `window.zinc`: postMessage(x) -> onMessage, and `await zinc.invoke(cmd, args)` -> the
// handler registered with handle(cmd, ...) (commands that are not registered reject: the allowlist). `zinc://app/<path>`
// serves the project's assets (disk in dev through ZINC_ASSETS, embedded in the executable in release).
import * as assets from 'zinc:assets';
import { width } from 'zinc:gfx';
import W from './native/webview.spec';

export interface WebViewOptions {
  /** Page to open: `zinc://app/index.html` (project assets), https://... or file://... */
  url: string;
  /** Inline HTML instead of `url` (relative links resolve against zinc://app/). */
  html: string;
  x: number; y: number; w: number; h: number;
}

const views: WebView[] = [];
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  W.onEvent((v: i32, kind: i32, id: i32, a: string, b: string) => {
    for (const w of views) if (w.id === v) w.dispatch(kind, id, a, b);
  });
}

/** `zinc://index.html` -> `zinc://app/index.html` (a host keeps relative links inside the asset root). */
function normalize(url: string): string {
  if (!url.startsWith('zinc://') || url.startsWith('zinc://app/')) return url;
  const name = url.substring(7);
  if (!assets.exists(name)) console.warn(`webview: asset not found: ${name}`);
  return 'zinc://app/' + name;
}

function messageOf(e: Error): string { return e.message; }

export class WebView {
  readonly id: i32;
  private msgCbs: ((data: string) => void)[] = [];
  private loadCbs: ((url: string) => void)[] = [];
  private cmds: Map<string, (args: string) => string> = new Map<string, (args: string) => string>();
  private bx: number = -1; private by: number = -1; private bw: number = -1; private bh: number = -1;
  private wanted: boolean = true; private placed: boolean = true; private visible: boolean = true;   // show()/hide(), what zinc:ui says, what the view has

  constructor(o: WebViewOptions) {
    width();   // Next creates the window on its first graphics call, before the native view attaches.
    listen();
    this.id = W.create(o.x, o.y, o.w, o.h);
    this.bx = o.x; this.by = o.y; this.bw = o.w; this.bh = o.h;
    views.push(this);
    if (o.html.length > 0) W.loadHtml(this.id, o.html, 'zinc://app/');
    else if (o.url.length > 0) W.navigate(this.id, normalize(o.url));
  }

  /** Position and size in logical pixels (the zinc:ui / gfx coordinate space). */
  setBounds(x: number, y: number, w: number, h: number): void {
    if (x === this.bx && y === this.by && w === this.bw && h === this.bh) return;
    this.bx = x; this.by = y; this.bw = w; this.bh = h;
    W.setBounds(this.id, x, y, w, h);
  }
  /** zinc:ui's NativeView host (`<NativeView view={web} className="grow" />`): the node's box, the clip of its scroll areas, and whether it
   *  shows (not under a menu or a dialog, not hidden or scrolled away), told when they change. */
  place(x: number, y: number, w: number, h: number, cx: number, cy: number, cw: number, ch: number, shown: boolean): void {
    if (shown) {
      this.bx = x; this.by = y; this.bw = w; this.bh = h;
      W.place(this.id, x, y, w, h, cx, cy, cw, ch);
    }
    this.placed = shown;
    this.apply();
  }
  /** An onDraw callback for a zinc:ui `<Canvas>`: the view follows the layout node every frame (no clip; NativeView replaces it). */
  follow(): (x: i32, y: i32, w: i32, h: i32) => void {
    return (x: i32, y: i32, w: i32, h: i32) => { this.setBounds(x, y, w, h); };
  }
  show(): void { this.wanted = true; this.apply(); }
  hide(): void { this.wanted = false; this.apply(); }
  private apply(): void {
    const on = this.wanted && this.placed;
    if (on === this.visible) return;
    this.visible = on;
    W.setVisible(this.id, on);
  }
  navigate(url: string): void { W.navigate(this.id, normalize(url)); }
  loadHtml(html: string): void { W.loadHtml(this.id, html, 'zinc://app/'); }
  /** Runs JavaScript in the page (fire and forget; use invoke/postMessage for results). */
  eval(js: string): void { W.eval(this.id, js); }
  /** Sends data to the page: `zinc.onmessage = (data) => ...` or `addEventListener('zinc', e => e.data)`.
   *  JSON text arrives parsed. */
  postMessage(data: string): void { W.post(this.id, data); }
  /** Strings posted by the page with `window.zinc.postMessage(x)` (objects arrive as JSON text). */
  onMessage(cb: (data: string) => void): void { this.msgCbs.push(cb); }
  /** Page finished loading. */
  onLoad(cb: (url: string) => void): void { this.loadCbs.push(cb); }
  /** Registers command `cmd` for `await zinc.invoke(cmd, args)` in the page. args is a string (objects are sent as
   *  JSON text); the returned string resolves the page's promise (parsed when it is JSON); a throw rejects it. */
  handle(cmd: string, fn: (args: string) => string): void { this.cmds.set(cmd, fn); }
  close(): void {
    W.close(this.id);
    const i = views.indexOf(this);
    if (i >= 0) views.splice(i, 1);
  }

  dispatch(kind: i32, id: i32, a: string, b: string): void {
    if (kind === 0) { for (const f of this.msgCbs) f(a); return; }
    if (kind === 2) { for (const f of this.loadCbs) f(a); return; }
    const fn = this.cmds.get(a);
    if (fn === undefined) { W.reply(this.id, id, false, `unknown command: ${a}`); return; }
    try { W.reply(this.id, id, true, fn(b)); } catch (e) { W.reply(this.id, id, false, messageOf(e)); }
  }
}

export function create(o: WebViewOptions): WebView { return new WebView(o); }
