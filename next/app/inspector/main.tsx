// Zinc Inspector (ZN-373.01): inspects running Zinc programs over the Chrome DevTools protocol, as a Zinc app. The programs that listen on the
// given ports (zinc:devtools: 9229, zinc debug --cdp: 9222), the Elements tree of the one attached, the selected node's computed style and box
// (highlighted in the program), its rules and element.style to edit (ZN-373.02), the program's screen, its console, its requests (ZN-373.03),
// and for zinc debug --cdp the Sources view: breakpoints, the stack, the scopes, watches and stepping (ZN-373.04).
// Usage: zinc run app/inspector/main.tsx -- [port...]
// ZINC_INSPECTOR_DUMP=1: attach to the first program, select the first node with a padding class, wait a second and print what each view
// shows, then quit; a debugger target gets a scripted session instead (tests/t1/inspector.sh).
import { createSignal, render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { quit, imageFromBytes, destroyImage, imageWidth, imageHeight, drawImage, rect } from 'zinc:gfx';
import { base64Decode } from 'zinc:web';
import { Target, Cdp, Row, Inline, Req, Script, Frame, Prop, discover, rows, styleLines, consoleLine, ruleLines, inlineOf, applyNetwork, framesOf, propsOf, remoteText } from './model';

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
const [rules, setRules] = createSignal<string[]>([]);
const [inline, setInline] = createSignal<Inline>(new Inline());
const [draft, setDraft] = createSignal<string>('');   // what is typed in element.style
const [view, setView] = createSignal<string>('elements');   // elements | screen
const [frame, setFrame] = createSignal<i32>(-1);   // the program's screen (Page.screencastFrame) as a runtime image
const [reqs, setReqs] = createSignal<Req[]>([]);   // the Network view (ZN-373.03)
const [picked, setPicked] = createSignal<string>('');
const [body, setBody] = createSignal<string>('');
// the Sources view (ZN-373.04), against zinc debug --cdp
class Bp { line: i32 = 0; id: string = ''; }
class ScopeLine { depth: i32 = 0; name: string = ''; value: string = ''; objectId: string = ''; open: boolean = false; }
const [scripts, setScripts] = createSignal<Script[]>([]);
const [script, setScript] = createSignal<string>('');
const [source, setSource] = createSignal<string[]>([]);
const [bps, setBps] = createSignal<Bp[]>([]);
const [cond, setCond] = createSignal<string>('');   // the condition of the next breakpoint set
const [waiting, setWaiting] = createSignal<boolean>(false);   // the program waits for Run (Runtime.runIfWaitingForDebugger)
const [paused, setPaused] = createSignal<boolean>(false);
const [frames, setFrames] = createSignal<Frame[]>([]);
const [frameIx, setFrameIx] = createSignal<i32>(0);
const [scope, setScope] = createSignal<ScopeLine[]>([]);
const [watches, setWatches] = createSignal<string[]>([]);
const [watchVals, setWatchVals] = createSignal<string[]>([]);
const [watchDraft, setWatchDraft] = createSignal<string>('');
const [ended, setEnded] = createSignal<boolean>(false);
const [stops, setStops] = createSignal<i32>(0);   // the frames shown so far (the dump waits on it)

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
  setTree(d.root !== undefined ? rows(d.root, 0, []) : []);   // zinc debug --cdp has no tree
}

