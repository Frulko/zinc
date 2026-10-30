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
import { Buffer, Diagnostic, buffers, saveAll, sketchDir, sketchName, mainFile, openFile, openSketch, sketchbook, say, APP_HOME } from './workspace';
import { parseDiagnostics, Diag, stepOf } from '../model';
import { t, tn, lang } from './text';

export const ZINC: string = sys.env('ZINC_BIN') !== '' ? sys.env('ZINC_BIN') : 'zinc';
/** The variables of a scripted or captured run of Atelier itself that its children must not inherit (they would write the same files). */
const SCRUB: string[] = ['ZINC_SHOT', 'ZINC_SHOT_FRAMES', 'ZINC_INPUT', 'ZINC_SIZE', 'ZINC_SYSTEM_SCRIPT', 'ZINC_SYSTEM_LOG', 'ZINC_ATELIER_SCRIPT',
  'ZINC_RUN'];   // nor the engine Atelier itself was started on (`zinc run --interp`, `zinc dev`): the sketch runs on the one its menu names
export function spawnZinc(args: string[], cwd: string): proc.Process { return zinc(args, cwd); }
/** The commands whose output the user reads in Atelier's language (D159); the others' output is parsed, so they speak English. */
const SPOKEN: string[] = ['run', 'dev', 'check', 'explain', 'new', 'export', 'learn'];
export function zinc(args: string[], cwd: string, env: string[] = []): proc.Process {
  const a: string[] = [];
  for (const v of SCRUB) { a.push('-u'); a.push(v); }
  a.push('ZINC_LANG=' + (SPOKEN.indexOf(args[0]) >= 0 ? lang() : 'en'));
  a.push('ZINC_STEPS=' + (args[0] === 'run' || args[0] === 'dev' || args[0] === 'export' || args[0] === 'pack' || args[0] === 'publish' || args.indexOf('deploy') > 0 ? '1' : '0'));   // the steps of a build are what the console shows; a check or a list is read whole
  a.push(ZINC);
  return proc.spawn('/usr/bin/env', a.concat(args), { cwd: cwd, env: env });
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
  c0: i32 = 0; c1: i32 = 0;                         // where an error code is written in `text` (`Z0103`): a click explains it
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
function isWord(c: i32): boolean { return isDigit(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95; }
/** Finds an error code (`Z0103`, a Z and four digits standing alone) in a line: [its start, its end], or [] when it has none. */
export function codeAt(s: string): i32[] {
  for (let k = s.indexOf('Z'); k >= 0; k = s.indexOf('Z', k + 1)) {
    if (k + 5 > s.length || (k > 0 && isWord(s.charCodeAt(k - 1))) || (k + 5 < s.length && isWord(s.charCodeAt(k + 5)))) continue;
    let n = 0;
    while (n < 4 && isDigit(s.charCodeAt(k + 1 + n))) n++;
    if (n === 4) return [k, k + 5];
  }
  return [];
}
/** A console line from what a child printed: stage lines of the build, diagnostics, places, error codes. */
export function classify(text: string, stderr: boolean): Line {
  const l = new Line(text, stderr ? K_ERR : K_OUT);
  const c = codeAt(text);
  if (c.length > 0) { l.c0 = c[0]; l.c1 = c[1]; }
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
export function copyConsole(): void { if (buf.length === 0) return; setClipboardText(consoleText()); say(tn('atelier.console.copied', buf.length)); }

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
/** The status line: what happened last, kept as its key, its count ('' for none) and its params, so that it follows the language.
 *  kind 0 quiet, 1 good, 2 bad. */
const [said, setSaid] = createSignal<string[]>(['atelier.run.ready', '']);
export const [statusKind, setStatusKind] = createSignal<i32>(0);
export function status(): string { const s = said(); return s[1] !== '' ? tn(s[0], parseFloat(s[1]), s.slice(2)) : t(s[0], s.slice(2)); }
function setStatus(key: string, kind: i32, params: string[] = [], count: number = -1): void {
  setSaid([key, count >= 0 ? `${count}` : ''].concat(params)); setStatusKind(kind);
  if (echo) console.log('[status] ' + status());
}

/** How the sketch runs: the choices of the run control's menu (their names are atelier.engine.<id>) and their `zinc run` arguments. */
export const ENGINE_IDS: string[] = ['native', 'interpreter', 'quickjs', 'esp32'];
export function engineName(i: i32): string { return t('atelier.engine.' + ENGINE_IDS[i]); }
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
  setStatus(remote !== '' ? (debugging() ? 'atelier.run.debugging_on' : 'atelier.run.running_on') : debugging() ? 'atelier.run.debugging' : 'atelier.run.running', 1, ['device', remote]);
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
    if (name === 'send' && remote !== '' && phase() === BUILDING) setStatus('atelier.device.sending', 0, ['device', remote, 'progress', step[1]]);
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
let runs: i32 = 0;
/** How many runs started since Atelier did (the tour waits for one). */
export function runCount(): i32 { return runs; }
export function run(debug: boolean = false): void {
  if (child !== null) { again = debug ? 1 : 0; stop(); return; }
  const dir = sketchDir(), main = mainFile(dir);
  if (dir === '' || main === '') { setStatus('atelier.run.nothing', 2); return; }
  runs++;
  saveAll();
  clearConsole();
  remote = device(); app = ''; ended = -1; refused = '';
  const args: string[] = remote !== '' ? ['device', remote, 'deploy', '.', '--name', sketchName()].concat(debug ? ['--inspect'] : []) : [debug ? 'dev' : 'run', main].concat(debug ? [] : ENGINE_ARGS[engine()]);
  add(new Line('$ zinc ' + args.join(' '), K_CMD));
  stopped = false;
  setDebugging(debug); setPhase(BUILDING); setStage('starting'); setStatus('atelier.run.building', 0);
  try {
    const p = zinc(args, dir);
    child = p;
    p.onStdout((l: string) => onLine(l, false));
    p.onStderr((l: string) => onLine(l, true));
    p.onExit((code: i32) => {
      child = null;
      if ((code === 126 || code === 127) && phase() === BUILDING && stage() === 'starting') { setStage(''); setDebugging(false); cannotStart(''); return; }   // env found no zinc to start
      const ran = phase() === RUNNING;
      const lost = app !== '' && ended < 0 && !stopped;   // the follower ended before the program did: the device went away
      if (ended >= 0) code = ended;
      setPhase(IDLE); setStage(''); setDebugging(false); closeInspector();
      if (stopped) setStatus('atelier.run.stopped', 0);
      else if (lost) { setStatus('atelier.device.lost', 2, ['device', remote]); showConsole(true); }
      else if (code === 0) setStatus('atelier.run.finished', 1);
      else {
        if (ran) setStatus('atelier.run.exited', 2, ['code', `${code}`]);
        else if (refused !== '') setStatus('atelier.device.refused', 2, ['device', remote, 'reason', refused]);
        else setStatus('atelier.run.build_failed', 2);
        showConsole(true);
      }
      add(new Line(stopped ? t('atelier.console.stopped') : `exit ${code}`, K_END));
      const next = again;
      again = -1;
      if (next >= 0) run(next === 1);
    });
  } catch (e) { cannotStart((e as Error).message); }
}
/** zinc did not start: where Atelier looked and what to do, on the status line and in the console. */
function cannotStart(why: string): void {
  child = null; setPhase(IDLE);
  setStatus('atelier.run.no_zinc', 2, ['path', ZINC]);
  if (why !== '') add(new Line(`${ZINC}: ${why}`, K_ERR));
  add(new Line(t('atelier.run.no_zinc_fix', ['path', ZINC]), K_STAGE));
  showConsole(true);
}
/** Build App: the app for this machine (`zinc export`: the program, its bundle on a Mac, in dist/), the steps of the build in the console
 *  and where the app is on the status line. */
export function build(): void { task('build', ['export', '.'], []); }
/** Share > Package: `zinc pack`, the .zapp that any machine with zinc runs (build/<name>.zapp). */
export function pack(): void { task('pack', ['pack', '.'], []); }
/** Share > Publish: `zinc publish` to the hub, signed with the app's key, for one machine (`target`: '' for any, rpi, rpi2, rpi1) on a channel.
 *  The seed and the hub's token go to zinc in its environment, never on a command line. */
export function publish(target: string, channel: string, hubUrl: string, token: string, seed: string): void {
  const args = ['publish', '.', '--channel', channel, '--hub', hubUrl].concat(target !== '' ? ['--target', target] : []);
  task('publish', args, ['ZINC_UPDATE_SEED=' + seed, 'ZINC_HUB_TOKEN=' + token]);
}
/** What the last build, pack or publish made: [its kind, its path from the sketch's folder ('' while none, or when it failed)]. */
export const [made, setMade] = createSignal<string[]>(['', '']);
/** The file a line of export, pack or publish names as what it made ('' for another line): export prints the folder alone,
 *  pack `packed <file> (5 files, 528896 bytes)`, publish `published <app> <version> on <channel>: <file>, <manifest>`. */
function madeOf(line: string): string {
  const l = line.trim();
  if (l === '') return '';
  if (l.startsWith('packed ')) { const e = l.lastIndexOf(' ('); return e > 7 ? l.slice(7, e) : l.slice(7); }
  if (l.startsWith('published ')) { const a = l.indexOf(': '), e = l.indexOf(', ', a), f = a < 0 ? '' : e > a ? l.slice(a + 2, e) : l.slice(a + 2); return f.startsWith('./') ? f.slice(2) : f; }
  return l.indexOf(' ') < 0 || l.startsWith('/') ? l : '';
}
/** One job of the Share page: its steps in the console, what it made on the status line (the last line it prints on its standard output). */
function task(kind: string, args: string[], env: string[]): void {
  if (child !== null) { say(t('atelier.build.busy')); return; }
  const dir = sketchDir();
  if (dir === '' || mainFile(dir) === '') { setStatus('atelier.build.nothing', 2); return; }
  saveAll();
  clearConsole();
  remote = ''; app = ''; ended = -1; refused = ''; stopped = false;
  add(new Line('$ zinc ' + args.join(' '), K_CMD));
  setDebugging(false); setPhase(BUILDING); setStage('starting'); setStatus('atelier.' + kind + '.building', 0);
  setMade([kind, '']);
  let made = '';
  try {
    const p = zinc(args, dir, env);
    child = p;
    // every line is the build's: what export prints last on its standard output is the folder it wrote
    p.onStdout((l: string) => { const w = madeOf(l); if (w !== '') made = w; add(classify(l, false)); });
    p.onStderr((l: string) => { const c = classify(l, true), s = stepOf(l); if (s.length > 0) setStage(s[0]); add(c, s.length > 0 && buf.length > 0 && stepOf(buf[buf.length - 1].text).length > 0 && stepOf(buf[buf.length - 1].text)[0] === s[0]); if (c.kind === K_ERR) showConsole(true); });
    p.onExit((code: i32) => {
      child = null;
      if ((code === 126 || code === 127) && stage() === 'starting') { setStage(''); cannotStart(''); return; }
      setPhase(IDLE); setStage('');
      if (stopped) setStatus('atelier.run.stopped', 0);
      else if (code === 0) {
        let real = dir; try { real = fs.realpath(dir); } catch (e) { }
        const rel = made.startsWith(dir + '/') ? made.slice(dir.length + 1) : made.startsWith(real + '/') ? made.slice(real.length + 1) : made;
        setMade([kind, rel]);
        setStatus('atelier.' + kind + '.built', 1, ['path', rel]);
      }
      else { setStatus('atelier.run.build_failed', 2); showConsole(true); }
      add(new Line(stopped ? t('atelier.console.stopped') : `exit ${code}`, K_END));
    });
  } catch (e) { cannotStart((e as Error).message); }
}
// ---- Debug: the sketch runs under `zinc dev` (it restarts at every save, a compile error stays on its screen) and, when it
// has an interface, the Zinc Inspector (the app beside this one) opens on its DevTools port: elements, styles, console, frames.
/** The port of the running sketch's inspector, 0 when it has none. */
export const [inspectorPort, setInspectorPort] = createSignal<i32>(0);
let inspector: proc.Process | null = null;
export function openInspector(): void {
  if (inspectorPort() === 0 || inspector !== null) return;
  const app = APP_HOME + '/../inspector/main.tsx';
  if (APP_HOME === '' || !fs.exists(app)) { add(new Line(t('atelier.inspector.by_hand', ['port', `${inspectorPort()}`]), K_STAGE)); return; }
  try {
    const p = zinc(['run', app, '--', `${inspectorPort()}`], '');
    inspector = p;
    add(new Line(t('atelier.inspector.opened', ['port', `${inspectorPort()}`]), K_STAGE));
    p.onStdout((l: string) => { add(new Line('inspector: ' + l, K_STAGE)); });
    p.onExit((code: i32) => { if (inspector === p) inspector = null; });
  } catch (e) { inspector = null; }
}
/** Tools > Open the Inspector. It belongs to a debug run: one that has it shows it, a plain run (or no run) starts again in debug, which
 *  opens it by itself, here or on the device. */
export function inspect(): void {
  if (inspectorPort() > 0) { openInspector(); return; }
  if (child !== null && debugging()) { say(t('atelier.inspector.not_yet')); return; }
  say(t(child !== null ? 'atelier.inspector.restart' : 'atelier.inspector.start'));
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
/** A short job of another module starts (+1) or ends (-1): a lesson's check (app/lesson.ts). */
export function job(delta: i32): void { checks += delta; }
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
      if (code === 126 || code === 127) { if (phase() === IDLE) setStatus('atelier.run.no_zinc', 2, ['path', ZINC]); return; }   // no zinc to start
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
        if (at >= 0) { const end = out.indexOf('\n', at); setStatus('atelier.status.said', 2, ['text', out.slice(at, end < 0 ? out.length : end)]); }
        else if (statusKind() === 2) setStatus('atelier.check.none', 1);
      }
      else setStatus('atelier.check.problems', 2, ['place', `${all[0].file}:${all[0].line}`, 'message', all[0].message], all.length);
    });
  } catch (e) { checks--; }
}

