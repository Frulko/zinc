// Docs panel: a zinc:webview (WKWebView, macOS) showing assets/docs.html from the studio's embedded assets. The
// page renders Markdown itself and talks to the studio through the Tauri-like bridge:
//   await zinc.invoke('listDocs')          -> ["apps/studio/README.md", "docs/studio.md", ...]
//   await zinc.invoke('readDoc', path)     -> Markdown text (only paths from listDocs)
//   await zinc.invoke('listExamples')      -> ["hello-flow", ...] (apps/studio/samples/*.zproj)
//   await zinc.invoke('openExample', name) -> opens that sample project in the studio
// The web view is created on first use and hidden while another tab or a dialog is shown (it is a native view
// above the software-rendered UI).
import * as webview from 'zinc:webview';
import * as fs from 'zinc:fs';
import { join } from './project';
import { zincRoot } from './runner';

let web: webview.WebView | null = null;
let openCb: ((dir: string) => void) | null = null;

/** Markdown files offered by the Docs panel (relative to the zinc checkout). */
function docList(): string[] {
  const root = zincRoot();
  const out: string[] = [];
  for (const f of ['apps/studio/README.md', 'docs/studio.md', 'README.md', 'docs/ui.md', 'docs/plugins/process.md', 'docs/plugins/remote.md', 'docs/plugins/webview.md', 'docs/plugins/lottie.md'])
    if (fs.exists(join(root, f))) out.push(f);
  return out;
}
export function sampleDir(name: string): string { return join(zincRoot(), `apps/studio/samples/${name}.zproj`); }
function samples(): string[] {
  const out: string[] = [];
  try { for (const f of fs.list(join(zincRoot(), 'apps/studio/samples'))) if (f.endsWith('.zproj')) out.push(f.slice(0, f.length - 6)); } catch (e) { /* none */ }
  return out;
}

/** Called with a project folder when the page asks to open an example. */
export function onOpenExample(cb: (dir: string) => void): void { openCb = cb; }

function create(): webview.WebView {
  const w = webview.create({ url: 'zinc://docs.html', html: '', x: 0, y: 0, w: 1, h: 1 });
  // the allowlist: the page can only call these commands, with arguments checked against our own lists
  w.handle('listDocs', (_a: string) => JSON.stringify(docList()));
  w.handle('readDoc', (path: string) => {
    if (docList().indexOf(path) < 0) throw new Error(`not a doc: ${path}`);
    return JSON.stringify(fs.readText(join(zincRoot(), path)));
  });
  w.handle('listExamples', (_a: string) => JSON.stringify(samples()));
  w.handle('openExample', (name: string) => {
    if (samples().indexOf(name) < 0) throw new Error(`no example ${name}`);
    const cb = openCb;
    if (cb !== null) cb(sampleDir(name));
    return JSON.stringify(`opened ${name}`);
  });
  web = w;
  return w;
}
/** onDraw callback of the Docs tab canvas: keeps the web view on that node. */
export function follow(x: i32, y: i32, w: i32, h: i32): void {
  const v = web !== null ? web as webview.WebView : create();
  v.setBounds(x, y, w, h);
}
export function show(): void { const v = web; if (v !== null) v.show(); }
export function hide(): void { const v = web; if (v !== null) v.hide(); }
