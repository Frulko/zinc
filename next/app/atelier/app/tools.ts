// The zinc binary Atelier runs on, driven through zinc:process: run, debug and stop of the sketch with everything the
// child prints streamed into the console as it arrives, `zinc check` for the diagnostics, `zinc plugins` for the libraries.
// The sketch runs on this machine or on a paired device (ZN-729.06): there it is `zinc device <name> deploy`, which packs it,
// installs it, starts it and follows its log, and Stop is `zinc device <name> stop`.
// The binary is $ZINC_BIN (the zinc that started Atelier exports it), else `zinc` on the PATH.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import { setClipboardText } from 'zinc:gfx';
import { Spring } from './motion';
import { Buffer, Diagnostic, buffers, saveAll, sketchDir, sketchName, mainFile, openFile, say, APP_HOME } from './workspace';
import { parseDiagnostics, Diag, stepOf } from '../model';

export const ZINC: string = sys.env('ZINC_BIN') !== '' ? sys.env('ZINC_BIN') : 'zinc';
/** The variables of a scripted or captured run of Atelier itself that its children must not inherit (they would write the same files). */
const SCRUB: string[] = ['ZINC_SHOT', 'ZINC_SHOT_FRAMES', 'ZINC_INPUT', 'ZINC_SIZE', 'ZINC_SYSTEM_SCRIPT', 'ZINC_SYSTEM_LOG', 'ZINC_ATELIER_SCRIPT',
  'ZINC_RUN'];   // nor the engine Atelier itself was started on (`zinc run --interp`, `zinc dev`): the sketch runs on the one its menu names
export function spawnZinc(args: string[], cwd: string): proc.Process { return zinc(args, cwd); }
export function zinc(args: string[], cwd: string): proc.Process {
  const a: string[] = [];
  for (const v of SCRUB) { a.push('-u'); a.push(v); }
  a.push('ZINC_STEPS=' + (args[0] === 'run' || args[0] === 'dev' || args[0] === 'export' || args.indexOf('deploy') > 0 ? '1' : '0'));   // the steps of a build are what the console shows; a check or a list is read whole
  a.push(ZINC);
  return proc.spawn('/usr/bin/env', a.concat(args), { cwd: cwd });
}

const echo: boolean = sys.env('ZINC_ATELIER_ECHO') !== '';   // tests read the console and the status line on Atelier's own output

// ---------------------------------------------------------------- console
export const K_OUT: i32 = 0, K_STAGE: i32 = 1, K_ERR: i32 = 2, K_CMD: i32 = 3, K_END: i32 = 4;
/** One console line. A line that names a place in a file (`main.ts:12:5: ...`) carries it: a click opens it there. */
export class Line {
  text: string; kind: i32;
  file: string = ''; line: i32 = 0; col: i32 = 0;   // 1-based, 0: no place
  p0: i32 = 0; p1: i32 = 0;                         // where the place is written in `text`: the link of the line
  code: string = ''; message: string = '';          // of a diagnostic (`error Z0103: message`): shown as a card
  constructor(text: string, kind: i32) { this.text = text; this.kind = kind; }
}
const MAX_LINES: i32 = 600;
export const [lines, setLines] = createSignal<Line[]>([]);
let buf: Line[] = [];
/** Frames left to keep the end of the output in view (its height is known after the next layout). */
let follow: i32 = 0;
export function takeFollow(): boolean { if (follow <= 0) return false; follow--; return true; }

export const [consoleOpen, setConsoleOpen] = createSignal<boolean>(false);
export const CONSOLE_HEIGHT: number = 228;
/** Rendered height of the console under the status line (0 while it is only that line). */
export const consoleH = new Spring(0, 260, 30);
export function showConsole(on: boolean): void { setConsoleOpen(on); consoleH.to(on ? CONSOLE_HEIGHT : 0); }