function onEvent(method: string, params: any): void {
  if (method === 'Debugger.scriptParsed') {
    const s = new Script();
    s.id = params.scriptId; s.url = params.url;
    const l = scripts().slice(0); l.push(s); setScripts(l);
    if (script() === '') openScript(s.id);
  } else if (method === 'Debugger.paused') {
    setPaused(true);
    setFrames(framesOf(params));
    showFrame(0);
  } else if (method === 'Debugger.resumed') {
    setPaused(false);
  } else if (method === 'Page.screencastFrame') {   // the program's screen: decoded, shown, acknowledged so the next one comes
    const id = imageFromBytes(base64Decode(params.data));
    if (id >= 0) { if (frame() >= 0) destroyImage(frame()); setFrame(id); }
    const session: number = params.sessionId;
    if (cdp !== null) (cdp as Cdp).call('Page.screencastFrameAck', `{"sessionId":${session}}`);
  } else if (method.startsWith('Network.')) {
    const l = reqs().slice(0);
    if (applyNetwork(l, method, params)) setReqs(l);
  } else if (method === 'Runtime.consoleAPICalled') {
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
  c.onClose = () => { setStatus('detached from ' + t.name()); setEnded(true); setPaused(false); };
  setStatus('attaching to ' + t.name() + '…');
  await c.open;
  setAttached(t.name() + ' (port ' + t.port + ')');
  setLogs([]);
  setReqs([]);
  await c.call('Runtime.enable', '{}');
  setScripts([]); setScript(''); setSource([]); setBps([]); setFrames([]); setScope([]); setEnded(false);
  if (t.type === 'node') {   // zinc debug --cdp: the debugger; the program waits for Run
    await c.call('Debugger.enable', '{}');
    setWaiting(true);
    setView('sources');
    setStatus('attached: set breakpoints, then Run');
    return;
  }
  await c.call('Network.enable', '{}');   // the requests made before the attach come too
  await loadDocument();
  setStatus('attached');
}

// ---- the Sources view
async function openScript(id: string): Promise<void> {
  if (cdp === null) return;
  setScript(id);
  const r = await (cdp as Cdp).call('Debugger.getScriptSource', `{"scriptId":${JSON.stringify(id)}}`);
  const t: string = r.scriptSource !== undefined ? r.scriptSource : '';
  setSource(t.split('\n'));
}
function urlOf(id: string): string { for (const s of scripts()) if (s.id === id) return s.url; return ''; }
function nameOf(id: string): string { for (const s of scripts()) if (s.id === id) return s.name(); return id; }
/** Sets a breakpoint on a line of the shown script (with the condition typed, if any), or removes the one there. */
async function toggleBp(line: i32): Promise<void> {
  if (cdp === null) return;
  const c = cdp as Cdp;
  for (const b of bps()) if (b.line === line) {
    await c.call('Debugger.removeBreakpoint', `{"breakpointId":${JSON.stringify(b.id)}}`);
    setBps(bps().filter((x: Bp) => x.line !== line));
    return;
  }
  const r = await c.call('Debugger.setBreakpointByUrl', `{"url":${JSON.stringify(urlOf(script()))},"lineNumber":${line - 1}${cond().length > 0 ? ',"condition":' + JSON.stringify(cond()) : ''}}`);
  if (r.breakpointId === undefined) { setStatus('no code at line ' + line); return; }
  const b = new Bp();
  b.id = r.breakpointId;
  const at: i32 = r.locations[0].lineNumber;
  b.line = at + 1;
  const l = bps().slice(0); l.push(b); setBps(l);
}
async function run(): Promise<void> { if (cdp === null) return; setWaiting(false); setStatus('running'); await (cdp as Cdp).call('Runtime.runIfWaitingForDebugger', '{}'); }
async function command(method: string): Promise<void> { if (cdp !== null) await (cdp as Cdp).call(method, '{}'); }
async function showFrame(i: i32): Promise<void> {
  const fs = frames();
  if (i >= fs.length || cdp === null) return;
  setFrameIx(i);
  const f = fs[i];
  if (f.script !== script()) await openScript(f.script);
  const lines: ScopeLine[] = [];
  for (let k = 0; k < f.scopes.length; k++) {
    lines.push(scopeLine(0, f.scopeNames[k], '', '', false));
    for (const p of propsOf(await (cdp as Cdp).call('Runtime.getProperties', `{"objectId":${JSON.stringify(f.scopes[k])}}`))) lines.push(scopeLine(1, p.name, p.value, p.objectId, false));
  }
  setScope(lines);
  await evalWatches();
  setStops(stops() + 1);
}
function scopeLine(depth: i32, name: string, value: string, objectId: string, open: boolean): ScopeLine {
  const x = new ScopeLine(); x.depth = depth; x.name = name; x.value = value; x.objectId = objectId; x.open = open;
  return x;
}
/** Unfolds (or folds) an object or array of the Scope pane; the line is replaced, so its marker is drawn again. */
async function unfold(at: i32): Promise<void> {
  const l = scope();
  const s = l[at];
  if (s.objectId === '' || cdp === null) return;
  let end = at + 1;
  while (end < l.length && l[end].depth > s.depth) end++;
  const kids: ScopeLine[] = [];
  if (!s.open) for (const p of propsOf(await (cdp as Cdp).call('Runtime.getProperties', `{"objectId":${JSON.stringify(s.objectId)}}`))) kids.push(scopeLine(s.depth + 1, p.name, p.value, p.objectId, false));
  setScope(l.slice(0, at).concat([scopeLine(s.depth, s.name, s.value, s.objectId, !s.open)]).concat(kids).concat(l.slice(end)));
}
async function evalWatches(): Promise<void> {
  if (cdp === null || !paused() || frames().length === 0) { setWatchVals([]); return; }
  const out: string[] = [];
  const id = frames()[frameIx()].id;
  for (const w of watches()) {
    const r = await (cdp as Cdp).call('Debugger.evaluateOnCallFrame', `{"callFrameId":${JSON.stringify(id)},"expression":${JSON.stringify(w)}}`);
    out.push(r.exceptionDetails !== undefined ? 'error: ' + remoteText(r.result) : remoteText(r.result));
  }
  setWatchVals(out);
}

async function select(id: i32): Promise<void> {
  if (cdp === null) return;
  const c = cdp as Cdp;
  setSelected(id);
  c.call('Overlay.highlightNode', `{"nodeId":${id},"highlightConfig":{}}`);
  setStyles(styleLines(await c.call('CSS.getComputedStyleForNode', `{"nodeId":${id}}`)));
  const b = await c.call('DOM.getBoxModel', `{"nodeId":${id}}`);
  if (b.model !== undefined) { const w: number = b.model.width; const h: number = b.model.height; setBox(w + ' × ' + h); } else setBox('');
  const m = await c.call('CSS.getMatchedStylesForNode', `{"nodeId":${id}}`);
  setRules(ruleLines(m));
  const i = inlineOf(m.inlineStyle);
  setInline(i);
  setDraft(i.text);
}

/** element.style of the selected node becomes `text` (CSS.setStyleTexts): the program changes at once and prints the patch to its console. */
async function applyStyle(text: string): Promise<void> {
  if (cdp === null || selected() < 0 || inline().sheet === '') return;
  const i = inline();
  const r = await (cdp as Cdp).call('CSS.setStyleTexts', `{"edits":[{"styleSheetId":${JSON.stringify(i.sheet)},"range":${i.range},"text":${JSON.stringify(text)}}]}`);
  setStatus(r.styles !== undefined ? 'element.style applied' : 'not applied');
  await select(selected());
}

async function screen(on: boolean): Promise<void> {   // the screencast: frames of the program's screen while the Screen view is open
  if (cdp === null) return;
  await (cdp as Cdp).call(on ? 'Page.startScreencast' : 'Page.stopScreencast', on ? '{"format":"png","maxWidth":640,"maxHeight":480}' : '{}');
}

// ---- the views
function Btn(p: { label: string; onClick: () => void }): i32 {
  return <Button class="flex-row items-center justify-center h-7 px-3 rounded-md bg-slate-900" onClick={p.onClick}>
    <Text class="text-xs font-medium text-white">{p.label}</Text>
  </Button>;
}

function TargetRow(p: { t: Target }): i32 {
  return <View class="flex-col gap-1 p-2 rounded-md bg-white border">
    <Text class="text-sm font-medium text-slate-900">{p.t.name()}</Text>
    <Text class="text-xs text-slate-500">{p.t.type + ' on port ' + p.t.port}</Text>
    <Btn label="Attach" onClick={() => { attach(p.t); }} />
  </View>;
}

function TreeRow(p: { r: Row }): i32 {
  return <Button class={'flex-row items-center justify-start h-6 rounded ' + (selected() === p.r.nodeId ? 'bg-sky-100' : 'bg-white')} style={{ paddingLeft: 8 + p.r.depth * 14 }} onClick={() => { select(p.r.nodeId); }}>
    <Text class={'text-xs font-mono ' + (p.r.label.startsWith('<') ? 'text-purple-800' : 'text-slate-700')}>{p.r.label}</Text>
  </Button>;
}

function ScreenView(): i32 {   // the last frame, fitted into the view with its proportions
  return <Canvas class="flex-1" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xe2e8f0);
    const f = frame();
    if (f < 0) return;
    const iw = imageWidth(f), ih = imageHeight(f);
    const k = Math.min(w / Math.max(1, iw), h / Math.max(1, ih));
    drawImage(f, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k, 255, 0);
  }} />;
}

