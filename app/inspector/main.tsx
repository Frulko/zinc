// Zinc Inspector (ZN-373.01): inspects running Zinc programs over the Chrome DevTools protocol, as a Zinc app. The programs that listen on the
// given ports (zinc:devtools: 9229, zinc debug --cdp: 9222) and, attached to one, its panels, one file each: Elements (elements.tsx: the
// component tree, filters, live styling), Network (network.tsx), Storage (storage.tsx: key/values and SQLite), Sources (sources.tsx, for
// zinc debug --cdp), the Console (console.tsx), the program's screen and Performance (its frames and their phases, ZN-373.05, below).
// The apps of the paired devices are listed with the programs of this machine (ZN-729.05): `zinc device inspect --all` brings their inspectors here.
// Usage: zinc run app/inspector/main.tsx -- [port...]
// ZINC_INSPECTOR_DUMP=1: attach to the first program, go through each panel and print what it shows, then quit (tests/t1/inspector.sh);
// =elements: the Elements panel only; =storage: the Storage panel only (tests/t1/inspector_storage.sh). A debugger target gets the Sources session.
import { createSignal, render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { quit, imageFromBytes, destroyImage, imageWidth, imageHeight, drawImage, rect } from 'zinc:gfx';
import { base64Decode } from 'zinc:web';
import { spawn, Process } from 'zinc:process';
import { Target, Cdp, discover, TraceFrame, PhaseTotal, traceFrames, phaseTotals, msText, Track, traceTracks } from './model';
import { ThreadsView, watchThreads, threads, threadLine } from './threads';
import { conn, call, status, setStatus, view, setView, setDevRun, sleep, until } from './state';
import { Btn } from './widgets';
import { ElementsView, StylesPane, loadDocument, refreshRendered, renderedOnly, rows, dumpElements, select, styles, rules, box, target, setProp, label, TNode } from './elements';
import { NetworkView, onNetwork, onReload, dumpNetwork, reqs, pick, Req } from './network';
import { StorageView, loadStorage, onStorage, changes, dumpStorage, items, pickItem, tables, openTable } from './storage';
import { SourcesView, DebugPane, onDebugger, resetSources, setWaiting, setPaused, setEnded, dumpDebugger } from './sources';
import { ConsolePane, onConsole, logs, setLogs } from './console';

const args = sys.args();
const ports: i32[] = [];
for (const a of args) ports.push(parseInt(a));
if (ports.length === 0) { ports.push(9229); ports.push(9222); }

const [targets, setTargets] = createSignal<Target[]>([]);
const [attached, setAttached] = createSignal<string>('');
const [frame, setFrame] = createSignal<i32>(-1);   // the program's screen (Page.screencastFrame) as a runtime image
// the Performance view (ZN-373.05): Tracing.start / end, the runtime's frames and their phases
const [recording, setRecording] = createSignal<boolean>(false);
const [traced, setTraced] = createSignal<TraceFrame[]>([]);
const [totals, setTotals] = createSignal<PhaseTotal[]>([]);
const [frameAt, setFrameAt] = createSignal<i32>(-1);   // the frame picked in the timeline
const [traces, setTraces] = createSignal<i32>(0);   // traces received (the dump waits on it)
const [tracks, setTracks] = createSignal<Track[]>([]);   // a track per thread: the main one, each worker
let traceEvents: any[] = [];

let reloading = false;

// The apps of the paired devices: `zinc device inspect --all` forwards the inspector of each to a port of this machine and names it, one line
// "<port> <device> <app>" each, then "ready"; it ends when this program does. ZINC names the engine to run, else the zinc of PATH.
let devicePorts: i32[] = [];
let deviceApps: string[] = [];
let devices: Process | null = null;
let held: i32 = 0;   // the port of the program attached to
let devicesListed: Promise<void> = new Promise<void>((resolve) => { resolve(); });
function findDevices(): void {
  if (devices !== null) {
    if (devicePorts.indexOf(held) >= 0) return;   // ponytail: attached to a device's app, its forwarding is kept and the list not renewed
    (devices as Process).kill();
  }
  devicePorts = []; deviceApps = [];
  devicesListed = new Promise<void>((resolve) => {
    try {
      const p = spawn(sys.env('ZINC') !== '' ? sys.env('ZINC') : 'zinc', ['device', 'inspect', '--all'], {});
      devices = p;
      p.onStdout((line: string) => {
        const w = line.split(' ');
        if (w.length === 3) { devicePorts.push(parseInt(w[0])); deviceApps.push(w[2] + ' on ' + w[1]); }
        else if (line === 'ready') { resolve(); if (devicePorts.length > 0) list(); }
      });
      p.onExit((code: i32) => { resolve(); });
    } catch (e) { resolve(); }   // no zinc to run: the programs of this machine only
  });
}

async function list(): Promise<void> {
  const all = ports.concat(devicePorts);
  setStatus('looking on ports ' + all.join(', ') + '…');
  const found = await discover(all);
  for (const t of found) { const at = devicePorts.indexOf(t.port); if (at >= 0) t.title = deviceApps[at]; }
  setTargets(found);
  setStatus(found.length + (found.length === 1 ? ' program' : ' programs'));
}

async function refresh(): Promise<void> {
  findDevices();
  await list();
}

function onEvent(method: string, params: any): void {
  if (method.startsWith('Debugger.')) onDebugger(method, params);
  else if (method === 'Tracing.dataCollected') {
    for (const e of params.value) traceEvents.push(e);
  } else if (method === 'Tracing.tracingComplete') {
    const fs = traceFrames(traceEvents);
    let slow = -1;
    for (let i = 0; i < fs.length; i++) if (slow < 0 || fs[i].dur > fs[slow].dur) slow = i;
    setTraced(fs); setTotals(phaseTotals(fs)); setFrameAt(slow); setTracks(traceTracks(traceEvents)); setTraces(traces() + 1);
  } else if (method === 'Page.screencastFrame') {   // the program's screen: decoded, shown, acknowledged so the next one comes
    const id = imageFromBytes(base64Decode(params.data));
    if (id >= 0) { if (frame() >= 0) destroyImage(frame()); setFrame(id); }
    const session: number = params.sessionId;
    call('Page.screencastFrameAck', `{"sessionId":${session}}`);
  } else if (method.startsWith('Network.')) onNetwork(method, params);
  else if (method.startsWith('DOMStorage.')) onStorage(method, params);
  else if (method === 'Runtime.consoleAPICalled') onConsole(params);
  else if (method === 'Runtime.executionContextsCleared') onReload();
  else if (method.startsWith('DOM.') && !reloading) {   // the tree changed: read it again, the folds, the filters and the selection kept
    reloading = true;
    setTimeout(() => { reloading = false; loadDocument(); }, 300);
  }
}

async function attach(t: Target): Promise<void> {
  if (conn.c !== null) (conn.c as Cdp).close();
  const c = new Cdp(t.ws);
  conn.c = c;
  held = t.port;
  c.onEvent = onEvent;
  c.onClose = () => { setStatus('detached from ' + t.name()); setEnded(true); setPaused(false); };
  setStatus('attaching to ' + t.name() + '…');
  await c.open;
  setAttached(t.name() + ' (port ' + t.port + ')');
  setLogs([]);
  onReload();
  await call('Runtime.enable', '{}');
  resetSources();
  if (t.type === 'node') {   // zinc debug --cdp: the debugger; the program waits for Run
    await call('Debugger.enable', '{}');
    setWaiting(true);
    setView('sources');
    setStatus('attached: set breakpoints, then Run');
    return;
  }
  const info = await call('Zinc.getInfo', '{}');
  setDevRun(info.dev !== undefined && info.dev === true);
  await call('Network.enable', '{}');   // the requests made before the attach come too
  await loadDocument();
  await loadStorage();
  setStatus('attached');
}

// "Rendered only" follows scrolling and animation: what draws is asked again twice a second while Elements shows it.
setInterval(() => { if (conn.c !== null && view() === 'elements' && renderedOnly()) refreshRendered(false); }, 500);

async function screen(on: boolean): Promise<void> {   // the screencast: frames of the program's screen while the Screen view is open
  await call(on ? 'Page.startScreencast' : 'Page.stopScreencast', on ? '{"format":"png","maxWidth":640,"maxHeight":480}' : '{}');
}

// ---- the views
function TargetRow(p: { t: Target }): i32 {
  return <View className="flex-col gap-1 p-2 rounded-md bg-white border">
    <Text className="text-sm font-medium text-slate-900">{p.t.name()}</Text>
    <Text className="text-xs text-slate-500">{p.t.type + ' on port ' + p.t.port}</Text>
    <Btn label="Attach" onClick={() => { attach(p.t); }} />
  </View>;
}

function ScreenView(): i32 {   // the last frame, fitted into the view with its proportions
  return <Canvas className="flex-1" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xe2e8f0);
    const f = frame();
    if (f < 0) return;
    const iw = imageWidth(f), ih = imageHeight(f);
    const k = Math.min(w / Math.max(1, iw), h / Math.max(1, ih));
    drawImage(f, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k, 255, 0);
  }} />;
}