function isDigit(c: i32): boolean { return c >= 48 && c <= 57; }
/** Finds `name.ts:line[:col]` in a line: [start of the name, end of the place], or [] when it has none. */
function place(s: string): i32[] {
  for (const ext of ['.tsx:', '.ts:', '.js:']) {
    let k = s.indexOf(ext);
    while (k >= 0) {
      let e = k + ext.length;
      if (e < s.length && isDigit(s.charCodeAt(e))) {
        let a = k;
        while (a > 0 && s.charCodeAt(a - 1) !== 32 && s.charCodeAt(a - 1) !== 40 && s.charCodeAt(a - 1) !== 34) a--;
        while (e < s.length && (isDigit(s.charCodeAt(e)) || (s.charCodeAt(e) === 58 && e + 1 < s.length && isDigit(s.charCodeAt(e + 1))))) e++;
        return [a, e];
      }
      k = s.indexOf(ext, k + 1);
    }
  }
  return [];
}
/** A console line from what a child printed: stage lines of the build, diagnostics, places. */
export function classify(text: string, stderr: boolean): Line {
  const l = new Line(text, stderr ? K_ERR : K_OUT);
  // the steps a command prints ("  compile    4 files, 34 functions   44 ms"), its notes and its progress among them: never errors,
  // though they arrive on the standard error
  if (stepOf(text).length > 0) l.kind = K_STAGE;
  const d: Diag[] = parseDiagnostics(text);
  const p = place(text);
  if (p.length > 0) { l.p0 = p[0]; l.p1 = p[1]; }
  if (d.length > 0) { l.kind = K_ERR; l.file = d[0].file; l.line = d[0].line; l.col = d[0].col; l.code = d[0].code; l.message = d[0].message; return l; }
  if (p.length > 0) {
    const parts = text.slice(p[0], p[1]).split(':');
    l.file = parts[0]; l.line = parseInt(parts[1]); l.col = parts.length > 2 ? parseInt(parts[2]) : 1;
  }
  return l;
}
/** `over`: the line takes the place of the last one (a step that says where it is, again and again). */
function add(l: Line, over: boolean = false): void {
  if (over && buf.length > 0) buf[buf.length - 1] = l; else buf.push(l);
  if (buf.length > MAX_LINES) buf = buf.slice(buf.length - MAX_LINES);
  setLines(buf.slice());
  follow = 2;
  if (echo) console.log('[console] ' + l.text);
}
export function clearConsole(): void { buf = []; setLines([]); }
export function consoleText(): string { return buf.map((l: Line) => l.text).join('\n'); }
/** The whole console on the clipboard (the Copy control of the console, Tools > Copy the Console). */
export function copyConsole(): void { if (buf.length === 0) return; setClipboardText(consoleText()); say(`Copied the console: ${buf.length} line${buf.length > 1 ? 's' : ''}`); }

/** Opens the file a console line names, at its line and column. `go` is set by the editor (it owns the caret). */
let go: (b: Buffer, line: i32, col: i32) => void = (b: Buffer, line: i32, col: i32) => {};
export function setJump(f: (b: Buffer, line: i32, col: i32) => void): void { go = f; }
export function jump(l: Line): void {
  if (l.line <= 0) return;
  const path = l.file.startsWith('/') ? l.file : sketchDir() + '/' + l.file;
  const b = openFile(path);
  if (b !== null) go(b as Buffer, l.line, l.col);
}

// ---------------------------------------------------------------- run, debug, stop
export const IDLE: i32 = 0, BUILDING: i32 = 1, RUNNING: i32 = 2;
export const [phase, setPhase] = createSignal<i32>(IDLE);
/** The step of the build under way ('compile', 'native', 'link'...), shown in the run control. */
export const [stage, setStage] = createSignal<string>('');
/** Whole seconds since the program started. */
export const [seconds, setSeconds] = createSignal<i32>(0);
export const [debugging, setDebugging] = createSignal<boolean>(false);
/** The status line: what happened last. kind 0 quiet, 1 good, 2 bad. */
export const [status, setStatusText] = createSignal<string>('Ready');
export const [statusKind, setStatusKind] = createSignal<i32>(0);
function setStatus(s: string, kind: i32): void { setStatusText(s); setStatusKind(kind); if (echo) console.log('[status] ' + s); }

/** How the sketch runs: the choices of the run control's menu and their `zinc run` arguments. */
export const ENGINES: string[] = ['Native', 'Interpreter', 'QuickJS', 'ESP32 emulator'];
const ENGINE_ARGS: string[][] = [[], ['--interp'], ['--engine', 'quickjs'], ['--target', 'esp32', '--qemu']];
export const [engine, setEngine] = createSignal<i32>(0);
/** The paired device Run sends the sketch to (its name); '': this machine, as `engine` says. */
export const [device, setDevice] = createSignal<string>('');

let child: proc.Process | null = null;
let startedAt: number = 0, stopped = false;
let again: i32 = -1;   // a run asked while one was ending: 0 run, 1 debug
// a run on a device: its name, the name the sketch got there once it is started, the status its log ended with, what the CLI refused
let remote = '', app = '', ended: i32 = -1, refused = '';

