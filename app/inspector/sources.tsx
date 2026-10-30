// The Sources panel of Zinc Inspector (ZN-373.04), against zinc debug --cdp: the program's scripts with line numbers, breakpoints (with a
// condition), Run / Resume / Over / Into / Out / Pause, and the right column: the call stack, the scopes (objects and arrays unfold) and the
// watches, evaluated in the selected frame.
import { createSignal } from 'zinc:ui/solid';
import { conn, call, setStatus, until } from './state';
import { Script, Frame, framesOf, propsOf, remoteText } from './model';
import { Btn } from './widgets';

class Bp { line: i32 = 0; id: string = ''; }
class ScopeLine { depth: i32 = 0; name: string = ''; value: string = ''; objectId: string = ''; open: boolean = false; }
const [scripts, setScripts] = createSignal<Script[]>([]);
const [script, setScript] = createSignal<string>('');
const [source, setSource] = createSignal<string[]>([]);
const [bps, setBps] = createSignal<Bp[]>([]);
const [cond, setCond] = createSignal<string>('');   // the condition of the next breakpoint set
export const [waiting, setWaiting] = createSignal<boolean>(false);   // the program waits for Run (Runtime.runIfWaitingForDebugger)
export const [paused, setPaused] = createSignal<boolean>(false);
const [frames, setFrames] = createSignal<Frame[]>([]);
const [frameIx, setFrameIx] = createSignal<i32>(0);
const [scope, setScope] = createSignal<ScopeLine[]>([]);
const [watches, setWatches] = createSignal<string[]>([]);
const [watchVals, setWatchVals] = createSignal<string[]>([]);
const [watchDraft, setWatchDraft] = createSignal<string>('');
export const [ended, setEnded] = createSignal<boolean>(false);
const [stops, setStops] = createSignal<i32>(0);   // the frames shown so far (the dump waits on it)

