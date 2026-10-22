// Hybrid app: a native zinc:ui sidebar next to a web panel (assets/index.html, served as zinc://app/...) — both ways:
// the page calls Zinc commands (`await zinc.invoke('listFiles')`, 'readFile' over zinc:fs), Zinc pushes live data
// and sidebar clicks into the page (postMessage). The web panel is a <NativeView>: a real web view (WKWebView on macOS and
// iOS, android.webkit.WebView on Android) at the node's box. On a phone the page scrolls: the web panel moves with it and
// the bar at the top cuts it off.
//   zinc run examples/webview/hybrid -- <dir>     (browses <dir>, default: the current directory; a phone browses the app's assets)
import { createSignal, render, For, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { NativeView } from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as webview from 'zinc:webview';

const PHONE = ui.platformStyle() !== 'desktop';
const DIR = sys.args().length > 0 ? sys.args()[0] : PHONE && sys.env('ZINC_ASSETS') !== '' ? sys.env('ZINC_ASSETS') : '.';
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
// that is not registered (it must be rejected). HYBRID_SCROLL=<px>: then the phone layout scrolls by that much.
function demo(): void {
  const by = parseFloat(sys.env('HYBRID_SCROLL'));
  if (by > 0 && page.node >= 0) setTimeout(() => { ui.scrollTo(page.node, 0, by); console.log(`hybrid: scrolled ${by}`); }, 500);
  if (sys.env('HYBRID_DEMO') === '' || files().length === 0) return;
  open(files()[0]);
  web.eval(`document.getElementById('bad').click()`);
}

function open(name: string): void {
  setSelected(name);
  web.postMessage(`{"type":"open","name":${JSON.stringify(name)}}`);
}

function Sidebar(): i32 {
  return <View className="flex-col w-64 p-3 gap-2 bg-slate-900">
    <Text className="text-xs text-slate-500 tracking-wider">NATIVE (zinc:ui)</Text>
    <Button className="px-2 py-1 h-9 rounded bg-sky-700 active:bg-sky-500" onClick={() => { pings++; web.postMessage(`{"type":"ping","n":${pings}}`); }}>
      <Text className="text-sm">Ping the page</Text>
    </Button>
    <View className="flex-row gap-2">
      <Button className="px-2 py-1 grow h-9 rounded bg-slate-700 active:bg-slate-500" onClick={() => { web.navigate('zinc://index.html'); }}><Text className="text-sm">Reload</Text></Button>
      <Button className="px-2 py-1 grow h-9 rounded bg-slate-700 active:bg-slate-500" onClick={() => { if (visible()) web.hide(); else web.show(); setVisible(!visible()); }}>
        <Text className="text-sm">{visible() ? 'Hide web' : 'Show web'}</Text>
      </Button>
    </View>
    <Text className="text-xs text-slate-500 tracking-wider">FILES IN {DIR}</Text>
    <For each={files()}>{(f: string, _i: i32) =>
      <Button className={f === selected() ? 'py-1 h-7 px-2 rounded bg-amber-600 items-start' : 'py-1 h-7 px-2 rounded bg-slate-800 active:bg-slate-600 items-start'} onClick={() => { open(f); }}>
        <Text className="text-sm">{f}</Text>
      </Button>}
    </For>
    <View className="grow"></View>
    <Text className="text-xs text-emerald-400">{status()}</Text>
  </View>;
}

function Desktop(): i32 {
  return <View className="flex-row h-full bg-slate-950">
    <Sidebar />
    <NativeView className="grow" view={web} />
  </View>;
}

// A phone (or HYBRID_PHONE=1): one scrolling column under a fixed bar; the web panel scrolls with the page and is clipped by the bar.
const page = createNodeRef();
function Phone(): i32 {
  return <View className="flex-col h-full bg-slate-950">
    <View className="flex-row items-center gap-2 px-3 pb-2 pt-[env(safe-area-inset-top)] bg-slate-900">
      <Text className="grow text-sm text-slate-300">Zinc + web</Text>
      <Button className="py-1 h-9 px-3 rounded bg-sky-700 active:bg-sky-500" onClick={() => { pings++; web.postMessage(`{"type":"ping","n":${pings}}`); }}>
        <Text className="text-sm">Ping the page</Text>
      </Button>
    </View>
    <ScrollView ref={page} className="grow">
      <View className="flex-col gap-1 p-3">
        <Text className="text-xs text-slate-500 tracking-wider">NATIVE (zinc:ui)</Text>
        <Text className="text-sm text-slate-300">The panel below is a real web view laid over the Zinc page. Scroll: it moves with the page and the bar cuts it off.</Text>
        <Text className="text-xs text-emerald-400">{status()}</Text>
      </View>
      <NativeView className="h-[420px] mx-3" view={web} />
      <View className="flex-col gap-2 p-3">
        <Text className="text-xs text-slate-500 tracking-wider">FILES</Text>
        <For each={files()}>{(f: string, _i: i32) =>
          <Button className={f === selected() ? 'py-1 h-9 px-2 rounded bg-amber-600 items-start' : 'py-1 h-9 px-2 rounded bg-slate-800 active:bg-slate-600 items-start'} onClick={() => { open(f); }}>
            <Text className="text-sm">{f}</Text>
          </Button>}
        </For>
        <View className="h-[480px]"></View>
      </View>
    </ScrollView>
  </View>;
}

const App = PHONE || sys.env('HYBRID_PHONE') !== '' ? Phone : Desktop;

// live data pushed into the page twice a second
let acc = 0, frames = 0;
const t0 = sys.clock();
render(App, 0x020617, (dt: number) => {
  acc += dt; frames++;
  if (acc < 0.5) return;
  web.postMessage(`{"type":"tick","uptime":${((sys.clock() - t0) / 1000).toFixed(1)},"fps":${(frames / acc).toFixed(0)},"selected":${JSON.stringify(selected())}}`);
  acc = 0; frames = 0;
});