// ---- the Performance view
async function record(): Promise<void> {
  traceEvents = [];
  setRecording(true);
  await call('Tracing.start', '{"categories":"devtools.timeline"}');
}
async function stopRecording(): Promise<void> { setRecording(false); await call('Tracing.end', '{}'); }
function phaseColor(name: string): string {
  return name === 'app' ? 'bg-amber-400' : name === 'input' ? 'bg-slate-400' : name === 'anim' ? 'bg-violet-400' : name === 'layout' ? 'bg-purple-600' :
    name === 'paint' ? 'bg-emerald-500' : name === 'effects' ? 'bg-teal-400' : name === 'diff' ? 'bg-cyan-500' : name === 'raster' ? 'bg-green-700' : 'bg-slate-300';
}
function slowest(): number { let m = 1; for (const f of traced()) if (f.dur > m) m = f.dur; return m; }
function FrameRow(p: { f: TraceFrame; i: i32 }): i32 {   // a frame of the timeline: its length, then its phases to scale (the slowest frame is 400 px)
  return <Button className={'py-1 flex-row items-center justify-start h-5 px-1 ' + (frameAt() === p.i ? 'bg-sky-100' : 'bg-white')} onClick={() => { setFrameAt(p.i); }}>
    <Text className="w-20 text-xs font-mono text-slate-500">{msText(p.f.dur)}</Text>
    <View className="flex-row h-3">{p.f.durs.map((d: number, k: i32) => <View className={'h-3 ' + phaseColor(p.f.phases[k])} style={{ width: Math.max(1, Math.round(d * 400 / slowest())) }} />)}</View>
  </Button>;
}
const LANE = 400;   // px of a track's lane: the whole recording
function span(): number[] {   // the recording's first and last µs over every track
  let a = -1, b = 0;
  for (const t of tracks()) for (let i = 0; i < t.ts.length; i++) { if (a < 0 || t.ts[i] < a) a = t.ts[i]; if (t.ts[i] + t.durs[i] > b) b = t.ts[i] + t.durs[i]; }
  return [a < 0 ? 0 : a, b > a ? b - a : 1];
}
function trackText(t: Track): string {
  return msText(t.busy) + ' busy, ' + t.ts.length + ' slices' + (t.flowsOut + t.flowsIn > 0 ? ', messages ' + t.flowsOut + ' out / ' + t.flowsIn + ' in' : '');
}
function TrackRow(p: { t: Track }): i32 {   // a thread's lane: its slices to scale (frames on the main thread, handlers and messages on a worker's)
  const s = span();
  const shown: i32[] = [];
  for (let i = 0; i < p.t.ts.length && shown.length < 400; i++) if (p.t.names[i] === 'zinc frame' || p.t.tid !== 1) shown.push(i);
  return <View className="flex-row items-center gap-2 px-2 h-6">
    <Text className="w-48 text-xs text-slate-800">{p.t.name}</Text>
    <View className="h-3 bg-slate-100" style={{ width: LANE }}>
      {shown.map((i: i32) => <View className={'absolute h-3 ' + (p.t.names[i].startsWith('onmessage') || p.t.names[i] === 'zinc frame' ? 'bg-amber-400' : 'bg-sky-600')}
        style={{ left: Math.floor((p.t.ts[i] - s[0]) * LANE / s[1]), width: Math.max(1, Math.round(p.t.durs[i] * LANE / s[1])) }} />)}
    </View>
    <Text className="text-xs font-mono text-slate-600">{trackText(p.t)}</Text>
  </View>;
}
function PerformanceView(): i32 {
  return <View className="flex-col flex-1">
    <View className="flex-row items-center gap-2 p-1 border-b">
      {recording() ? <Btn label="Stop" onClick={() => { stopRecording(); }} /> : <Btn label="Record" onClick={() => { record(); }} />}
      <Text className="text-xs text-slate-500">{recording() ? 'recording…' : traced().length > 0 ? traced().length + ' frames, the slowest ' + msText(slowest()) : 'Record, use the program, then Stop'}</Text>
    </View>
    <View className="flex-col py-1 border-b">{tracks().map((t: Track) => <TrackRow t={t} />)}</View>
    <View className="flex-col gap-1 p-2 border-b">{totals().map((t: PhaseTotal) => <View className="flex-row items-center gap-2">
      <View className={'w-3 h-3 rounded ' + phaseColor(t.name)} />
      <Text className="w-16 text-xs text-slate-800">{t.name}</Text>
      <Text className="text-xs font-mono text-slate-600">{msText(t.total) + ' in ' + t.count + ' frames'}</Text>
    </View>)}</View>
    <VirtualList count={traced().length} itemHeight={20} className="flex-1">
      {(i: i32) => <FrameRow f={traced()[i]} i={i} />}
    </VirtualList>
  </View>;
}
function frameLines(): string[] {   // the picked frame, phase by phase
  const i = frameAt();
  if (i < 0 || i >= traced().length) return [];
  const f = traced()[i];
  const out: string[] = ['frame ' + (i + 1) + ': ' + msText(f.dur)];
  for (let k = 0; k < f.phases.length; k++) out.push(f.phases[k] + ': ' + msText(f.durs[k]));
  return out;
}

