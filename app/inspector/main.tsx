// Zinc Inspector (ZN-373.01): inspects running Zinc programs over the Chrome DevTools protocol, as a Zinc app. The programs that listen on the
// given ports (zinc:devtools: 9229, zinc debug --cdp: 9222) and, attached to one, its panels, one file each: Elements (elements.tsx: the
// component tree, filters, live styling), Network (network.tsx), Storage (storage.tsx: key/values and SQLite), Sources (sources.tsx, for
// zinc debug --cdp), the Console (console.tsx), the program's screen and Performance (its frames and their phases, ZN-373.05, below).
// The apps of the paired devices are listed with the programs of this machine (ZN-729.05): `zinc device inspect --all` brings their inspectors here.
// Usage: zinc run app/inspector/main.tsx -- [port...]
// ZINC_INSPECTOR_DUMP=1: attach to the first program, go through each panel and print what it shows, then quit (tests/t1/inspector.sh);
// =elements: the Elements panel only; =storage: the Storage panel only (tests/t1/inspector_storage.sh); =info: the Info view's card (tests/t1/inspector_info.sh). A debugger target gets the Sources session.
import { createSignal, render } from 'zinc:ui/solid';
import { PointerEvent } from 'zinc:ui';
import * as sys from 'zinc:sys';
import { quit, imageFromBytes, destroyImage, imageWidth, imageHeight, drawImage, rect, rrect, border } from 'zinc:gfx';
import { base64Decode } from 'zinc:web';
import { spawn, Process } from 'zinc:process';
import { Target, Cdp, discover, TraceFrame, PhaseTotal, traceFrames, phaseTotals, msText, Track, traceTracks } from './model';
import { ThreadsView, watchThreads, threads, threadLine } from './threads';
import { conn, call, status, setStatus, view, setView, setDevRun, sleep, until, sideW, setSideW, rightW, setRightW, consoleH, setConsoleH } from './state';
import { ResizeHandle } from 'zinc:ui/kit';
import { Btn, Flat } from './widgets';
import { ElementsView, dumpTree, scrollToNode } from './tree';
import * as ui from 'zinc:ui';
import { StylesPane } from './styles';
import { loadDocument, refreshRendered, refreshStage, renderedOnly, rows, dumpElements, select, selected, nodeOf, styles, rules, box, target, setProp, label, findNode, inlineText, TNode, Row } from './elements';
import { NetworkView, onNetwork, onReload, dumpNetwork, reqs, pick, Req } from './network';
import { StorageView, loadStorage, onStorage, changes, dumpStorage, items, pickItem, tables, openTable } from './storage';
import { SourcesView, DebugPane, onDebugger, resetSources, setWaiting, setPaused, setEnded, dumpDebugger } from './sources';
import { ConsolePane, onConsole, logs, setLogs } from './console';
import { InfoView, watchInfo, loadInfo, dumpInfo, infoLoads, setInfoDevice } from './info';
import { dumpLayout } from './layoutcheck';

const args = sys.args();
// The ports looked at: those given (`announced`: the ports the programs announce, model.ts), else 9229, 9222 and the announced ones.
const ports: i32[] = [];
let announced = args.length === 0;
for (const a of args) { if (a === 'announced') announced = true; else ports.push(parseInt(a)); }
if (args.length === 0) { ports.push(9229); ports.push(9222); }

const [targets, setTargets] = createSignal<Target[]>([]);
const [attached, setAttached] = createSignal<string>('');
const [frame, setFrame] = createSignal<i32>(-1);   // the program's screen (Page.screencastFrame) as a runtime image
// the Performance view (ZN-373.05): Tracing.start / end, the runtime's frames and their phases
const [recording, setRecording] = createSignal<boolean>(false);
const [traced, setTraced] = createSignal<TraceFrame[]>([]);
const [totals, setTotals] = createSignal<PhaseTotal[]>([]);
const [frameAt, setFrameAt] = createSignal<i32>(-1);   // the frame picked in the timeline
// The whole program paused, as a page in Chrome (Zinc.setPaused: its frames, timers, input and clock stop; Zinc.stepFrame runs one frame)
const [appPaused, setAppPaused] = createSignal<boolean>(false);
async function pauseApp(method: string, params: string): Promise<void> { const r = await call(method, params); setAppPaused(r.paused === true); }
const [traces, setTraces] = createSignal<i32>(0);   // traces received (the dump waits on it)
const [tracks, setTracks] = createSignal<Track[]>([]);   // a track per thread: the main one, each worker
let traceEvents: any[] = [];