export function resetSources(): void { setScripts([]); setScript(''); setSource([]); setBps([]); setFrames([]); setScope([]); setEnded(false); }
/** Debugger.* events. */
export function onDebugger(method: string, params: any): void {
  if (method === 'Debugger.scriptParsed') {
    const s = new Script();
    s.id = params.scriptId; s.url = params.url;
    const l = scripts().slice(0); l.push(s); setScripts(l);
    if (script() === '') openScript(s.id);
  } else if (method === 'Debugger.paused') {
    setPaused(true);
    setFrames(framesOf(params));
    showFrame(0);
  } else if (method === 'Debugger.resumed') setPaused(false);
}
async function openScript(id: string): Promise<void> {
  if (conn.c === null) return;
  setScript(id);
  const r = await call('Debugger.getScriptSource', `{"scriptId":${JSON.stringify(id)}}`);
  const t: string = r.scriptSource !== undefined ? r.scriptSource : '';
  setSource(t.split('\n'));
}
function urlOf(id: string): string { for (const s of scripts()) if (s.id === id) return s.url; return ''; }
function nameOf(id: string): string { for (const s of scripts()) if (s.id === id) return s.name(); return id; }
/** Sets a breakpoint on a line of the shown script (with the condition typed, if any), or removes the one there. */
async function toggleBp(line: i32): Promise<void> {
  if (conn.c === null) return;
  for (const b of bps()) if (b.line === line) {
    await call('Debugger.removeBreakpoint', `{"breakpointId":${JSON.stringify(b.id)}}`);
    setBps(bps().filter((x: Bp) => x.line !== line));
    return;
  }
  const r = await call('Debugger.setBreakpointByUrl', `{"url":${JSON.stringify(urlOf(script()))},"lineNumber":${line - 1}${cond().length > 0 ? ',"condition":' + JSON.stringify(cond()) : ''}}`);
  if (r.breakpointId === undefined) { setStatus('no code at line ' + line); return; }
  const b = new Bp();
  b.id = r.breakpointId;
  const at: i32 = r.locations[0].lineNumber;
  b.line = at + 1;
  const l = bps().slice(0); l.push(b); setBps(l);
}
async function run(): Promise<void> { if (conn.c === null) return; setWaiting(false); setStatus('running'); await call('Runtime.runIfWaitingForDebugger', '{}'); }
async function command(method: string): Promise<void> { if (conn.c !== null) await call(method, '{}'); }
async function showFrame(i: i32): Promise<void> {
  const fs = frames();
  if (i >= fs.length || conn.c === null) return;
  setFrameIx(i);
  const f = fs[i];
  if (f.script !== script()) await openScript(f.script);
  const lines: ScopeLine[] = [];
  for (let k = 0; k < f.scopes.length; k++) {
    lines.push(scopeLine(0, f.scopeNames[k], '', '', false));
    for (const p of propsOf(await call('Runtime.getProperties', `{"objectId":${JSON.stringify(f.scopes[k])}}`))) lines.push(scopeLine(1, p.name, p.value, p.objectId, false));
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
  if (s.objectId === '' || conn.c === null) return;
  let end = at + 1;
  while (end < l.length && l[end].depth > s.depth) end++;
  const kids: ScopeLine[] = [];
  if (!s.open) for (const p of propsOf(await call('Runtime.getProperties', `{"objectId":${JSON.stringify(s.objectId)}}`))) kids.push(scopeLine(s.depth + 1, p.name, p.value, p.objectId, false));
  setScope(l.slice(0, at).concat([scopeLine(s.depth, s.name, s.value, s.objectId, !s.open)]).concat(kids).concat(l.slice(end)));
}
async function evalWatches(): Promise<void> {
  if (conn.c === null || !paused() || frames().length === 0) { setWatchVals([]); return; }
  const out: string[] = [];
  const id = frames()[frameIx()].id;
  for (const w of watches()) {
    const r = await call('Debugger.evaluateOnCallFrame', `{"callFrameId":${JSON.stringify(id)},"expression":${JSON.stringify(w)}}`);
    out.push(r.exceptionDetails !== undefined ? 'error: ' + remoteText(r.result) : remoteText(r.result));
  }
  setWatchVals(out);
}

function SourceLine(p: { n: i32; text: string }): i32 {
  const here = (): boolean => paused() && frames().length > 0 && frames()[frameIx()].line === p.n && frames()[frameIx()].script === script();
  const bp = (): boolean => bps().some((b: Bp) => b.line === p.n);
  return <Button className={'px-2 py-1 flex-row items-center justify-start h-5 ' + (here() ? 'bg-amber-100' : 'bg-white')} onClick={() => { toggleBp(p.n); }}>
    <Text className={'w-5 text-xs ' + (bp() ? 'text-red-600' : 'text-white')}>●</Text>
    <Text className="w-8 text-xs font-mono text-slate-400">{'' + p.n}</Text>
    <Text className="text-xs font-mono text-slate-800 whitespace-pre">{p.text}</Text>
  </Button>;
}

export function SourcesView(): i32 {
  return <View className="flex-col flex-1 min-h-0">
    <View className="flex-row flex-wrap items-center gap-1 p-1 border-b">
      {waiting() ? <Btn label="Run" onClick={() => { run(); }} /> : <View />}
      <Btn label="Resume" onClick={() => { command('Debugger.resume'); }} />
      <Btn label="Over" onClick={() => { command('Debugger.stepOver'); }} />
      <Btn label="Into" onClick={() => { command('Debugger.stepInto'); }} />
      <Btn label="Out" onClick={() => { command('Debugger.stepOut'); }} />
      <Btn label="Pause" onClick={() => { command('Debugger.pause'); }} />
      <Input className="bg-slate-800 border-slate-600 py-1.5 text-slate-100 w-40 h-7 px-2 text-xs font-mono border rounded" value={cond()} onInput={(v: string) => { setCond(v); }} />
      <Text className="text-xs text-slate-500">{ended() ? 'ended' : paused() ? 'paused' : waiting() ? 'waiting' : 'running'}</Text>
    </View>
    <View className="flex-row flex-wrap gap-1 px-1 border-b">{scripts().map((s: Script) => <Button className={'py-1 h-6 px-2 rounded ' + (script() === s.id ? 'bg-slate-300' : 'bg-slate-50')} onClick={() => { openScript(s.id); }}><Text className="text-xs text-slate-800">{s.name()}</Text></Button>)}</View>
    <ScrollView className="flex-1 overflow-auto">
      <View className="flex-col">{source().map((t: string, i: i32) => <SourceLine n={i + 1} text={t} />)}</View>
    </ScrollView>
  </View>;
}

/** The right column of a debugger target: the stack, the scopes, the watches. */
export function DebugPane(): i32 {
  return <View className="flex-col gap-1 p-2">
    <Text className="text-xs font-medium text-slate-600">Call stack</Text>
    {frames().map((f: Frame, i: i32) => <Button className={'py-1 flex-row justify-start h-6 px-1 rounded ' + (frameIx() === i ? 'bg-sky-100' : 'bg-white')} onClick={() => { showFrame(i); }}>
      <Text className="text-xs font-mono text-slate-800">{f.name + ' ' + nameOf(f.script) + ':' + f.line}</Text></Button>)}
    <Text className="text-xs font-medium text-slate-600">Scope</Text>
    {scope().map((s: ScopeLine, i: i32) => <Button className="px-2 py-1 flex-row justify-start h-5 rounded bg-white" style={{ paddingLeft: s.depth * 12 }} onClick={() => { unfold(i); }}>
      <Text className={'text-xs font-mono ' + (s.depth === 0 ? 'font-medium text-slate-600' : 'text-slate-800')}>{s.depth === 0 ? s.name : (s.objectId !== '' ? (s.open ? '- ' : '+ ') : '') + s.name + ': ' + s.value}</Text></Button>)}
    <Text className="text-xs font-medium text-slate-600">Watch</Text>
    {watches().map((w: string, i: i32) => <Text className="text-xs font-mono text-slate-800">{w + ' = ' + (i < watchVals().length ? watchVals()[i] : '')}</Text>)}
    <Input className="bg-slate-800 border-slate-600 py-1.5 text-slate-100 h-7 px-2 text-xs font-mono border rounded" value={watchDraft()} onInput={(v: string) => { setWatchDraft(v); }} />
    <Btn label="Add watch" onClick={() => { const l = watches().slice(0); l.push(watchDraft()); setWatches(l); setWatchDraft(''); evalWatches(); }} />
  </View>;
}

/** A command that runs the program on, then the next stop shown. */
async function stepped(what: string, method: string): Promise<void> {
  const n = stops();
  if (method === 'run') await run(); else await command(method);
  await until(() => stops() > n);
  console.log(what + ': ' + frames().map((f: Frame) => f.name + ' ' + nameOf(f.script) + ':' + f.line).join(', '));
}
/** ZINC_INSPECTOR_DUMP: a session of the Sources view against zinc debug --cdp (tests/data/debug_cli/main.ts). */
export async function dumpDebugger(): Promise<void> {
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
