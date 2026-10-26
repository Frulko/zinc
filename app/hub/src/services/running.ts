// The Zinc apps running on the tablet (ZN-844): one pidfile per app from zinc-app (${TMPDIR}/zinc-app-<path>.pid), and the line its
// watcher writes beside it every 5 s (<base>.watch: state, CPU %, RSS KB, window; integrations/remarkable-engine/zinc-watch.c).
// A pidfile whose pid is gone, or is no longer a zinc (/proc/<pid>/cmdline), is removed. ZINC_PROC_ROOT replaces /proc (the tests).
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

function envOr(name: string, fallback: string): string { const v = sys.env(name); return v !== '' ? v : fallback; }
const PROC = envOr('ZINC_PROC_ROOT', '/proc');
function trimSlash(s: string): string { let e = s.length; while (e > 1 && s[e - 1] === '/') e--; return s.slice(0, e); }
const TMP = trimSlash(envOr('TMPDIR', '/tmp'));

export class RunningApp {
  pid: i32 = 0;
  name: string = '';
  base: string = '';        // the pidfile without .pid
  state: string = '';       // ok, busy, hung, waste, memory; '' before the watcher's first line
  cpu: i32 = -1;            // % of one core over the watcher's last 5 s, -1 unknown
  rssKb: i32 = -1;
  window: string = '';      // full, hidden, widget
  startedMs: f64 = 0;       // the pidfile's time: when zinc-app started the app
  get hung(): boolean { return this.state === 'hung'; }
}

/** The program's command line when the pid is a zinc, else null. */
function zincCommand(pid: i32): string[] | null {
  const path = PROC + '/' + pid.toString() + '/cmdline';
  if (!fs.exists(path)) return null;
  let cmd = '';
  try { cmd = fs.readText(path); } catch (e) { return null; }
  return cmd.indexOf('zinc') >= 0 ? cmd.split('\0') : null;
}
export function alive(pid: i32): boolean { return zincCommand(pid) !== null; }

/** The app's name: the .zapp or project zinc runs (`zinc run <app>`), else the pidfile's name. */
function nameOf(cmd: string[], base: string): string {
  const i = cmd.indexOf('run');
  const target = trimSlash(i >= 0 && i + 1 < cmd.length ? cmd[i + 1] : base.slice(base.lastIndexOf('_') + 1));
  const name = target.slice(target.lastIndexOf('/') + 1);
  return name.endsWith('.zapp') ? name.slice(0, name.length - 5) : name;
}

export function running(): RunningApp[] {
  const list: RunningApp[] = [];
  if (!fs.exists(TMP)) return list;
  for (const f of fs.list(TMP)) {
    if (!f.startsWith('zinc-app-') || !f.endsWith('.pid')) continue;
    const pidf = TMP + '/' + f, base = pidf.slice(0, pidf.length - 4);
    let pid: i32 = 0;
    try { pid = parseInt(fs.readText(pidf).trim()); } catch (e) { continue; }
    const cmd = pid > 0 ? zincCommand(pid) : null;
    if (cmd === null) { forget(base); continue; }   // stale: the app ended without its watcher (an engine before ZN-844, a crash of both)
    if (pid === sys.pid()) continue;                 // the hub itself
    const a = new RunningApp();
    a.pid = pid; a.base = base; a.name = nameOf(cmd as string[], base);
    a.startedMs = fs.stat(pidf).mtimeMs;
    if (fs.exists(base + '.watch')) {
      const w = fs.readText(base + '.watch').trim().split(' ');
      if (w.length >= 4) { a.state = w[0]; a.cpu = parseInt(w[1]); a.rssKb = parseInt(w[2]); a.window = w[3]; }
    }
    list.push(a);
  }
  list.sort((x: RunningApp, y: RunningApp): i32 => x.hung !== y.hung ? (x.hung ? -1 : 1) : x.name < y.name ? -1 : x.name > y.name ? 1 : 0);
  return list;
}

function forget(base: string): void {
  for (const ext of ['.pid', '.watch', '.beat']) if (fs.exists(base + ext)) fs.remove(base + ext);
}

function pause(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }

/** SIGTERM (the app saves as on quit), up to 3 s, then SIGKILL. */
export async function stopApp(a: RunningApp): Promise<string> {
  sys.kill(a.pid, 'SIGTERM');
  for (let i = 0; i < 30 && alive(a.pid); i++) await pause(100);
  let killed = false;
  if (alive(a.pid)) { sys.kill(a.pid, 'SIGKILL'); killed = true; await pause(200); }
  forget(a.base);
  return killed ? a.name + ' did not stop on its own: it was killed.' : 'Stopped ' + a.name + '.';
}