let reloading = false;
/** The screencast's counters (ZINC_INSPECTOR_DUMP=screenfps): frames, base64 bytes, ms spent decoding, ms from the program's send to here. */
class CastStats { frames: i32 = 0; bytes: number = 0; decode: number = 0; latency: number = 0; }
const cast = new CastStats();
// The Screen view draws the highlight itself over the frames (the program leaves it out of them while it streams, as Chrome's device view):
// the node under the pointer while picking, else the node selected in Elements. Boxes are in the program's window points.
let devW = 1, devH = 1;   // the program's window (the frames' metadata)
const [picking, setPicking] = createSignal<boolean>(false);   // the inspect arrow: on the Screen view and in the program
const [hover, setHover] = createSignal<i32>(0);
const [shown, setShown] = createSignal<number[]>([]);   // margin, border and content quads of the node drawn, flattened (24 numbers)
let boxBusy = false, boxAgain = false;
async function refreshBox(): Promise<void> {
  if (boxBusy) { boxAgain = true; return; }   // asked again while a box is on its way: once more after it
  boxBusy = true;
  do {
    boxAgain = false;
    const id = picking() && hover() > 0 ? hover() : target();
    const b = id > 0 && conn.c !== null ? await call('DOM.getBoxModel', `{"nodeId":${id}}`) : JSON.parse('{}');
    const q: number[] = [];
    if (b.model !== undefined) for (const k of ['margin', 'border', 'content']) { const a: number[] = b.model[k]; for (const v of a) q.push(v); }
    if (q.join(',') !== shown().join(',')) setShown(q);
  } while (boxAgain);
  boxBusy = false;
}
/** The arrow: pick mode on or off, here (the Screen view) and in the program (Overlay.setInspectMode), as Chrome's. */
function setPick(on: boolean): void {
  setPicking(on);
  setHover(0); hoverBase = 0; hoverUp = 0; hoverNext = [];
  call('Overlay.setInspectMode', on ? '{"mode":"searchForNode","highlightConfig":{}}' : '{"mode":"none","highlightConfig":{}}');
  refreshBox();
}
// The pointer's moves over the screen are coalesced: one question on its way at a time, and the last point asked once it is answered, so
// the hover follows the pointer without a backlog (and without dropping where the pointer stopped).
let hoverBusy = false, hoverNext: number[] = [];
let hoverUp: i32 = 0;   // ArrowUp while picking on the screen: how many levels above the node under the pointer
/** The pointer over the screen at the program's window point (x, y): the node there (DOM.getNodeForLocation, the program's own hit test)
 *  is highlighted; `click` selects the highlighted node in Elements, the tree opened and scrolled to it, and ends the pick. */
async function screenAt(x: number, y: number, click: boolean): Promise<void> {
  if (click) { const at = hover() > 0 ? hover() : await nodeAtPoint(x, y); setPick(false); if (at > 0) await picked(at); return; }
  if (hoverBusy) { hoverNext = [x, y]; return; }
  hoverBusy = true;
  let px = x, py = y;
  for (;;) {
    const id = await nodeAtPoint(px, py);
    if (picking() && id !== hoverBase) { hoverBase = id; hoverUp = 0; setHover(id); await refreshBox(); }
    if (hoverNext.length === 0) break;
    px = hoverNext[0]; py = hoverNext[1]; hoverNext = [];
  }
  hoverBusy = false;
}
let hoverBase: i32 = 0;   // the node under the pointer (hover() is it, or an ancestor ArrowUp chose)
async function nodeAtPoint(x: number, y: number): Promise<i32> {
  const r = await call('DOM.getNodeForLocation', `{"x":${Math.round(x)},"y":${Math.round(y)}}`);
  const id: i32 = r.nodeId !== undefined ? r.nodeId : 0;
  return id;
}
/** ArrowUp / ArrowDown while picking on the screen: the highlight goes to the parent of the node under the pointer, and back. */
function hoverLevel(by: i32): void {
  hoverUp = Math.max(0, hoverUp + by);
  let n = nodeOf(hoverBase);
  for (let k = 0; k < hoverUp && n !== null; k++) {
    const p = (n as TNode).parent;
    if (p === null) { hoverUp = k; break; }
    n = p;
  }
  if (n !== null && (n as TNode).id !== hover()) { setHover((n as TNode).id); refreshBox(); }
}
/** A node picked (on the screen or in the program): selected in Elements, its ancestors unfolded, its row scrolled to, Styles showing it. */
async function picked(id: i32): Promise<void> {
  if (view() === 'screen') await screen(false);
  setView('elements');
  await select(id);   // its ancestors unfolded
  await sleep(50);    // the rows of the opened ancestors are laid out
  scrollToNode(selected());
}
// Escape ends the pick (on the screen, and in the program, which ends its own on its Escape); the arrows go up and down the hovered node's ancestors.
ui.onKey((e: ui.KeyEvent) => {
  if (!picking()) return;
  if (e.key === 'Escape') { e.preventDefault(); setPick(false); }
  else if (view() === 'screen' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); hoverLevel(e.key === 'ArrowUp' ? 1 : -1); }
});