function nowRunning(): void {
  setPhase(RUNNING); startedAt = sys.clock(); setSeconds(0);
  setStatus((debugging() ? 'Debugging' : 'Running') + (remote !== '' ? ' on ' + remote : ''), 1);
}
/** A line of `zinc device <name> deploy` that is about the device, not from the program: true when it is dealt with. */
function deviceLine(text: string): boolean {
  if (text.startsWith('zinc device: ')) { refused = text.slice(13); return false; }
  if (app !== '') {
    // the followed log never ends by itself; `[exited <status>]` is the agent's last line of a run: nothing more to follow
    // ponytail: a program that prints this very line ends its own run here; ask the agent for the app's state if that ever matters
    if (!text.startsWith('[exited ')) return false;
    ended = parseInt(text.slice(8));
    if (child !== null) (child as proc.Process).kill();
    return true;
  }
  const step = text.startsWith('packed ') ? 'send' : text.startsWith('installed ') ? 'start' : text.startsWith('started ') ? 'run' : '';
  if (step === '') return false;
  add(new Line(text, K_STAGE));
  if (step !== 'run') { setStage(step); return true; }
  app = text.slice(8, text.indexOf(' on '));
  nowRunning();
  return true;
}

function onLine(text: string, stderr: boolean): void {
  if (text.startsWith('zinc run ') || text.startsWith('zinc dev ')) return;   // the command, already shown
  if (remote !== '' && deviceLine(text)) return;
  // `zinc dev` of a program with an interface: "zinc devtools: chrome://inspect (Discover network targets: localhost:9229) or ws://..."
  const dt = text.startsWith('zinc devtools:') ? text.indexOf('localhost:') : -1;
  if (dt > 0 && debugging()) { if (remote !== '') inspectThere(); else { setInspectorPort(parseInt(text.slice(dt + 10))); openInspector(); } }
  const l = classify(text, stderr);
  let over = false;
  if (l.kind === K_STAGE) {
    const step = stepOf(text), name = step[0];
    if (name === 'run' || name === 'dev') nowRunning();
    else if (phase() === BUILDING && name !== 'zinc') setStage(name);
    // the transfer to a device, live: "Sending to spark: 45%, 16 MiB of 35 MiB, 2.1 MiB/s"
    if (name === 'send' && remote !== '' && phase() === BUILDING) setStatus(`Sending to ${remote}: ${step[1]}`, 0);
    // a step said again is one line that updates: the progress of a transfer or of the native builds, "compile ..." then its result
    const last = buf.length > 0 ? buf[buf.length - 1] : null;
    over = last !== null && (last as Line).kind === K_STAGE && stepOf((last as Line).text).length > 0 && stepOf((last as Line).text)[0] === name;
  } else if (phase() === BUILDING && l.kind === K_OUT) nowRunning();   // a program that prints before any step line
  add(l, over);
  if (l.kind !== K_STAGE && !consoleOpen()) showConsole(true);
}

/** Saves the sketch, then builds and runs it (`debug`: under `zinc dev`, with the inspector). A program still running is stopped first.
 *  With a device chosen the sketch goes there under its folder's name; `debug` builds it with the inspector in front, as `zinc dev` does
 *  here (`deploy --inspect`), and brings that inspector to this machine when the sketch says it listens. */
