// Zinc Inspector (ZN-373.01): inspects running Zinc programs over the Chrome DevTools protocol, as a Zinc app. The programs that listen on the
// given ports (zinc:devtools: 9229, zinc debug --cdp: 9222), the Elements tree of the one attached, the selected node's computed style and box
// (highlighted in the program), and its console. Usage: zinc run app/inspector/main.tsx -- [port...]
// ZINC_INSPECTOR_DUMP=1: attach to the first program, select the first node with a padding class, wait a second and print what each view
// shows, then quit (tests/t1/inspector.sh).
import { createSignal, render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { Target, Cdp, Row, discover, rows, styleLines, consoleLine } from './model';

const args = sys.args();
const ports: i32[] = [];
for (const a of args) ports.push(parseInt(a));
if (ports.length === 0) { ports.push(9229); ports.push(9222); }

const [targets, setTargets] = createSignal<Target[]>([]);
const [attached, setAttached] = createSignal<string>('');
const [tree, setTree] = createSignal<Row[]>([]);
const [selected, setSelected] = createSignal<i32>(-1);
const [styles, setStyles] = createSignal<string[]>([]);
const [box, setBox] = createSignal<string>('');
const [logs, setLogs] = createSignal<string[]>([]);
const [status, setStatus] = createSignal<string>('');

let cdp: Cdp | null = null;
let reloading = false;

async function refresh(): Promise<void> {
  setStatus('looking on ports ' + ports.join(', ') + '…');
  const found = await discover(ports);
  setTargets(found);
  setStatus(found.length + (found.length === 1 ? ' program' : ' programs'));
}

async function loadDocument(): Promise<void> {
  if (cdp === null) return;
  const d = await (cdp as Cdp).call('DOM.getDocument', '{"depth":-1}');
  setTree(rows(d.root, 0, []));
}

function onEvent(method: string, params: any): void {
  if (method === 'Runtime.consoleAPICalled') {
    const l = logs().slice(logs().length > 199 ? logs().length - 199 : 0);
    l.push(consoleLine(params));
    setLogs(l);
  } else if (method.startsWith('DOM.') && !reloading) {   // the tree changed: read it again (a small tree; a later version can apply the mutations)
    reloading = true;
    setTimeout(() => { reloading = false; loadDocument(); }, 300);
  }
}

async function attach(t: Target): Promise<void> {
  if (cdp !== null) (cdp as Cdp).close();
  const c = new Cdp(t.ws);
  cdp = c;
  c.onEvent = onEvent;
  c.onClose = () => { setStatus('detached from ' + t.title); };
  setStatus('attaching to ' + t.title + '…');
  await c.open;
  setAttached(t.title + ' (port ' + t.port + ')');
  setLogs([]);
  await c.call('Runtime.enable', '{}');
  await loadDocument();
  setStatus('attached');
}

async function select(id: i32): Promise<void> {
  if (cdp === null) return;
  const c = cdp as Cdp;
  setSelected(id);
  c.call('Overlay.highlightNode', `{"nodeId":${id},"highlightConfig":{}}`);
  setStyles(styleLines(await c.call('CSS.getComputedStyleForNode', `{"nodeId":${id}}`)));
  const b = await c.call('DOM.getBoxModel', `{"nodeId":${id}}`);
  if (b.model !== undefined) { const w: number = b.model.width; const h: number = b.model.height; setBox(w + ' × ' + h); } else setBox('');
}

// ---- the views
function Btn(p: { label: string; onClick: () => void }): i32 {
  return <Button class="flex-row items-center justify-center h-7 px-3 rounded-md bg-slate-900" onClick={p.onClick}>
    <Text class="text-xs font-medium text-white">{p.label}</Text>
  </Button>;
}

function TargetRow(p: { t: Target }): i32 {
  return <View class="flex-col gap-1 p-2 rounded-md bg-white border">
    <Text class="text-sm font-medium text-slate-900">{p.t.title}</Text>
    <Text class="text-xs text-slate-500">{p.t.type + ' on port ' + p.t.port}</Text>
    <Btn label="Attach" onClick={() => { attach(p.t); }} />
  </View>;
}

function TreeRow(p: { r: Row }): i32 {
  return <Button class={'flex-row items-center justify-start h-6 rounded ' + (selected() === p.r.nodeId ? 'bg-sky-100' : 'bg-white')} style={{ paddingLeft: 8 + p.r.depth * 14 }} onClick={() => { select(p.r.nodeId); }}>
    <Text class={'text-xs font-mono ' + (p.r.label.startsWith('<') ? 'text-purple-800' : 'text-slate-700')}>{p.r.label}</Text>
  </Button>;
}

function App(): i32 {
  return <View class="flex-col w-full h-full bg-white">
    <View class="flex-row flex-1">
      <View class="flex-col w-60 gap-2 p-2 bg-slate-100 border-r">
        <Text class="text-lg font-bold text-slate-900">Zinc Inspector</Text>
        <Btn label="Find programs" onClick={() => { refresh(); }} />
        <ScrollView class="flex-1">
          <View class="flex-col gap-2">{targets().map((t: Target) => <TargetRow t={t} />)}</View>
        </ScrollView>
        <Text class="text-xs text-slate-500">{status()}</Text>
      </View>
      <View class="flex-col flex-1">
        <Text class="px-2 py-1 text-xs font-medium text-slate-600 border-b">{attached() === '' ? 'Elements' : 'Elements of ' + attached()}</Text>
        <ScrollView class="flex-1">
          <View class="flex-col">{tree().map((r: Row) => <TreeRow r={r} />)}</View>
        </ScrollView>
      </View>
      <View class="flex-col w-72 border-l">
        <Text class="px-2 py-1 text-xs font-medium text-slate-600 border-b">{box() === '' ? 'Computed' : 'Computed · ' + box()}</Text>
        <ScrollView class="flex-1">
          <View class="flex-col p-2">{styles().map((s: string) => <Text class="text-xs font-mono text-slate-800">{s}</Text>)}</View>
        </ScrollView>
      </View>
    </View>
    <View class="flex-col h-40 border-t bg-slate-50">
      <Text class="px-2 py-1 text-xs font-medium text-slate-600">Console</Text>
      <ScrollView class="flex-1">
        <View class="flex-col px-2">{logs().map((l: string) => <Text class={'text-xs font-mono ' + (l.startsWith('error') ? 'text-red-700' : 'text-slate-800')}>{l}</Text>)}</View>
      </ScrollView>
    </View>
  </View>;
}

async function dump(): Promise<void> {   // ZINC_INSPECTOR_DUMP: the views as text, for scripted tests
  await refresh();
  const ts = targets();
  console.log('programs: ' + ts.length);
  for (const t of ts) console.log('program: ' + t.title + ' (' + t.type + ')');
  if (ts.length === 0) { quit(); return; }
  await attach(ts[0]);
  for (const r of tree()) if (r.label.indexOf('"p-') >= 0 || r.label.indexOf(' p-') >= 0) { await select(r.nodeId); break; }   // a padding class
  await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 1200); });
  console.log('elements:');
  for (const r of tree()) console.log('  '.repeat(r.depth + 1) + r.label);
  console.log('selected: ' + selected() + ' ' + box());
  for (const s of styles()) console.log('  ' + s);
  console.log('console:');
  for (const l of logs()) console.log('  ' + l);
  quit();
}

render(App, 0xffffff, (dt: number) => {});
if (sys.env('ZINC_INSPECTOR_DUMP') !== '') dump(); else refresh();
