// Zinc Inspector (ZN-373.01): inspects running Zinc programs over the Chrome DevTools protocol, as a Zinc app. The programs that listen on the
// given ports (zinc:devtools: 9229, zinc debug --cdp: 9222), the Elements tree of the one attached, the selected node's computed style and box
// (highlighted in the program), its rules and element.style to edit (ZN-373.02), the program's screen, and its console.
// Usage: zinc run app/inspector/main.tsx -- [port...]
// ZINC_INSPECTOR_DUMP=1: attach to the first program, select the first node with a padding class, wait a second and print what each view
// shows, then quit (tests/t1/inspector.sh).
import { createSignal, render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { quit, imageFromBytes, destroyImage, imageWidth, imageHeight, drawImage, rect } from 'zinc:gfx';
import { base64Decode } from 'zinc:web';
import { Target, Cdp, Row, Inline, Req, discover, rows, styleLines, consoleLine, ruleLines, inlineOf, applyNetwork } from './model';

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
  if (method === 'Page.screencastFrame') {   // the program's screen: decoded, shown, acknowledged so the next one comes
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
  c.onClose = () => { setStatus('detached from ' + t.title); };
  setStatus('attaching to ' + t.title + '…');
  await c.open;
  setAttached(t.title + ' (port ' + t.port + ')');
  setLogs([]);
  setReqs([]);
  await c.call('Runtime.enable', '{}');
  await c.call('Network.enable', '{}');   // the requests made before the attach come too
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
      <View class="flex-col flex-1">
        <View class="flex-row items-center gap-1 px-2 py-1 border-b">
          <Tab id="elements" label="Elements" />
          <Tab id="screen" label="Screen" />
          <Tab id="network" label="Network" />
          <Text class="flex-1 text-xs text-slate-600">{attached()}</Text>
        </View>
        {view() === 'network' ? <NetworkView /> : view() === 'screen' ? <ScreenView /> :
        <ScrollView class="flex-1">
          <View class="flex-col">{tree().map((r: Row) => <TreeRow r={r} />)}</View>
        </ScrollView>}
      </View>
      <View class="flex-col w-72 border-l">
        <Styles />
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

render(App, 0xffffff, (dt: number) => {});
if (sys.env('ZINC_INSPECTOR_DUMP') !== '') dump(); else refresh();
