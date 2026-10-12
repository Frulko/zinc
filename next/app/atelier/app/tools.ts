// The zinc binary Atelier runs on, driven through zinc:process: run, debug and stop of the sketch with everything the
// child prints streamed into the console as it arrives, `zinc check` for the diagnostics, `zinc plugins` for the libraries.
// The binary is $ZINC_BIN (the zinc that started Atelier exports it), else `zinc` on the PATH.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { Spring } from './motion';
import { Buffer, Diagnostic, buffers, saveAll, sketchDir, mainFile, openFile, say } from './workspace';
import { parseDiagnostics, Diag } from '../model';

export const ZINC: string = sys.env('ZINC_BIN') !== '' ? sys.env('ZINC_BIN') : 'zinc';
/** The variables of a scripted or captured run of Atelier itself that its children must not inherit (they would write the same files). */
const SCRUB: string[] = ['ZINC_SHOT', 'ZINC_SHOT_FRAMES', 'ZINC_INPUT', 'ZINC_SIZE', 'ZINC_SYSTEM_SCRIPT', 'ZINC_SYSTEM_LOG', 'ZINC_ATELIER_SCRIPT'];
function zinc(args: string[], cwd: string): proc.Process {
  const a: string[] = [];
  for (const v of SCRUB) { a.push('-u'); a.push(v); }
  a.push(ZINC);
  return proc.spawn('/usr/bin/env', a.concat(args), { cwd: cwd });
}

// ---------------------------------------------------------------- console
export const K_OUT: i32 = 0, K_STAGE: i32 = 1, K_ERR: i32 = 2, K_CMD: i32 = 3, K_END: i32 = 4;
/** One console line. A line that names a place in a file (`main.ts:12:5: ...`) carries it: a click opens it there. */
export class Line {
  text: string; kind: i32;
  file: string = ''; line: i32 = 0; col: i32 = 0;   // 1-based, 0: no place
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
  // the steps `zinc run` prints: two spaces, a name, its text ("  compile    4 files, 34 functions   44 ms")
  if (text.startsWith('  ') && text.length > 4 && text.charCodeAt(2) !== 32 && text.indexOf('  ', 3) > 0 && text.indexOf('  ', 3) < 14) l.kind = K_STAGE;
  const d: Diag[] = parseDiagnostics(text);
  if (d.length > 0) { l.kind = K_ERR; l.file = d[0].file; l.line = d[0].line; l.col = d[0].col; l.code = d[0].code; l.message = d[0].message; return l; }
  const p = place(text);
  if (p.length > 0) {
    const parts = text.slice(p[0], p[1]).split(':');
    l.file = parts[0]; l.line = parseInt(parts[1]); l.col = parts.length > 2 ? parseInt(parts[2]) : 1;
  }
  return l;
}
function add(l: Line): void {
  buf.push(l);
  if (buf.length > MAX_LINES) buf = buf.slice(buf.length - MAX_LINES);
  setLines(buf.slice());
  follow = 2;
  if (echo) console.log('[console] ' + l.text);
}
const echo: boolean = sys.env('ZINC_ATELIER_ECHO') !== '';   // tests read the console on Atelier's own output
export function clearConsole(): void { buf = []; setLines([]); }
export function consoleText(): string { return buf.map((l: Line) => l.text).join('\n'); }

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
function setStatus(s: string, kind: i32): void { setStatusText(s); setStatusKind(kind); }

/** How the sketch runs: the choices of the run control's menu and their `zinc run` arguments. */
export const ENGINES: string[] = ['Native', 'Interpreter', 'QuickJS', 'ESP32 emulator'];
const ENGINE_ARGS: string[][] = [[], ['--interp'], ['--engine', 'quickjs'], ['--target', 'esp32', '--qemu']];
export const [engine, setEngine] = createSignal<i32>(0);

let child: proc.Process | null = null;
let startedAt: number = 0, stopped = false;
let again: i32 = -1;   // a run asked while one was ending: 0 run, 1 debug

function onLine(text: string, stderr: boolean): void {
  if (text.startsWith('zinc run ') || text.startsWith('zinc dev ')) return;   // the command, already shown
  const l = classify(text, stderr);
  if (l.kind === K_STAGE) {
    const name = text.trim().split(' ')[0];
    if (name === 'run' || name === 'dev') { setPhase(RUNNING); startedAt = sys.clock(); setSeconds(0); setStatus(debugging() ? 'Debugging' : 'Running', 1); }
    else if (phase() === BUILDING && name !== 'zinc') setStage(name);
  } else if (phase() === BUILDING && l.kind === K_OUT) { setPhase(RUNNING); startedAt = sys.clock(); setSeconds(0); setStatus('Running', 1); }   // a program that prints before any step line
  add(l);
  if (l.kind !== K_STAGE && !consoleOpen()) showConsole(true);
}

/** Saves the sketch, then builds and runs it (`debug`: under `zinc dev`, with the inspector). A program still running is stopped first. */
export function run(debug: boolean = false): void {
  if (child !== null) { again = debug ? 1 : 0; stop(); return; }
  const dir = sketchDir(), main = mainFile(dir);
  if (dir === '' || main === '') { setStatus('Nothing to run: this sketch has no code file', 2); return; }
  saveAll();
  clearConsole();
  const args: string[] = [debug ? 'dev' : 'run', main].concat(debug ? [] : ENGINE_ARGS[engine()]);
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
      setPhase(IDLE); setStage(''); setDebugging(false);
      if (stopped) setStatus('Stopped', 0);
      else if (code === 0) setStatus('Finished', 1);
      else { setStatus(ran ? `Exited with code ${code}` : 'Build failed', 2); showConsole(true); }
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
let killAt: number = 0;
/** Ends the program (or the build): SIGTERM, then SIGKILL two seconds later if it is still there. */
export function stop(): void {
  const c = child;
  if (c === null) return;
  stopped = true;
  (c as proc.Process).kill();
  killAt = sys.clock() + 2000;
}
export function running(): boolean { return child !== null; }

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
let checks: i32 = 0;      // checks under way
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
        b.setDiagnostics(mine);
      }
      if (phase() !== IDLE) return;
      if (all.length === 0) { if (statusKind() === 2) setStatus('No problems', 1); }
      else setStatus(`${all.length} problem${all.length > 1 ? 's' : ''}: ${all[0].file}:${all[0].line} ${all[0].message}`, 2);
    });
  } catch (e) { checks--; }
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
    p.onData((chunk: string, stderr: boolean) => { out += chunk; });
    p.onExit((code: i32) => {
      const list: Library[] = [];
      for (const l of out.split('\n')) {
        if (!l.startsWith('  ') || l.startsWith('  display:')) continue;
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