function Styles(): i32 {
  return <View class="flex-col gap-1 p-2 border-b">
    <Text class="text-xs font-medium text-slate-600">element.style</Text>
    <Input class="h-7 px-2 text-xs font-mono border rounded" value={draft()} onInput={(v: string) => { setDraft(v); }} />
    <Btn label="Apply" onClick={() => { applyStyle(draft()); }} />
    <View class="flex-col">{rules().map((l: string) => <Text class="text-xs font-mono text-slate-700">{l}</Text>)}</View>
  </View>;
}

async function pick(r: Req): Promise<void> {   // a request's response body
  setPicked(r.id);
  if (cdp === null) return;
  const b = await (cdp as Cdp).call('Network.getResponseBody', `{"requestId":${JSON.stringify(r.id)}}`);
  const t: string = b.body !== undefined ? b.body : '';
  setBody(t);
}

function SourceLine(p: { n: i32; text: string }): i32 {
  const here = (): boolean => paused() && frames().length > 0 && frames()[frameIx()].line === p.n && frames()[frameIx()].script === script();
  const bp = (): boolean => bps().some((b: Bp) => b.line === p.n);
  return <Button class={'flex-row items-center justify-start h-5 ' + (here() ? 'bg-amber-100' : 'bg-white')} onClick={() => { toggleBp(p.n); }}>
    <Text class={'w-5 text-xs ' + (bp() ? 'text-red-600' : 'text-white')}>●</Text>
    <Text class="w-8 text-xs font-mono text-slate-400">{'' + p.n}</Text>
    <Text class="text-xs font-mono text-slate-800">{p.text}</Text>
  </Button>;
}