/** The status line for the diagnostics the open files hold: the language server sends them as one types. */
export function problems(): void {
  if (phase() !== IDLE) return;
  const dir = sketchDir();
  let n: i32 = 0, place = '', message = '';
  for (const b of buffers()) for (const d of b.diagnostics()) if (n++ === 0) { place = `${b.path.startsWith(dir + '/') ? b.path.slice(dir.length + 1) : b.name}:${d.line + 1}`; message = d.message; }
  const s = n === 0 ? t('atelier.check.none') : tn('atelier.check.problems', n, ['place', place, 'message', message]);
  if (s !== status() && (n > 0 || statusKind() === 2)) { if (n === 0) setStatus('atelier.check.none', 1); else setStatus('atelier.check.problems', 2, ['place', place, 'message', message], n); }
}

// ---------------------------------------------------------------- error codes and templates
/** What an error code means, with an example and the fix (`zinc explain Z0103`), printed in the console: a click on a code does it. */
/** The page of the site that explains the code shown last (`Reference: https://.../diagnostics/#z0103-...`): the console's Reference button. */
export const [reference, setReference] = createSignal<string>('');
export function explain(code: string): void {
  add(new Line('$ zinc explain ' + code, K_CMD));
  showConsole(true);
  setReference('');
  try {
    const p = zinc(['explain', code], '');
    checks++;
    p.onStdout((l: string) => {
      add(new Line(l, K_OUT));
      const at = l.indexOf('https://');
      if (at >= 0 && l.indexOf('/diagnostics/#') > at) setReference(l.slice(at).trim());
    });
    p.onStderr((l: string) => add(new Line(l, K_ERR)));
    p.onExit((c: i32) => { checks--; });
  } catch (e) { setStatus('atelier.run.no_zinc', 2, ['path', ZINC]); }
}