// The apps of the paired devices: `zinc device inspect --all` forwards the inspector of each to a port of this machine and names it, one line
// "<port> <device> <app>" each, then "ready"; it ends when this program does. ZINC names the engine to run, else the zinc of PATH.
let devicePorts: i32[] = [];
let deviceApps: string[] = [];
let deviceNames: string[] = [];
let devices: Process | null = null;
let held: i32 = 0;   // the port of the program attached to
let devicesListed: Promise<void> = new Promise<void>((resolve) => { resolve(); });
function findDevices(): void {
  if (devices !== null) {
    if (devicePorts.indexOf(held) >= 0) return;   // ponytail: attached to a device's app, its forwarding is kept and the list not renewed
    (devices as Process).kill();
  }
  devicePorts = []; deviceApps = []; deviceNames = [];
  devicesListed = new Promise<void>((resolve) => {
    try {
      const p = spawn(sys.env('ZINC') !== '' ? sys.env('ZINC') : 'zinc', ['device', 'inspect', '--all'], {});
      devices = p;
      p.onStdout((line: string) => {
        const w = line.split(' ');
        if (w.length === 3) { devicePorts.push(parseInt(w[0])); deviceApps.push(w[2] + ' on ' + w[1]); deviceNames.push(w[1]); }
        else if (line === 'ready') { resolve(); if (devicePorts.length > 0) list(); }
      });
      p.onExit((code: i32) => { resolve(); });
    } catch (e) { resolve(); }   // no zinc to run: the programs of this machine only
  });
}

// The list follows the programs by itself: looked at again every second (the ports scanned and those the programs announce, model.ts), a
// program alone is attached to when none is, and the program attached that exits is waited for: when it comes back (zinc dev starts a new
// process at each save), the inspector attaches to it again on the same view.
let listing = false;
let lost: Target | null = null;   // the program attached that exited, waited for
const auto = sys.env('ZINC_INSPECTOR_DUMP') === '' && sys.env('ZINC_INSPECTOR_VIEW') === '';   // scripted runs attach themselves
async function list(): Promise<void> {
  if (listing) { await until(() => !listing); return; }   // the look under way gives the list
  listing = true;
  const all = ports.concat(devicePorts);
  const found = await discover(all, announced);
  listing = false;
  for (const t of found) { const at = devicePorts.indexOf(t.port); if (at >= 0) { t.device = deviceNames[at]; if (t.engine.length === 0) t.title = deviceApps[at]; } }
  const was = targets().map((t: Target) => t.port + ' ' + t.pid + ' ' + t.title).join('|');
  if (found.map((t: Target) => t.port + ' ' + t.pid + ' ' + t.title).join('|') !== was) setTargets(found);
  if (lost !== null) {
    for (const t of found) if (t.key() === (lost as Target).key()) { const v = view(); lost = null; await attach(t, v); return; }
    return;
  }
  if (conn.c === null) setStatus(found.length === 0 ? 'no program yet: start one with zinc:devtools (zinc dev, or import \'zinc:devtools\')' : found.length + (found.length === 1 ? ' program' : ' programs'));
  if (auto && conn.c === null && found.length === 1) await attach(found[0]);
}
setInterval(() => { list(); }, 1000);

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
  } else if (method === 'Overlay.inspectNodeRequested') { const id: i32 = params.backendNodeId; setPicking(false); setHover(0); picked(id); }   // picked in the program
  else if (method === 'Overlay.nodeHighlightRequested') { const id: i32 = params.nodeId; setHover(id); refreshBox(); }
  else if (method === 'Overlay.inspectModeCanceled') { setPicking(false); setHover(0); refreshBox(); }
  else if (method === 'Page.screencastFrame') {   // the program's screen: decoded, shown, acknowledged so the next one comes
    const t0 = performance.now(), data: string = params.data;
    devW = params.metadata.deviceWidth; devH = params.metadata.deviceHeight;
    const id = imageFromBytes(base64Decode(data));
    if (id >= 0) { if (frame() >= 0) destroyImage(frame()); setFrame(id); }
    const sent: number = params.metadata.timestamp;
    cast.frames++; cast.bytes += data.length; cast.decode += performance.now() - t0; cast.latency += Date.now() - sent * 1000;
    const session: number = params.sessionId;
    call('Page.screencastFrameAck', `{"sessionId":${session}}`);
    refreshBox();   // the node drawn over it may have moved
  } else if (method.startsWith('Network.')) onNetwork(method, params);
  else if (method.startsWith('DOMStorage.')) onStorage(method, params);
  else if (method === 'Runtime.consoleAPICalled') onConsole(params);
  else if (method === 'Zinc.pausedChanged') setAppPaused(params.paused === true);   // F8 in the program, or another client
  else if (method === 'Runtime.executionContextsCleared') onReload();
  else if (method.startsWith('DOM.') && !reloading) {   // the tree changed: read it again, the folds, the filters and the selection kept
    reloading = true;
    setTimeout(() => { reloading = false; loadDocument(); }, 300);
  }
}