function SourcesView(): i32 {
  return <View class="flex-col flex-1">
    <View class="flex-row items-center gap-1 p-1 border-b">
      {waiting() ? <Btn label="Run" onClick={() => { run(); }} /> : <View />}
      <Btn label="Resume" onClick={() => { command('Debugger.resume'); }} />
      <Btn label="Over" onClick={() => { command('Debugger.stepOver'); }} />
      <Btn label="Into" onClick={() => { command('Debugger.stepInto'); }} />
      <Btn label="Out" onClick={() => { command('Debugger.stepOut'); }} />
      <Btn label="Pause" onClick={() => { command('Debugger.pause'); }} />
      <Input class="w-40 h-7 px-2 text-xs font-mono border rounded" value={cond()} onInput={(v: string) => { setCond(v); }} />
      <Text class="text-xs text-slate-500">{ended() ? 'ended' : paused() ? 'paused' : waiting() ? 'waiting' : 'running'}</Text>
    </View>
    <View class="flex-row gap-1 px-1 border-b">{scripts().map((s: Script) => <Button class={'h-6 px-2 rounded ' + (script() === s.id ? 'bg-slate-300' : 'bg-slate-50')} onClick={() => { openScript(s.id); }}><Text class="text-xs text-slate-800">{s.name()}</Text></Button>)}</View>
    <ScrollView class="flex-1">
      <View class="flex-col">{source().map((t: string, i: i32) => <SourceLine n={i + 1} text={t} />)}</View>
    </ScrollView>
  </View>;
}

