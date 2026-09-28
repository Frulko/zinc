// Hybrid app: a native zinc:ui sidebar next to a web panel (assets/index.html, served as zinc://app/...) — both ways:
// the page calls Zinc commands (`await zinc.invoke('listFiles')`, 'readFile' over zinc:fs), Zinc pushes live data
// and sidebar clicks into the page (postMessage). macOS only (zinc:webview).
//   zinc run examples/webview/hybrid -- <dir>     (browses <dir>, default: the current directory)
import { createSignal, render, For } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as webview from 'zinc:webview';

const DIR = sys.args().length > 0 ? sys.args()[0] : '.';
const EXTS: string[] = ['.md', '.ts', '.tsx', '.json', '.txt', '.html', '.css', '.js', '.mjs'];

function textFiles(): string[] {
  const out: string[] = [];
  for (const f of fs.list(DIR)) for (const e of EXTS) if (f.endsWith(e) && !f.startsWith('.')) { out.push(f); break; }
  out.sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0);
  return out;
}

const [files, setFiles] = createSignal<string[]>(textFiles());
const [selected, setSelected] = createSignal<string>('');
const [status, setStatus] = createSignal<string>('loading page...');
const [visible, setVisible] = createSignal<boolean>(true);
let pings = 0;

const web = webview.create({ url: 'zinc://index.html', html: '', x: 0, y: 0, w: 1, h: 1 });

// Commands the page may call; anything else is rejected (the allowlist).
web.handle('listFiles', (_args: string) => JSON.stringify(files()));
web.handle('readFile', (name: string) => {
  if (name.indexOf('/') >= 0 || name.startsWith('.') || files().indexOf(name) < 0) throw new Error(`not allowed: ${name}`);
  console.log(`hybrid: readFile ${name}`);
  return JSON.stringify(fs.readText(DIR + '/' + name));
});
// Plain string messages from the page: "ready:<n>", "select:<file>".
web.onMessage((m: string) => {
  if (m.startsWith('ready:')) { setStatus(`page ready, ${m.substring(6)} files listed by invoke`); console.log(`hybrid: page ready (${m.substring(6)} files)`); demo(); }
  if (m.startsWith('select:')) setSelected(m.substring(7));
});

// HYBRID_DEMO=1: scripted check — open the first file from the native side, then have the page call a command
// that is not registered (it must be rejected).
function demo(): void {
  if (sys.env('HYBRID_DEMO') === '' || files().length === 0) return;
  open(files()[0]);
  web.eval(`document.getElementById('bad').click()`);
}

function open(name: string): void {
  setSelected(name);
  web.postMessage(`{"type":"open","name":${JSON.stringify(name)}}`);
}

function Sidebar(): i32 {
  return <view class="flex-col w-64 p-3 gap-2 bg-slate-900">
    <text class="text-xs text-slate-500 tracking-wider">NATIVE (zinc:ui)</text>
    <button class="h-9 rounded bg-sky-700 active:bg-sky-500" onClick={() => { pings++; web.postMessage(`{"type":"ping","n":${pings}}`); }}>
      <text class="text-sm">Ping the page</text>
    </button>
    <view class="flex-row gap-2">
      <button class="grow h-9 rounded bg-slate-700 active:bg-slate-500" onClick={() => { web.navigate('zinc://index.html'); }}><text class="text-sm">Reload</text></button>
      <button class="grow h-9 rounded bg-slate-700 active:bg-slate-500" onClick={() => { if (visible()) web.hide(); else web.show(); setVisible(!visible()); }}>
        <text class="text-sm">{visible() ? 'Hide web' : 'Show web'}</text>
      </button>
    </view>
    <text class="text-xs text-slate-500 tracking-wider">FILES IN {DIR}</text>
    <For each={files()}>{(f: string, _i: i32) =>
      <button class={f === selected() ? 'h-7 px-2 rounded bg-amber-600 items-start' : 'h-7 px-2 rounded bg-slate-800 active:bg-slate-600 items-start'} onClick={() => { open(f); }}>
        <text class="text-sm">{f}</text>
      </button>}
    </For>
    <view class="grow"></view>
    <text class="text-xs text-emerald-400">{status()}</text>
  </view>;
}

function App(): i32 {
  return <view class="flex-row h-full bg-slate-950">
    <Sidebar />
    <canvas class="grow" onDraw={web.follow()}></canvas>
  </view>;
}

// live data pushed into the page twice a second
let acc = 0, frames = 0;
const t0 = sys.clock();
render(App, 0x020617, (dt: number) => {
  acc += dt; frames++;
  if (acc < 0.5) return;
  web.postMessage(`{"type":"tick","uptime":${((sys.clock() - t0) / 1000).toFixed(1)},"fps":${(frames / acc).toFixed(0)},"selected":${JSON.stringify(selected())}}`);
  acc = 0; frames = 0;
});