/** Attaches to program `t`; `again`: the view to keep, when it is the program attached before, started again. */
async function attach(t: Target, again: string = ''): Promise<void> {
  lost = null;
  if (conn.c !== null) (conn.c as Cdp).close();
  const c = new Cdp(t.ws);
  conn.c = c;
  held = t.port;
  c.onEvent = onEvent;
  c.onClose = () => {
    if (conn.c !== c) return;   // another program was attached since
    setEnded(true); setPaused(false); setAppPaused(false);
    if (t.type === 'node') { setStatus('detached from ' + t.name()); return; }   // zinc debug: the run is over
    conn.c = null; lost = t;
    setStatus(t.name() + ' exited: waiting for it to come back');
    setAttached(t.name() + ' (exited, waiting for it to come back)');
  };
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
  await pauseApp('Zinc.getPaused', '{}');
  setInfoDevice(t.device);   // the Info view first (a debugger target opens on Sources above)
  setView(again.length > 0 ? again : 'info');
  watchInfo();
  await call('Network.enable', '{}');   // the requests made before the attach come too
  const sel = selected();
  await loadDocument();
  if (again.length > 0 && sel >= 0 && nodeOf(sel) !== null) await select(sel);   // the same node, when the new run has it
  await loadStorage();
  if (again === 'screen') screen(true);
  setStatus(again.length > 0 ? 'attached again: ' + t.name() + ' restarted' : 'attached');
}

// "Rendered only" follows scrolling and animation: what draws is asked again twice a second while Elements shows it.
// The selected zinc:stage node's values follow the program too (a node that moves).
setInterval(() => { if (conn.c !== null && view() === 'elements') { if (renderedOnly()) refreshRendered(false); refreshStage(); } }, 500);

async function screen(on: boolean): Promise<void> {   // the screencast: frames of the program's screen while the Screen view is open
  await call(on ? 'Page.startScreencast' : 'Page.stopScreencast', on ? '{"format":"jpeg","quality":80,"maxWidth":640,"maxHeight":480}' : '{}');
  if (on) refreshBox();
}

// ---- the views
function TargetRow(p: { t: Target }): i32 {   // the program card: its name, then engine, run, project, process, port and device
  return <View className="flex-col gap-1 p-2 rounded-md bg-white border">
    <Text className="text-sm font-medium text-slate-900 break-all">{p.t.name()}</Text>
    <Text className="text-xs text-slate-500 break-words">{p.t.card()}</Text>
    <Btn label="Attach" onClick={() => { attach(p.t); }} />
  </View>;
}