function DebugPane(): i32 {   // the right column of a debugger target: the stack, the scopes, the watches
  return <View class="flex-col gap-1 p-2">
    <Text class="text-xs font-medium text-slate-600">Call stack</Text>
    {frames().map((f: Frame, i: i32) => <Button class={'flex-row justify-start h-6 px-1 rounded ' + (frameIx() === i ? 'bg-sky-100' : 'bg-white')} onClick={() => { showFrame(i); }}>
      <Text class="text-xs font-mono text-slate-800">{f.name + ' ' + nameOf(f.script) + ':' + f.line}</Text></Button>)}
    <Text class="text-xs font-medium text-slate-600">Scope</Text>
    {scope().map((s: ScopeLine, i: i32) => <Button class="flex-row justify-start h-5 rounded bg-white" style={{ paddingLeft: s.depth * 12 }} onClick={() => { unfold(i); }}>
      <Text class={'text-xs font-mono ' + (s.depth === 0 ? 'font-medium text-slate-600' : 'text-slate-800')}>{s.depth === 0 ? s.name : (s.objectId !== '' ? (s.open ? '▾ ' : '▸ ') : '') + s.name + ': ' + s.value}</Text></Button>)}
    <Text class="text-xs font-medium text-slate-600">Watch</Text>
    {watches().map((w: string, i: i32) => <Text class="text-xs font-mono text-slate-800">{w + ' = ' + (i < watchVals().length ? watchVals()[i] : '')}</Text>)}
    <Input class="h-7 px-2 text-xs font-mono border rounded" value={watchDraft()} onInput={(v: string) => { setWatchDraft(v); }} />
    <Btn label="Add watch" onClick={() => { const l = watches().slice(0); l.push(watchDraft()); setWatches(l); setWatchDraft(''); evalWatches(); }} />
  </View>;
}

function NetRow(p: { r: Req }): i32 {
  return <Button class={'flex-row items-center justify-start h-6 px-2 rounded ' + (picked() === p.r.id ? 'bg-sky-100' : 'bg-white')} onClick={() => { pick(p.r); }}>
    <Text class={'text-xs font-mono ' + (p.r.error.length > 0 || p.r.status >= 400 ? 'text-red-700' : 'text-slate-800')}>{p.r.line()}</Text>
  </Button>;
}

function NetworkView(): i32 {
  return <View class="flex-col flex-1">
    <ScrollView class="flex-1">
      <View class="flex-col">{reqs().map((r: Req) => <NetRow r={r} />)}</View>
    </ScrollView>
    <ScrollView class="h-32 border-t bg-slate-50">
      <Text class="p-2 text-xs font-mono text-slate-800">{body()}</Text>
    </ScrollView>
  </View>;
}