function Tab(p: { id: string; label: string }): i32 {
  return <Button className={'py-1 flex-row items-center h-7 px-3 rounded-md ' + (view() === p.id ? 'bg-slate-300' : 'bg-slate-50')} onClick={() => { setView(p.id); screen(p.id === 'screen'); if (p.id === 'threads') watchThreads(); }}>
    <Text className="text-xs font-medium text-slate-900">{p.label}</Text>
  </Button>;
}

function App(): i32 {
  return <View className="flex-col w-full h-full bg-white">
    <View className="flex-row flex-1">
      <View className="flex-col w-60 gap-2 p-2 bg-slate-100 border-r">
        <Text className="text-lg font-bold text-slate-900">Zinc Inspector</Text>
        <Btn label="Find programs" onClick={() => { refresh(); }} />
        <ScrollView className="flex-1">
          <View className="flex-col gap-2">{targets().map((t: Target) => <TargetRow t={t} />)}</View>
        </ScrollView>
        <Text className="text-xs text-slate-500">{status()}</Text>
      </View>
      <View className="flex-col flex-1 w-0 overflow-hidden">
        <View className="flex-row items-center gap-1 px-2 py-1 border-b">
          <Tab id="elements" label="Elements" />
          <Tab id="screen" label="Screen" />
          <Tab id="network" label="Network" />
          <Tab id="storage" label="Storage" />
          <Tab id="sources" label="Sources" />
          <Tab id="performance" label="Performance" />
          <Tab id="threads" label="Threads" />
          <Text className="flex-1 text-xs text-slate-600">{attached()}</Text>
        </View>
        {view() === 'sources' ? <SourcesView /> : view() === 'performance' ? <PerformanceView /> : view() === 'threads' ? <ThreadsView /> : view() === 'network' ? <NetworkView /> : view() === 'storage' ? <StorageView /> :
          view() === 'screen' ? <ScreenView /> : <ElementsView />}
      </View>
      {view() === 'network' || view() === 'storage' || view() === 'threads' ? <View /> : <View className="flex-col w-80 border-l">
        {view() === 'sources' ? <ScrollView className="flex-1"><DebugPane /></ScrollView> :
        view() === 'performance' ? <View className="flex-col gap-1 p-2">{frameLines().map((l: string) => <Text className="text-xs font-mono text-slate-800">{l}</Text>)}</View> : <StylesPane />}
      </View>}
    </View>
    <ConsolePane />
  </View>;
}