// The frame fitted into the view with its proportions: its place in the Canvas (left, top, width, height), set by each draw.
const fit: number[] = [0, 0, 1, 1];
function quadBox(q: number[], i: i32): number[] { return [q[i], q[i + 1], q[i + 2] - q[i], q[i + 5] - q[i + 1]]; }
/** The Screen view's tooltip line: the node highlighted, its size; while picking, how to reach its parent. */
function screenTip(): string {
  const id = picking() && hover() > 0 ? hover() : target(), n = nodeOf(id), q = shown();
  if (n === null || q.length < 24) return picking() ? 'Pick: click a node of the screen (Escape cancels)' : '';
  const b = quadBox(q, 8);
  return label(n as TNode) + '  ' + Math.round(b[2]) + ' × ' + Math.round(b[3]) + (picking() ? '   ↑ parent · ↓ back · Esc cancel' : '');
}
function ScreenView(): i32 {   // the last frame, and over it the highlighted node's margin (orange), padding (green) and content (blue)
  const point = (e: PointerEvent): number[] => [(e.x - fit[0]) * devW / fit[2], (e.y - fit[1]) * devH / fit[3]];
  return <View className="flex-col flex-1 min-h-0">
  <Canvas className="flex-1" onPointerMove={(e: PointerEvent) => { if (picking()) { const p = point(e); screenAt(p[0], p[1], false); } }}
    onPointerDown={(e: PointerEvent) => { if (picking()) { const p = point(e); screenAt(p[0], p[1], true); } }}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xe2e8f0);
    const f = frame();
    if (f < 0) return;
    const iw = imageWidth(f), ih = imageHeight(f);
    const k = Math.min(w / Math.max(1, iw), h / Math.max(1, ih));
    fit[0] = (w - iw * k) / 2; fit[1] = (h - ih * k) / 2; fit[2] = iw * k; fit[3] = ih * k;
    drawImage(f, x + fit[0], y + fit[1], fit[2], fit[3], 255, 0);
    const q = shown();
    if (q.length < 24) return;
    const s = fit[2] / devW, ox = x + fit[0], oy = y + fit[1];
    const colors: u32[] = [0xf6b26b, 0x93c47d, 0x6fa8dc];   // Chrome's margin, padding and content
    for (let i = 0; i < 3; i++) { const b = quadBox(q, i * 8); rrect(ox + b[0] * s, oy + b[1] * s, b[2] * s, b[3] * s, 0, colors[i], 110); }
    const b = quadBox(q, 8);
    border(ox + b[0] * s, oy + b[1] * s, b[2] * s, b[3] * s, 0, 1, 0x1d4ed8, 255);
  }} />
  <Text className="px-2 py-1 text-xs font-mono text-slate-700 border-t">{screenTip()}</Text>
  </View>;
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
  return <View className="flex-col flex-1 min-h-0">
    <View className="flex-row flex-wrap items-center gap-2 p-1 border-b">
      {recording() ? <Btn label="Stop" onClick={() => { stopRecording(); }} /> : <Btn label="Record" onClick={() => { record(); }} />}
      <Text className="text-xs text-slate-500">{recording() ? 'recording…' : traced().length > 0 ? traced().length + ' frames, the slowest ' + msText(slowest()) : 'Record, use the program, then Stop'}</Text>
    </View>
    <View className="flex-col py-1 border-b overflow-x-auto">{tracks().map((t: Track) => <TrackRow t={t} />)}</View>
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
  return <Button className={'py-1 flex-row items-center h-7 px-3 rounded-md ' + (view() === p.id ? 'bg-slate-300' : 'bg-slate-50')} onClick={() => { setView(p.id); screen(p.id === 'screen'); if (p.id === 'threads') watchThreads(); if (p.id === 'info') watchInfo(); }}>
    <Text className="text-xs font-medium text-slate-900">{p.label}</Text>
  </Button>;
}