function Tab(p: { id: string; label: string }): i32 {
  return <Button class={'flex-row items-center h-7 px-3 rounded-md ' + (view() === p.id ? 'bg-slate-300' : 'bg-slate-50')} onClick={() => { setView(p.id); screen(p.id === 'screen'); }}>
    <Text class="text-xs font-medium text-slate-900">{p.label}</Text>
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
      <View class="flex-col flex-1 w-0 overflow-hidden">
        <View class="flex-row items-center gap-1 px-2 py-1 border-b">
          <Tab id="elements" label="Elements" />
          <Tab id="screen" label="Screen" />
          <Tab id="network" label="Network" />
          <Tab id="sources" label="Sources" />
          <Text class="flex-1 text-xs text-slate-600">{attached()}</Text>
        </View>
        {view() === 'sources' ? <SourcesView /> : view() === 'network' ? <NetworkView /> : view() === 'screen' ? <ScreenView /> :
        <ScrollView class="flex-1">
          <View class="flex-col">{tree().map((r: Row) => <TreeRow r={r} />)}</View>
        </ScrollView>}
      </View>
      <View class="flex-col w-72 border-l">
        {view() === 'sources' ? <ScrollView class="flex-1"><DebugPane /></ScrollView> : <View class="flex-col flex-1">
          <Styles />
          <Text class="px-2 py-1 text-xs font-medium text-slate-600 border-b">{box() === '' ? 'Computed' : 'Computed · ' + box()}</Text>
          <ScrollView class="flex-1">
            <View class="flex-col p-2">{styles().map((s: string) => <Text class="text-xs font-mono text-slate-800">{s}</Text>)}</View>
          </ScrollView>
        </View>}
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
  if (ts[0].type === 'node') { await dumpDebugger(); quit(); return; }
  for (const r of tree()) if (r.label.indexOf('"p-') >= 0 || r.label.indexOf(' p-') >= 0) { await select(r.nodeId); break; }   // a padding class
  await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 1200); });
  console.log('elements:');
  for (const r of tree()) console.log('  '.repeat(r.depth + 1) + r.label);
  console.log('selected: ' + selected() + ' ' + box());
  for (const s of styles()) console.log('  ' + s);
  console.log('rules:');
  for (const l of rules()) console.log('  ' + l);
  if (cdp !== null && selected() >= 0) {   // ZN-373.02: element.style edited, the program's frame before and after, and its screen
    const c = cdp as Cdp;
    const before: string = (await c.call('Page.captureScreenshot', '{}')).data;
    const was = box();
    await applyStyle('padding-left: 40px;');
    await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 300); });
    const after: string = (await c.call('Page.captureScreenshot', '{}')).data;
    console.log('element.style: ' + inline().text + ' | box ' + was + ' -> ' + box() + ' | frame changed: ' + (before !== after));
    setView('screen');   // the dump ends on the Screen view (a ZINC_SHOT shows it)
    await screen(true);
    for (let k = 0; k < 40 && frame() < 0; k++) await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 50); });
    console.log('screen: ' + (frame() >= 0 ? imageWidth(frame()) + ' x ' + imageHeight(frame()) : 'none'));
    await screen(false);
    await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 300); });   // the patch reaches the console
  }
  console.log('console:');
  for (const l of logs()) console.log('  ' + l);
  console.log('network:');   // ZN-373.03: the requests and the first one's body
  for (const r of reqs()) console.log('  ' + r.line().replace(/[0-9]+ ms/, 'N ms'));   // the time varies: its unit only
  if (reqs().length > 0) { await pick(reqs()[0]); console.log('body: ' + body()); }
  quit();
}

async function until(f: () => boolean): Promise<boolean> {   // polls every 20 ms, 5 s at most
  for (let k = 0; k < 250; k++) { if (f()) return true; await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 20); }); }
  return false;
}
/** A command that runs the program on, then the next stop shown. */
async function stepped(what: string, method: string): Promise<void> {
  const n = stops();
  if (method === 'run') await run(); else await command(method);
  await until(() => stops() > n);
  console.log(what + ': ' + frames().map((f: Frame) => f.name + ' ' + nameOf(f.script) + ':' + f.line).join(', '));
}
async function dumpDebugger(): Promise<void> {   // ZN-373.04: a session of the Sources view against zinc debug --cdp (tests/data/debug_cli/main.ts)
  await until(() => source().length > 1);
  console.log('scripts: ' + scripts().map((s: Script) => s.name()).join(' '));
  console.log('source: ' + source().length + ' lines, line 9: ' + source()[8].trim());
  await toggleBp(19);
  console.log('breakpoints: ' + bps().map((b: Bp) => '' + b.line).join(' '));
  setWatches(['total + 1', 'p.x * 10']);
  await stepped('start', 'run');
  await stepped('paused', 'Debugger.resume');
  for (let i = 0; i < scope().length; i++) if (scope()[i].name === 'p') { await unfold(i); break; }
  console.log('scope:');
  for (const s of scope()) console.log('  '.repeat(s.depth + 1) + (s.depth === 0 ? s.name : s.name + ': ' + s.value));
  for (let i = 0; i < watches().length; i++) console.log('watch: ' + watches()[i] + ' = ' + watchVals()[i]);
  await stepped('step into', 'Debugger.stepInto');
  await stepped('step over', 'Debugger.stepOver');
  await stepped('step out', 'Debugger.stepOut');
  await toggleBp(19);
  console.log('breakpoints: ' + bps().length);
  await command('Debugger.resume');
  console.log('ended: ' + await until(() => ended()));
}

render(App, 0xffffff, (dt: number) => {});
if (sys.env('ZINC_INSPECTOR_DUMP') !== '') dump(); else refresh();