export function run(debug: boolean = false): void {
  if (child !== null) { again = debug ? 1 : 0; stop(); return; }
  const dir = sketchDir(), main = mainFile(dir);
  if (dir === '' || main === '') { setStatus('Nothing to run: this sketch has no code file', 2); return; }
  saveAll();
  clearConsole();
  remote = device(); app = ''; ended = -1; refused = '';
  const args: string[] = remote !== '' ? ['device', remote, 'deploy', '.', '--name', sketchName()].concat(debug ? ['--inspect'] : []) : [debug ? 'dev' : 'run', main].concat(debug ? [] : ENGINE_ARGS[engine()]);
  add(new Line('$ zinc ' + args.join(' '), K_CMD));
  stopped = false;
  setDebugging(debug); setPhase(BUILDING); setStage('starting'); setStatus('Building', 0);
  try {
    const p = zinc(args, dir);
    child = p;
    p.onStdout((l: string) => onLine(l, false));
    p.onStderr((l: string) => onLine(l, true));
    p.onExit((code: i32) => {
      child = null;
      const ran = phase() === RUNNING;
      const lost = app !== '' && ended < 0 && !stopped;   // the follower ended before the program did: the device went away
      if (ended >= 0) code = ended;
      setPhase(IDLE); setStage(''); setDebugging(false); closeInspector();
      if (stopped) setStatus('Stopped', 0);
      else if (lost) { setStatus(`Lost ${remote}: the sketch may still run there`, 2); showConsole(true); }
      else if (code === 0) setStatus('Finished', 1);
      else { setStatus(ran ? `Exited with code ${code}` : refused !== '' ? `${remote}: ${refused}` : 'Build failed', 2); showConsole(true); }
      add(new Line(stopped ? 'stopped' : `exit ${code}`, K_END));
      const next = again;
      again = -1;
      if (next >= 0) run(next === 1);
    });
  } catch (e) {
    child = null; setPhase(IDLE);
    setStatus('Cannot start zinc', 2);
    add(new Line(`${ZINC}: ${(e as Error).message}`, K_ERR));
    showConsole(true);
  }
}
/** Build App: the app for this machine (`zinc export`: the program, its bundle on a Mac, in dist/), the steps of the build in the console
 *  and where the app is on the status line. */
export function build(): void {
  if (child !== null) { say('Stop the sketch first: one build at a time'); return; }
  const dir = sketchDir();
  if (dir === '' || mainFile(dir) === '') { setStatus('Nothing to build: this sketch has no code file', 2); return; }
  saveAll();
  clearConsole();
  remote = ''; app = ''; ended = -1; refused = ''; stopped = false;
  add(new Line('$ zinc export .', K_CMD));
  setDebugging(false); setPhase(BUILDING); setStage('starting'); setStatus('Building the app', 0);
  let made = '';
  try {
    const p = zinc(['export', '.'], dir);
    child = p;
    // every line is the build's: what export prints last on its standard output is the folder it wrote
    p.onStdout((l: string) => { if (l.trim() !== '') made = l.trim(); add(classify(l, false)); });
    p.onStderr((l: string) => { const c = classify(l, true), s = stepOf(l); if (s.length > 0) setStage(s[0]); add(c, s.length > 0 && buf.length > 0 && stepOf(buf[buf.length - 1].text).length > 0 && stepOf(buf[buf.length - 1].text)[0] === s[0]); if (c.kind === K_ERR) showConsole(true); });
    p.onExit((code: i32) => {
      child = null;
      setPhase(IDLE); setStage('');
      if (stopped) setStatus('Stopped', 0);
      else if (code === 0) setStatus(`Built ${made.startsWith(dir + '/') ? made.slice(dir.length + 1) : made}`, 1);
      else { setStatus('Build failed', 2); showConsole(true); }
      add(new Line(stopped ? 'stopped' : `exit ${code}`, K_END));
    });
  } catch (e) {
    child = null; setPhase(IDLE);
    setStatus('Cannot start zinc', 2);
    add(new Line(`${ZINC}: ${(e as Error).message}`, K_ERR));
    showConsole(true);
  }
}
// ---- Debug: the sketch runs under `zinc dev` (it restarts at every save, a compile error stays on its screen) and, when it
// has an interface, the Zinc Inspector (the app beside this one) opens on its DevTools port: elements, styles, console, frames.
/** The port of the running sketch's inspector, 0 when it has none. */
export const [inspectorPort, setInspectorPort] = createSignal<i32>(0);
let inspector: proc.Process | null = null;
export function openInspector(): void {
  if (inspectorPort() === 0 || inspector !== null) return;
  const app = APP_HOME + '/../inspector/main.tsx';
  if (APP_HOME === '' || !fs.exists(app)) { add(new Line(`inspector: chrome://inspect, Discover network targets: localhost:${inspectorPort()}`, K_STAGE)); return; }
  try {
    const p = zinc(['run', app, '--', `${inspectorPort()}`], '');
    inspector = p;
    add(new Line(`inspector: opened on port ${inspectorPort()}`, K_STAGE));
    p.onStdout((l: string) => { add(new Line('inspector: ' + l, K_STAGE)); });
    p.onExit((code: i32) => { if (inspector === p) inspector = null; });
  } catch (e) { inspector = null; }
}
/** Tools > Open the Inspector. It belongs to a debug run: one that has it shows it, a plain run (or no run) starts again in debug, which
 *  opens it by itself, here or on the device. */