// The window as Chrome DevTools': no pane grows past it (min-w-0 / min-h-0, a long content scrolls or wraps inside its pane), the splitters
// between the program list, the view, the right column and the console resize them, the tab bar scrolls sideways when narrow.
function App(): i32 {
  return <View className="flex-col w-full h-full bg-white">
    <View className="flex-row flex-1 min-h-0">
      <View className="flex-col gap-2 p-2 bg-slate-100 shrink min-w-[120px] overflow-hidden" style={{ width: sideW() }}>
        <Text className="text-lg font-bold text-slate-900">Zinc Inspector</Text>
        <Btn label="Find programs" onClick={() => { refresh(); }} />
        <ScrollView className="flex-1">
          <View className="flex-col gap-2">{targets().map((t: Target) => <TargetRow t={t} />)}</View>
        </ScrollView>
        <Text className="text-xs text-slate-500 break-all">{status()}</Text>
      </View>
      <ResizeHandle vertical size={sideW} onResize={setSideW} min={120} max={600} />
      <View className="flex-col flex-1 basis-0 min-w-[200px] overflow-hidden">
        <View className="flex-row items-center gap-1 px-2 py-1 border-b overflow-x-auto">
          <Tab id="info" label="Info" />
          <Tab id="elements" label="Elements" />
          <Tab id="screen" label="Screen" />
          <Tab id="network" label="Network" />
          <Tab id="storage" label="Storage" />
          <Tab id="sources" label="Sources" />
          <Tab id="performance" label="Performance" />
          <Tab id="threads" label="Threads" />
          <Flat label={picking() ? 'Pick: on' : 'Pick'} on={picking()} onClick={() => { setPick(!picking()); }} />
          <Flat label={appPaused() ? 'Resume' : 'Pause'} on={appPaused()} onClick={() => { pauseApp('Zinc.setPaused', `{"paused":${!appPaused()}}`); }} />
          {appPaused() ? <Flat label="Step frame" on={false} onClick={() => { pauseApp('Zinc.stepFrame', '{}'); }} /> : <View />}
          <Text className="flex-1 text-xs text-slate-600 whitespace-nowrap">{attached()}</Text>
        </View>
        {view() === 'sources' ? <SourcesView /> : view() === 'performance' ? <PerformanceView /> : view() === 'threads' ? <ThreadsView /> : view() === 'network' ? <NetworkView /> : view() === 'storage' ? <StorageView /> :
          view() === 'screen' ? <ScreenView /> : view() === 'info' ? <InfoView /> : <ElementsView />}
      </View>
      {view() === 'network' || view() === 'storage' || view() === 'threads' || view() === 'info' ? <View /> : <ResizeHandle vertical after size={rightW} onResize={setRightW} min={160} max={800} />}
      {view() === 'network' || view() === 'storage' || view() === 'threads' || view() === 'info' ? <View /> :
        <View className="flex-col shrink min-w-[160px] overflow-hidden" style={{ width: rightW() }}>
        {view() === 'sources' ? <ScrollView className="flex-1"><DebugPane /></ScrollView> :
        view() === 'performance' ? <ScrollView className="flex-1"><View className="flex-col gap-1 p-2">{frameLines().map((l: string) => <Text className="text-xs font-mono text-slate-800">{l}</Text>)}</View></ScrollView> : <StylesPane />}
      </View>}
    </View>
    <ResizeHandle after size={consoleH} onResize={setConsoleH} min={60} max={800} />
    <ConsolePane />
  </View>;
}

