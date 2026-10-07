// Zinc Atelier: the desktop app of Zinc. A project browser, a text editor with diagnostics, run and stop, a device panel (the emulated ESP32)
// and the profiler views, written with zinc:ui and run by the engine it drives. Usage: zinc run app/atelier/main.tsx -- <project dir>
import { createSignal, render } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import * as sys from 'zinc:sys';
import { Diag, Hot, Phase, parseDiagnostics, hottest, tracePhases, projectFiles } from './model';

const args = sys.args();
const root: string = args.length > 0 ? args[0] : '.';
const zincBin: string = sys.env('ZINC_BIN') !== '' ? sys.env('ZINC_BIN') : 'zinc';

const [files, setFiles] = createSignal<string[]>(projectFiles(root));
const [current, setCurrent] = createSignal<string>('');
const [text, setText] = createSignal<string>('');
const [dirty, setDirty] = createSignal<boolean>(false);
const [tab, setTab] = createSignal<string>('output');
const [output, setOutput] = createSignal<string>('');
const [diags, setDiags] = createSignal<Diag[]>([]);
const [hot, setHot] = createSignal<Hot[]>([]);
const [phases, setPhases] = createSignal<Phase[]>([]);
const [status, setStatus] = createSignal<string>('ready');

function q(s: string): string { return "'" + s.split("'").join("'\\''") + "'"; }
function path(rel: string): string { return root + '/' + rel; }

// The one background job (a run, a check, a profile): its output streams into the output tab, `onDone` receives all of it.
let job: proc.Process | null = null;
let jobOut: string = '';
let jobDone: ((out: string, code: i32) => void) | null = null;

function start(label: string, args: string, done: ((out: string, code: i32) => void) | null): void {
  if (job !== null) { setStatus('busy: ' + label + ' not started'); return; }
  jobOut = '';
  jobDone = done;
  setOutput('$ zinc ' + args + '\n');
  setStatus(label + '…');
  const p = proc.spawn('/bin/sh', ['-c', 'exec 2>&1\n' + q(zincBin) + ' ' + args], {});
  job = p;
  p.onData((chunk: string, stderr: boolean) => { jobOut += chunk; setOutput(output() + chunk); });
  p.onExit((code: i32) => {
    job = null;
    setStatus(code === 0 ? 'done' : 'exit ' + code);
    const cb = jobDone;
    jobDone = null;
    if (cb !== null) cb(jobOut, code);
  });
}

const syncJobs: boolean = sys.env('ZINC_ATELIER_SYNC') !== '';  // tests: a frame waits for the job to end, so a scripted run does not depend on timing

function pump(): void {
  if (syncJobs) while (job !== null) sys.poll(5);
}

function openFile(rel: string): void {
  setCurrent(rel);
  setText(fs.readText(path(rel)));
  setDirty(false);
  setDiags([]);
}

function save(): void {
  if (current() === '') return;
  fs.writeText(path(current()), text());
  setDirty(false);
  setStatus('saved ' + current());
}

function check(): void {
  if (current() === '') return;
  save();
  start('check', 'check --check ' + q(path(current())), (out: string, code: i32) => {
    setDiags(parseDiagnostics(out));
    setTab(code === 0 ? 'output' : 'problems');
    if (code === 0) setOutput('no problems in ' + current() + '\n');
  });
}

function run(extra: string): void {
  if (current() === '') return;
  save();
  start('run', 'run ' + q(path(current())) + ' ' + extra + ' 2>&1', (out: string, code: i32) => {
    if (code !== 0) setDiags(parseDiagnostics(out));
  });
}

function profile(): void {
  if (current() === '') return;
  save();
  const folded = sys.env('TMPDIR') !== '' ? sys.env('TMPDIR') + '/atelier.folded' : '/tmp/atelier.folded';
  start('profile', 'profile ' + q(path(current())) + ' --folded ' + q(folded) + ' 2>&1', (out: string, code: i32) => {
    if (code === 0 && fs.exists(folded)) { setHot(hottest(fs.readText(folded), 12)); setTab('profile'); }
  });
}

function loadTrace(file: string): void {
  if (!fs.exists(file)) { setStatus('no such trace: ' + file); return; }
  setPhases(tracePhases(fs.readText(file)));
  setTab('frames');
}

function stop(): void { const j = job; if (j !== null) j.kill(); }

// The kit's props are read once; these rows and tabs use the host elements, whose class and text follow the signals.
function Btn(p: { label: string; kind: string; onClick: () => void }): i32 {
  const look = p.kind === 'primary' ? 'bg-slate-900' : p.kind === 'danger' ? 'bg-red-600' : 'bg-white border text-slate-900';
  return <Button class={'flex-row items-center justify-center h-8 px-3 rounded-md ' + look} onClick={p.onClick}>
    <Text class={'text-xs font-medium ' + (p.kind === 'plain' ? 'text-slate-900' : 'text-white')}>{p.label}</Text>
  </Button>;
}