export function inspect(): void {
  if (inspectorPort() > 0) { openInspector(); return; }
  if (child !== null && debugging()) { say('No inspector yet: it opens when the sketch shows an interface (zinc:ui)'); return; }
  say(child !== null ? 'Starting the sketch again in debug: the inspector opens with it' : 'Starting the sketch in debug: the inspector opens with it');
  run(true);
}
/** The inspector of the sketch running on a device, on a port of this machine: `zinc device <name> inspect <app>` forwards it until the run ends. */
let forward: proc.Process | null = null;
function inspectThere(): void {
  if (forward !== null) return;
  try {
    const p = zinc(['device', remote, 'inspect', app], '');
    forward = p;
    p.onStdout((l: string) => { const at = l.indexOf('ws://127.0.0.1:'); if (at >= 0 && forward === p) { setInspectorPort(parseInt(l.slice(at + 15))); openInspector(); } });
    p.onStderr((l: string) => { if (forward === p && !stopped) add(new Line(l, K_ERR)); });   // not what it says while the sketch is being ended
    p.onExit((code: i32) => { if (forward === p) forward = null; });
  } catch (e) { forward = null; }
}
function closeInspector(): void {
  const p = inspector, f = forward;
  inspector = null; forward = null;
  setInspectorPort(0);
  if (p !== null) (p as proc.Process).kill();
  if (f !== null) (f as proc.Process).kill();
}

let killAt: number = 0;
/** Ends the program (or the build): SIGTERM, then SIGKILL two seconds later if it is still there. A sketch started on a
 *  device is ended there: the child here only follows its log, and ends with it. */
export function stop(): void {
  const c = child;
  if (c === null) return;
  stopped = true;
  if (app !== '') {
    try {
      const p = zinc(['device', remote, 'stop', app], '');
      p.onStderr((l: string) => { add(new Line(l, K_ERR)); });   // the device did not answer: the sketch may still run there
      p.onExit((code: i32) => { if (child === c) (c as proc.Process).kill(); });
      return;
    } catch (e) { /* no zinc to ask: end the follower at least */ }
  }
  (c as proc.Process).kill();
  killAt = sys.clock() + 2000;
}
export function running(): boolean { return child !== null; }
/** Atelier is leaving: the sketch (or its build) and the inspector end with it. */
export function stopAll(): void {
  if (echo) console.log('[status] Leaving');
  stop();
  closeInspector();
}

const sync: boolean = sys.env('ZINC_ATELIER_SYNC') !== '';   // tests: a frame waits for the child to end, so a scripted session does not depend on timing
const pace: i32 = sys.env('ZINC_ATELIER_PACE') !== '' ? parseInt(sys.env('ZINC_ATELIER_PACE')) : 0;   // tests: a headless frame lasts up to this many ms, so a child has the time to run
/** Once per frame: the clock of the run control, the hard stop, and the wait of scripted sessions. */
export function stepTools(): void {
  if (sync) { let n = 0; while ((child !== null || checks > 0) && n++ < 6000) sys.poll(5); }
  else if (pace > 0) sys.poll(pace);
  if (child === null) return;
  if (phase() === RUNNING) { const s: i32 = Math.floor((sys.clock() - startedAt) / 1000); if (s !== seconds()) setSeconds(s); }
  if (stopped && killAt > 0 && sys.clock() > killAt) { killAt = 0; (child as proc.Process).kill(9); }
}

// ---------------------------------------------------------------- diagnostics
let checks: i32 = 0;      // short jobs under way (a check, the list of libraries): a scripted session waits for them
let checkGen: i32 = 0;
/** Type checks the sketch as saved (`zinc check <main file>`) and gives every open file its diagnostics: squiggles and gutter
 *  dots in the editor, the first message on the status line. */
