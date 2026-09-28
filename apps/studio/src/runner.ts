// Runner: generates the program, builds it with the zinc CLI and runs it (zinc:process), streaming every line into
// the log. Targets:
//   sim      zinc build --target sim, then node: logs only (the oracle, fastest)
//   macos    native window next to the studio
//   preview  native build with the remote display (no window): the studio shows it live in the Robot view
//   rpi1     zinc run --target rpi1: ARMv6 binary under QEMU in docker, logs only
//   device   zinc deploy --target rpi1 --device user@host: export, copy over ssh, start
import { createSignal } from 'zinc:ui/solid';
import * as proc from 'zinc:process';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { writeBuild } from './codegen';
import { ProjectFile, join, absolute } from './project';
import { BoxDef } from './library';

export class TargetInfo {
  id: string; label: string; zincTarget: string; hint: string;
  constructor(id: string, label: string, zincTarget: string, hint: string) { this.id = id; this.label = label; this.zincTarget = zincTarget; this.hint = hint; }
}
export const TARGETS: TargetInfo[] = [
  new TargetInfo('sim', 'Simulator', 'sim', 'Node.js oracle, logs only'),
  new TargetInfo('macos', 'macOS window', 'macos', 'native window next to the studio'),
  new TargetInfo('preview', 'Preview', 'macos', 'live in the Robot view (display remote)'),
  new TargetInfo('rpi1', 'Pi (QEMU)', 'rpi1', 'ARMv6 build under QEMU in docker, logs only'),
  new TargetInfo('device', 'Device', 'rpi1', 'zinc deploy over ssh to the device'),
];
export function targetInfo(id: string): TargetInfo { for (const t of TARGETS) if (t.id === id) return t; return TARGETS[0]; }
/** TCP port of the preview app's remote display. */
export const PREVIEW_PORT: i32 = 7711;

// ---------------------------------------------------------------- plugin availability
// `zinc plugins` lists each plugin module with the targets it supports; modules not listed there (zinc:ui, zinc:net,
// zinc:gpio...) are built in and available everywhere. Until the list arrives every box counts as available.
/** plugin module -> targets. A class, not a bare Map: signals compare values with ===, and === on a Map does not
 *  compile to C++ yet (reported). */