async function dump(): Promise<void> {   // ZINC_INSPECTOR_DUMP: the panels as text, for scripted tests
  const mode = sys.env('ZINC_INSPECTOR_DUMP');
  await refresh();
  if (targets().length === 0) { await devicesListed; await list(); }   // none here: those of the paired devices, once they are known
  const ts = targets();
  console.log('programs: ' + ts.length);
  for (const t of ts) { console.log('program: ' + t.title + ' (' + t.type + ')'); console.log('card: ' + t.card()); }
  if (ts.length === 0) { quit(); return; }
  await attach(ts[0]);
  if (ts[0].type === 'node') { await dumpDebugger(); quit(); return; }
  if (mode === 'reconnect') {   // the program ends and starts again (on another port): attached to it again, on the same view
    const wait = async (f: () => boolean): Promise<boolean> => { for (let k = 0; k < 1500; k++) { if (f()) return true; await sleep(20); } return false; };
    setView('elements');
    console.log('attached: ' + attached() + ' | view ' + view());
    console.log('ready for restart');
    await wait(() => status().indexOf('exited') >= 0);
    console.log('dropped: ' + status());
    await wait(() => status().startsWith('attached again'));
    console.log('again: ' + status() + ' | view ' + view() + ' | ' + attached());
    quit();
    return;
  }
  if (mode === 'info') {   // the Info view's card, once its workers are known
    const n = infoLoads();
    await until(() => infoLoads() > n);
    await sleep(1200);   // a few frames: the frame rate, the phases
    await loadInfo();
    dumpInfo();
    quit();
    return;
  }
  if (mode === 'layout') { await dumpLayout(); quit(); return; }   // tests/t1/inspector_layout.sh
  setView('elements');
  if (mode === 'screenfps') {   // two seconds of an animated program's screen: frames per second, size, decoding, latency
    setView('screen');
    await screen(true);
    await until(() => frame() >= 0);
    await sleep(300);
    const n0 = cast.frames, b0 = cast.bytes, d0 = cast.decode, l0 = cast.latency, t0 = performance.now();
    await sleep(2000);
    const n = cast.frames - n0, k = Math.max(1, n);
    console.log('screen fps: ' + Math.round(n * 1000 / (performance.now() - t0)) + ', ' + Math.round((cast.bytes - b0) / k / 1024) + ' KB base64 a frame, decode ' +
      (Math.round((cast.decode - d0) / k * 100) / 100) + ' ms, latency ' + Math.round((cast.latency - l0) / k) + ' ms, ' + imageWidth(frame()) + ' x ' + imageHeight(frame()));
    await screen(false);
    quit();
    return;
  }
  if (mode === 'screen') {   // tests/data/inspector_screen: the highlight stays out of the frames, the node at a point, a pick on the screen
    await until(() => rows().length > 0);
    let sky = 0;
    for (const r of rows()) if (r.node.cls.indexOf('bg-sky-600') >= 0) sky = r.node.id;
    setView('screen');
    await screen(true);
    await until(() => frame() >= 0);
    await sleep(400);
    const n0 = cast.frames;
    await call('Overlay.highlightNode', `{"nodeId":${sky},"highlightConfig":{}}`);
    await sleep(500);
    console.log('frames sent while a node is highlighted: ' + (cast.frames - n0));
    await call('Overlay.hideHighlight', '{}');
    const at = await call('DOM.getNodeForLocation', '{"x":60,"y":60}');
    const atId: i32 = at.nodeId !== undefined ? at.nodeId : 0;
    const atNode = nodeOf(atId);
    console.log('node at 60,60: ' + (atNode !== null ? label(atNode as TNode) : 'none'));
    const none = await call('DOM.getNodeForLocation', '{"x":-5,"y":-5}');
    console.log('node at -5,-5: ' + (none.message !== undefined ? none.message : 'found'));
    const plain: string = (await call('Page.captureScreenshot', '{}')).data;   // the program's frame with no highlight
    setPick(true);
    await sleep(300);   // the program's own pick mode first says what is under its pointer
    await screenAt(60, 60, false);
    await sleep(200);
    console.log('screen hover: ' + hover() + ' = ' + atId + ', drawn box ' + quadBox(shown(), 8).join(','));
    ui.sendKey('ArrowUp'); await sleep(200);   // the parent the pointer cannot reach, then back to the node under it
    const up = nodeOf(hover());
    ui.sendKey('ArrowDown'); await sleep(200);
    console.log('screen parent: ' + (up !== null ? label(up as TNode) : 'none') + ', back ' + (hover() === atId) + ' | tip ' + screenTip());
    ui.sendKey('ArrowUp'); await sleep(200);
    await screenAt(60, 60, true);   // the click picks what is highlighted: the parent
    const sel = nodeOf(selected());
    await sleep(300);
    const after: string = (await call('Page.captureScreenshot', '{}')).data;
    console.log('screen pick: ' + (sel !== null ? label(sel as TNode) : 'none') + ' selected, view ' + view() + ', picking ' + picking() +
      ', row ' + (rows().findIndex((r: Row) => r.node.id === selected()) >= 0) + ', highlight left in the program ' + (after !== plain));
    setPick(true); await sleep(300);
    ui.sendKey('Escape'); await sleep(300);
    const esc: string = (await call('Page.captureScreenshot', '{}')).data;
    console.log('escape: picking ' + picking() + ', highlight left ' + (esc !== plain));
    quit();
    return;
  }
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
  await dumpTree();
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
  if (v === 'storage') { if (items().length > 0) pickItem(items()[items().length - 1].key); else if (tables().length > 0) await openTable(tables()[0], 0); return; }   // a key, else a table
  let c = findNode((n: TNode): boolean => n.comp);   // a component selected (its props and styles show), the path to it opened
  if (c === null) c = findNode((n: TNode): boolean => n.stage && inlineText(n) !== null);   // a zinc:stage scene: a node that shows a text
  if (c !== null) await select((c as TNode).id);
}

render(App, 0xffffff, (dt: number) => {});
if (sys.env('ZINC_INSPECTOR_DUMP') !== '') dump(); else if (sys.env('ZINC_INSPECTOR_VIEW') !== '') openView(sys.env('ZINC_INSPECTOR_VIEW')); else refresh();