async function dump(): Promise<void> {   // ZINC_INSPECTOR_DUMP: the panels as text, for scripted tests
  const mode = sys.env('ZINC_INSPECTOR_DUMP');
  await refresh();
  if (targets().length === 0) { await devicesListed; await list(); }   // none here: those of the paired devices, once they are known
  const ts = targets();
  console.log('programs: ' + ts.length);
  for (const t of ts) console.log('program: ' + t.title + ' (' + t.type + ')');
  if (ts.length === 0) { quit(); return; }
  await attach(ts[0]);
  if (ts[0].type === 'node') { await dumpDebugger(); quit(); return; }
  if (mode === 'threads') {   // the Threads view, then a recording's tracks
    setView('threads');
    watchThreads();
    await until(() => threads().length > 0 && threads()[0].messagesOut > 0);
    console.log('threads:');
    for (const t of threads()) console.log('  ' + threadLine(t));
    setView('performance');
    const n = traces();
    await record();
    await sleep(1500);
    await stopRecording();
    await until(() => traces() > n);
    console.log('tracks:');
    for (const t of tracks()) {
      let handlers = 0, posts = 0;
      for (const s of t.names) { if (s.startsWith('onmessage')) handlers++; if (s.startsWith('postMessage')) posts++; }
      console.log('  ' + t.name + ': ' + (t.tid === 1 ? traced().length + ' frames' : 'worker') + ', handlers ' + (handlers > 0) + ', posts ' + (posts > 0) +
        ', flows out ' + (t.flowsOut > 0) + ', flows in ' + (t.flowsIn > 0));
    }
    quit();
    return;
  }
  if (mode === 'storage') {
    setView('storage');
    await dumpStorage(async (n: i32): Promise<void> => { await until(() => changes() > n); });
    quit();
    return;
  }
  await until(() => rows().length > 0);
  await sleep(1200);
  await dumpElements();
  if (mode === 'elements') { quit(); return; }
  let pad: TNode | null = null;   // ZN-373.02: a node with a padding class, its rules, element.style edited, the program's frame before and after
  for (const r of rows()) if (r.node.cls.startsWith('p-') || r.node.cls.indexOf(' p-') >= 0) { pad = r.node; break; }
  if (pad !== null) {
    await select((pad as TNode).id);
    console.log('selected: ' + label(pad as TNode) + ' ' + box());
    for (const s of styles()) console.log('  ' + s);
    console.log('rules:');
    for (const l of rules()) console.log('  ' + l);
    const before: string = (await call('Page.captureScreenshot', '{}')).data;
    const was = box();
    await setProp('padding-left', '40px');
    await sleep(300);
    const after: string = (await call('Page.captureScreenshot', '{}')).data;
    const m = await call('CSS.getInlineStylesForNode', `{"nodeId":${target()}}`);
    const text: string = m.inlineStyle !== undefined ? m.inlineStyle.cssText : '';
    console.log('element.style: ' + text + ' | box ' + was + ' -> ' + box() + ' | frame changed: ' + (before !== after));
    setView('screen');
    await screen(true);
    for (let k = 0; k < 40 && frame() < 0; k++) await sleep(50);
    console.log('screen: ' + (frame() >= 0 ? imageWidth(frame()) + ' x ' + imageHeight(frame()) : 'none'));
    await screen(false);
    await sleep(300);   // the patch reaches the console
  }
  console.log('console:');
  for (const l of logs()) console.log('  ' + l);
  setView('network');
  await dumpNetwork();
  console.log('performance:');   // ZN-373.05: half a second of the program's frames
  setView('performance');
  const n = traces();
  await record();
  await sleep(500);
  await stopRecording();
  await until(() => traces() > n);
  const fs = traced();
  let whole = fs.length > 0;
  for (const f of fs) if (f.phases.length === 0 || f.phases[f.phases.length - 1] !== 'present') whole = false;
  console.log('  frames recorded: ' + (fs.length >= 5) + ', each with its phases up to present: ' + whole);
  for (const t of totals()) console.log('  phase ' + t.name);
  if (frameAt() >= 0) console.log('  slowest: ' + fs[frameAt()].phases.join(' '));
  quit();
}

/** ZINC_INSPECTOR_VIEW=<panel>: attach to the first program found and open that panel (screenshots of the panels, docs). */
async function openView(v: string): Promise<void> {
  await refresh();
  if (targets().length === 0) return;
  await attach(targets()[0]);
  setView(v);
  await sleep(500);
  if (v === 'network') { for (const r of reqs()) if (!r.ws()) { await pick(r); break; } return; }   // a request picked: its details show
  if (v === 'storage') { if (items().length > 0) pickItem(items()[items().length - 1].key); if (tables().length > 0) await openTable(tables()[0], 0); return; }
  for (const r of rows()) if (r.node.comp) { await select(r.node.id); break; }   // a component selected: its props and styles show
}

render(App, 0xffffff, (dt: number) => {});
if (sys.env('ZINC_INSPECTOR_DUMP') !== '') dump(); else if (sys.env('ZINC_INSPECTOR_VIEW') !== '') openView(sys.env('ZINC_INSPECTOR_VIEW')); else refresh();