export class Template {
  name: string; text: string;
  constructor(name: string, text: string) { this.name = name; this.text = text; }
}
export const [templates, setTemplates] = createSignal<Template[]>([]);
/** The project templates that come with zinc (`zinc new --list`, its first table: `  name   what it makes (targets)`). */
export function loadTemplates(): void {
  if (templates().length > 0) return;
  let out = '';
  try {
    const p = zinc(['new', '--list'], '');
    checks++;
    p.onData((chunk: string, stderr: boolean) => { if (!stderr) out += chunk; });
    p.onExit((code: i32) => {
      checks--;
      const list: Template[] = [];
      for (const l of out.split('\n')) {
        if (!l.startsWith('  ')) { if (list.length > 0) break; continue; }   // the index's table comes after a blank line
        const s = l.trim(), sp = s.indexOf(' ');
        if (sp > 0) list.push(new Template(s.slice(0, sp), s.slice(sp).trim()));
      }
      setTemplates(list);
    });
  } catch (e) { setStatus('atelier.run.no_zinc', 2, ['path', ZINC]); }
}
/** A new project from a template, in the sketchbook under the name given (`zinc new <template> <folder>`), then opened. */
export function newProject(template: string, typed: string): void {
  const name = typed.trim().split('/').join('').split(' ').join('-');
  if (name === '' || name.startsWith('.')) return;
  const dir = sketchbook() + '/' + name;
  if (fs.exists(dir)) { say(t('atelier.template.exists', ['name', name])); return; }
  fs.mkdir(sketchbook(), true);
  add(new Line(`$ zinc new ${template} ${name}`, K_CMD));
  try {
    const p = zinc(['new', template, dir], sketchbook());
    checks++;
    p.onStdout((l: string) => add(new Line(l, K_STAGE)));
    p.onStderr((l: string) => add(classify(l, true)));
    p.onExit((code: i32) => {
      checks--;
      if (code === 0 && openSketch(dir)) { setStatus('atelier.template.created', 1, ['name', name, 'template', template]); check(); }
      else { setStatus('atelier.template.failed', 2, ['template', template]); showConsole(true); }
    });
  } catch (e) { setStatus('atelier.run.no_zinc', 2, ['path', ZINC]); }
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
  } catch (e) { say(t('atelier.library.cannot_list')); }
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
    setStatus(install ? 'atelier.update.installing' : 'atelier.update.checking', 0);
    p.onData((chunk: string, stderr: boolean) => { out += chunk; });
    p.onExit((code: i32) => {
      checks--;
      const ls = out.trim().split('\n');
      const last = ls[ls.length - 1];
      setUpdateReady(!install && code === 10);
      if (code === 10) setStatus('atelier.update.ready', 0, ['text', ls[0]]);
      else if (code === 0) setStatus(install ? 'atelier.update.installed' : 'atelier.status.said', 1, ['text', install ? last : ls[0]]);
      else setStatus('atelier.update.failed', 2, ['text', last]);
    });
  } catch (e) { setStatus('atelier.update.cannot', 2); }
}