export function check(): void {
  const dir = sketchDir(), main = mainFile(dir);
  if (dir === '' || main === '' || child !== null) return;
  const gen = ++checkGen;
  checks++;
  let out = '';
  try {
    const p = zinc(['check', main], dir);
    p.onData((chunk: string, stderr: boolean) => { out += chunk; });
    p.onExit((code: i32) => {
      checks--;
      if (gen !== checkGen) return;   // a newer check is running
      const all: Diag[] = parseDiagnostics(out);
      for (const b of buffers()) {
        const mine: Diagnostic[] = [];
        for (const d of all) if ((d.file.startsWith('/') ? d.file : dir + '/' + d.file) === b.path) mine.push(new Diagnostic(d.line - 1, d.col - 1, 1, d.message));
        if (!b.modified()) b.setDiagnostics(mine);   // a file edited since has newer ones from the language server
      }
      if (phase() !== IDLE) return;
      if (all.length === 0) {
        // what the engine refuses in zinc.json itself: "zinc: <path>/zinc.json: line 4: app.id is required (...)"
        const at = out.indexOf('zinc.json: line ');
        if (at >= 0) { const end = out.indexOf('\n', at); setStatus(out.slice(at, end < 0 ? out.length : end), 2); }
        else if (statusKind() === 2) setStatus('No problems', 1);
      }
      else setStatus(`${all.length} problem${all.length > 1 ? 's' : ''}: ${all[0].file}:${all[0].line} ${all[0].message}`, 2);
    });
  } catch (e) { checks--; }
}

/** The status line for the diagnostics the open files hold: the language server sends them as one types. */
export function problems(): void {
  if (phase() !== IDLE) return;
  const dir = sketchDir();
  let n: i32 = 0, first = '';
  for (const b of buffers()) for (const d of b.diagnostics()) if (n++ === 0) first = `${b.path.startsWith(dir + '/') ? b.path.slice(dir.length + 1) : b.name}:${d.line + 1} ${d.message}`;
  const s = n === 0 ? 'No problems' : `${n} problem${n > 1 ? 's' : ''}: ${first}`;
  if (s !== status() && (n > 0 || statusKind() === 2)) setStatus(s, n > 0 ? 2 : 1);
}

// ---------------------------------------------------------------- libraries
export class Library {
  name: string; text: string;
  constructor(name: string, text: string) { this.name = name; this.text = text; }
}
export const [libraries, setLibraries] = createSignal<Library[]>([]);
/** Reads the plugins the CLI lists for the sketch (`zinc plugins <dir>`): the ones a program imports (`zinc:name`, `three`). */
export function loadLibraries(): void {
  if (libraries().length > 0) return;
  let out = '';
  try {
    const p = zinc(['plugins', sketchDir() === '' ? '.' : sketchDir()], '');
    checks++;
    p.onData((chunk: string, stderr: boolean) => { out += chunk; });
    p.onExit((code: i32) => {
      checks--;
      const list: Library[] = [];
      let table = false;
      for (const l of out.split('\n')) {
        if (l.startsWith('plugin (')) { table = true; continue; }   // the header of the table
        if (!table || !l.startsWith('  ') || l.startsWith('  display:')) continue;
        const t = l.trim(), sp = t.indexOf(' ');
        if (sp < 0) continue;
        // name, targets, description: columns separated by runs of spaces
        const rest = t.slice(sp).trim(), sp2 = rest.indexOf(' ');
        list.push(new Library(t.slice(0, sp), sp2 < 0 ? '' : rest.slice(sp2).trim()));
      }
      setLibraries(list);
    });
  } catch (e) { say('Cannot list the libraries'); }
}
/** The import line of a library: `import * as audio from 'zinc:audio';` */
export function importLine(name: string): string {
  let id = name.startsWith('zinc:') ? name.slice(5) : name;
  id = id.split('/')[0].split('-').join('_');
  return `import * as ${id === '3d' ? 'z3d' : id} from '${name}';`;
}

// ---------------------------------------------------------------- updates
// `zinc update --check`, then `zinc update` when asked: the zinc CLI installed with install.sh replaces itself (its next start is the new one);
// the zinc inside the Zinc Atelier app does not, and says so: the app is updated by downloading its new zip (docs/guide/07-distribution.md).
export const [updateReady, setUpdateReady] = createSignal<boolean>(false);
export function updates(install: boolean): void {
  let out = '';
  try {
    const p = zinc(install ? ['update'] : ['update', '--check'], '');
    checks++;
    setStatus(install ? 'Installing the update…' : 'Checking for updates…', 0);
    p.onData((chunk: string, stderr: boolean) => { out += chunk; });
    p.onExit((code: i32) => {
      checks--;
      const ls = out.trim().split('\n');
      const last = ls[ls.length - 1];
      setUpdateReady(!install && code === 10);
      if (code === 10) setStatus(ls[0] + ': Help > Install the Update', 0);
      else if (code === 0) setStatus(install ? last + '; restart Atelier to use it' : ls[0], 1);
      else setStatus('Update: ' + last, 2);
    });
  } catch (e) { setStatus('Cannot run zinc update', 2); }
}