function FileRow(p: { name: string }): i32 {
  return <Button class={'flex-row items-center justify-start h-8 px-2 rounded-md ' + (current() === p.name ? 'bg-slate-300' : 'bg-slate-100')} onClick={() => openFile(p.name)}>
    <Text class="text-sm text-slate-900">{p.name}</Text>
  </Button>;
}

function Tab(p: { id: string; label: () => string }): i32 {
  return <Button class={'flex-row items-center h-8 px-3 rounded-md ' + (tab() === p.id ? 'bg-slate-300' : 'bg-slate-50')} onClick={() => setTab(p.id)}>
    <Text class="text-xs font-medium text-slate-900">{p.label()}</Text>
  </Button>;
}

function lastLines(t: string, n: i32): string[] {
  const l = t.split('\n');
  return l.length > n ? l.slice(l.length - n) : l;
}

function Bar(p: { label: string; value: number; max: number }): i32 {
  return <View class="flex-row items-center gap-2">
    <Text class="w-40 text-xs text-slate-700">{p.label}</Text>
    <View class="h-3 bg-sky-500 rounded" style={{ width: Math.max(2, Math.round(p.value * 240 / Math.max(1, p.max))) }} />
    <Text class="text-xs text-slate-500">{'' + p.value}</Text>
  </View>;
}

function Panel(): i32 {
  return <View class="flex-col gap-1 p-2 h-48 bg-slate-50 border-t">
    <View class="flex-row gap-1">
      <Tab id="output" label={() => 'Output'} />
      <Tab id="problems" label={() => 'Problems ' + diags().length} />
      <Tab id="profile" label={() => 'Profile'} />
      <Tab id="frames" label={() => 'Frames'} />
    </View>
    <ScrollView class="flex-1">
      <View class="flex-col gap-1">
        {tab() === 'output' ? <View class="flex-col">{lastLines(output(), 300).map((l: string) => <Text class="text-xs font-mono text-slate-800">{l === '' ? ' ' : l}</Text>)}</View> : <View />}
        {tab() === 'problems' ? <View class="flex-col gap-1">{diags().map((d: Diag) => <Text class="text-xs text-red-700">{d.file.split('/').pop() + ':' + d.line + ':' + d.col + ' ' + d.code + ' ' + d.message}</Text>)}</View> : <View />}
        {tab() === 'profile' ? <View class="flex-col gap-1">{hot().map((h: Hot) => <Bar label={h.name} value={h.self} max={hot().length > 0 ? hot()[0].self : 1} />)}</View> : <View />}
        {tab() === 'frames' ? <View class="flex-col gap-1">{phases().map((p: Phase) => <Bar label={p.name} value={p.total} max={phases().length > 0 ? phases()[0].total : 1} />)}</View> : <View />}
      </View>
    </ScrollView>
  </View>;
}

function App(): i32 {
  return <View class="flex-row w-full h-full bg-white">
    <View class="flex-col w-56 gap-1 p-2 bg-slate-100 border-r">
      <Text class="text-lg font-bold text-slate-900">Zinc Atelier</Text>
      <Text class="text-xs text-slate-500">{root}</Text>
      <ScrollView class="flex-1">
        <View class="flex-col gap-1">{files().map((f: string) => <FileRow name={f} />)}</View>
      </ScrollView>
    </View>
    <View class="flex-col flex-1">
      <View class="flex-row items-center gap-2 p-2 border-b">
        <Btn label="Save" kind="plain" onClick={() => save()} />
        <Btn label="Check" kind="plain" onClick={() => check()} />
        <Btn label="Run" kind="primary" onClick={() => run('')} />
        <Btn label="ESP32 (emulated)" kind="plain" onClick={() => run('--target esp32 --qemu')} />
        <Btn label="Profile" kind="plain" onClick={() => profile()} />
        <Btn label="Stop" kind="danger" onClick={() => stop()} />
        <Text class="flex-1 text-sm text-slate-600">{(current() === '' ? 'no file' : current()) + (dirty() ? ' *' : '')}</Text>
        <Text class="px-2 text-xs font-medium text-slate-700">{status()}</Text>
      </View>
      <TextArea class="flex-1 p-2 font-mono text-sm" value={text()} onInput={(v: string) => { setText(v); setDirty(true); }} />
      <Panel />
    </View>
  </View>;
}

if (sys.env('ZINC_ATELIER_TRACE') !== '') loadTrace(sys.env('ZINC_ATELIER_TRACE'));
if (files().length > 0) openFile(files()[0]);
render(App, 0xffffff, (dt: number) => { pump(); });