class PluginTable { targets: Map<string, string[]> = new Map<string, string[]>(); }
const [pluginsSig, setPlugins] = createSignal<PluginTable>(new PluginTable());
export async function loadPlugins(): Promise<void> {
  try {
    const r = await proc.run('node', [zincCli(), 'plugins'], { env: ['NO_COLOR=1'] });
    const t = new PluginTable(), m = t.targets;
    for (const line of r.stdout.split('\n')) {
      const cols = line.trim().split(' ').filter((s: string) => s !== '');
      if (cols.length >= 2 && cols[0].startsWith('zinc:')) m.set(cols[0], cols[1].split(','));
    }
    setPlugins(t);
  } catch (e) { /* keep everything available */ }
}
/** Whether every module a box needs builds for a studio target (plugin modules are accepted on the sim). */
export function boxAvailable(def: BoxDef, target: string): boolean {
  const t = targetInfo(target).zincTarget, m = pluginsSig().targets;
  for (const mod of def.modules) {
    const ts = m.get(mod);
    if (ts !== undefined && t !== 'sim' && ts.indexOf(t) < 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------- log
export class LogLine {
  level: string; text: string; time: string;
  constructor(level: string, text: string, time: string) { this.level = level; this.text = text; this.time = time; }
}
export const LEVELS: string[] = ['build', 'log', 'info', 'warn', 'error'];
const MAX_LINES = 800;  // ponytail: plain capped list; a virtual list when logs get bigger
const [logSig, setLog] = createSignal<LogLine[]>([]);
let buf: LogLine[] = [];
let t0 = sys.clock();
export function logLines(): LogLine[] { return logSig(); }
export function clearLog(): void { buf = []; setLog([]); t0 = sys.clock(); }
/** STUDIO_ECHO=1 also prints the log on stdout (scripted sessions, CI). */
const echo = sys.env('STUDIO_ECHO') === '1';
export function log(level: string, text: string): void {
  if (echo) console.log(`[${level}] ${text}`);
  const s = (sys.clock() - t0) / 1000;
  buf.push(new LogLine(level, text, s.toFixed(1).padStart(6, ' ')));
  if (buf.length > MAX_LINES) buf = buf.slice(buf.length - MAX_LINES);
  setLog(buf.slice());
}
interface JsonLog { level: string; message: string }
/** A line of the running app: JSON lines (ZINC_LOG_FORMAT=json) carry the console level. */
function appLine(line: string, stderr: boolean): void {
  if (line.startsWith('{"time"')) {
    try {
      const j = JSON.parse(line) as JsonLog;
      const lv = j.level.toLowerCase();
      log(lv === 'debug' || lv === 'trace' ? 'log' : lv, j.message);
      return;
    } catch (e) { /* not ours: plain line */ }
  }
  // plain stderr lines are runtime / plugin diagnostics: only obvious failures are errors
  const low = line.toLowerCase();
  log(!stderr ? 'log' : low.includes('error') || low.includes('fail') || low.includes('abort') ? 'error' : low.includes('warn') ? 'warn' : 'log', line);
}

// ---------------------------------------------------------------- state
const [phaseSig, setPhase] = createSignal<string>('idle');   // idle | building | running | deploying
const [statusSig, setStatus] = createSignal<string>('Ready');
export function phase(): string { return phaseSig(); }
export function status(): string { return statusSig(); }
export function busy(): boolean { return phaseSig() !== 'idle'; }
let current: proc.Process | null = null;
let startedCb: ((target: string) => void) | null = null;
let stoppedCb: (() => void) | null = null;
/** Hooks for the preview: called once the app runs, and when it stops. */
export function onAppStarted(cb: (target: string) => void): void { startedCb = cb; }
export function onAppStopped(cb: () => void): void { stoppedCb = cb; }

/** The zinc CLI: $ZINC_HOME/compiler/bin/zinc.mjs, else found from the current directory upwards. */
export function zincCli(): string {
  const home = sys.env('ZINC_HOME');
  if (home !== '') return join(home, 'compiler/bin/zinc.mjs');
  let dir = '.';
  for (let i = 0; i < 5; i++) {
    const f = join(dir, 'compiler/bin/zinc.mjs');
    if (fs.exists(f)) return f;
    dir = dir === '.' ? '..' : dir + '/..';
  }
  return 'compiler/bin/zinc.mjs';
}
/** The zinc checkout (docs, samples): the directory holding compiler/. */
export function zincRoot(): string {
  const cli = zincCli();
  const root = cli.slice(0, cli.length - 'compiler/bin/zinc.mjs'.length - 1);
  return root === '' ? '.' : root;
}

// ---------------------------------------------------------------- run / stop
/** Generates build/, then builds and runs (or deploys) the project for its target. */
export function play(dir: string, p: ProjectFile): void {
  if (busy()) stop();
  clearLog();
  const t = targetInfo(p.target);
  const r = writeBuild(dir, p);
  for (const w of r.warnings) log('warn', w);
  if (t.id === 'sim' && r.modules.indexOf('zinc:ui') >= 0)
    log('warn', 'Simulator: a program with a screen runs 60 headless frames and exits (timers do not fire in that loop); use Preview or macOS window to watch it');
  log('studio', `generated build/src/main.ts (${p.boxes.length} boxes, ${p.links.length} links) for ${t.label}`);
  const build = join(dir, 'build');
  if (t.id === 'device') {
    if (p.device === '') { log('error', 'Device target: set the device (user@host) in the project settings or the Devices dialog'); return; }
    setPhase('deploying');
    step('Deploying', ['deploy', build, '--target', 'rpi1', '--device', p.device], (code: i32) => { finish(code === 0 ? 'Deployed' : `Deploy failed (${code})`); });
    return;
  }
  if (t.id === 'rpi1') {
    setPhase('running');
    step('Building + running under QEMU', ['run', build, '--target', 'rpi1'], (code: i32) => { finish(`Exited with code ${code}`); });
    return;
  }
  setPhase('building');
  const args = ['build', build, '--target', t.zincTarget, '--print-exe'];
  if (t.id === 'preview') { args.push('--display'); args.push('remote'); }
  let exe = '';
  step('Building', args, (code: i32) => {
    if (code !== 0 || exe === '') { finish(`Build failed (${code})`); return; }
    launch(dir, t, exe);
  }, (line: string) => { exe = line; });
}

/** Runs the zinc CLI with streamed output; `lastOut` sees every stdout line (the exe path of --print-exe). */
function step(label: string, args: string[], done: (code: i32) => void, lastOut: ((line: string) => void) | null = null): void {
  setStatus(`${label}...`);
  const all = [zincCli()];
  for (const a of args) all.push(a);
  log('studio', `$ zinc ${args.join(' ')}`);
  try {
    const p = proc.spawn('node', all, { env: ['NO_COLOR=1'] });
    current = p;
    p.onStdout((l: string) => { log('build', l); if (lastOut !== null) lastOut(l); });
    p.onStderr((l: string) => { log(l.indexOf('error') >= 0 ? 'error' : 'build', l); });
    p.onExit((code: i32) => { if (current === p) current = null; done(code); });
  } catch (e) {
    log('error', 'cannot start node (is Node.js on the PATH?)');
    finish('Cannot start the zinc CLI');
  }
}

function launch(dir: string, t: TargetInfo, exeLine: string): void {
  // --print-exe prints the command joined by spaces. ponytail: paths with spaces are not supported here.
  const parts = exeLine.split(' ').filter((s: string) => s !== '');
  const cmd = parts[0];
  const args = parts.slice(1);
  const env = ['ZINC_LOG_FORMAT=json', `ZINC_ASSETS=${absolute(join(dir, 'assets'))}`, `ZINC_REMOTE_PORT=${PREVIEW_PORT}`];
  // a scripted studio (ZINC_FRAMES / ZINC_SHOT) must not pass its own frame budget and screenshot to the app
  // (-1: no limit on native targets; the sim keeps its default of 60 headless frames)
  if (sys.env('ZINC_FRAMES') !== '') env.push(t.zincTarget === 'sim' ? 'ZINC_FRAMES=60' : 'ZINC_FRAMES=-1');
  if (sys.env('ZINC_SHOT') !== '') env.push('ZINC_SHOT=');
  log('studio', `$ ${exeLine}`);
  try {
    const p = proc.spawn(cmd, args, { env: env });
    current = p;
    setPhase('running');
    setStatus(`Running on ${t.label} (pid ${p.pid})`);
    p.onStdout((l: string) => { appLine(l, false); });
    p.onStderr((l: string) => { appLine(l, true); });
    p.onExit((code: i32) => {
      if (current === p) current = null;
      finish(code === 143 || code === 137 ? 'Stopped' : `Exited with code ${code}`);
    });
    const cb = startedCb;
    if (cb !== null) cb(t.id);
  } catch (e) {
    log('error', `cannot start ${cmd}`);
    finish('Cannot start the app');
  }
}

function finish(msg: string): void {
  setPhase('idle');
  setStatus(msg);
  log('studio', msg);
  const cb = stoppedCb;
  if (cb !== null) cb();
}
/** Stops the build or the running app (SIGTERM). */
export function stop(): void {
  const p = current;
  if (p !== null) { p.kill(); log('studio', 'stop requested'); }
}
