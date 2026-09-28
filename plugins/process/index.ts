// zinc:process — child processes (docs/plugins/process.md). spawn() starts a program (no shell: call 'sh', ['-c', ...]
// for pipes and globs); its output arrives on the event loop as lines (onStdout / onStderr) and raw chunks (onData);
// run() collects everything for short commands. Native side: native/process.spec.ts.
import P from './native/process.spec';

const SEP = '\u001f';

export interface SpawnOptions {
  /** Working directory ('' or absent: the program's). */
  cwd?: string;
  /** KEY=VALUE entries added to (or replacing in) the program's environment. */
  env?: string[];
}

export class Result {
  code: i32; stdout: string; stderr: string;
  constructor(code: i32, stdout: string, stderr: string) { this.code = code; this.stdout = stdout; this.stderr = stderr; }
}

export class Process {
  readonly handle: i32;
  readonly pid: i32;
  /** Exit code once finished (128 + signal when killed), -1 while running. */
  code: i32 = -1;
  running: boolean = true;
  /** Resolves with the exit code. */
  readonly exited: Promise<i32>;
  lineCbs: ((line: string) => void)[][] = [[], []];
  dataCbs: ((chunk: string, stderr: boolean) => void)[] = [];
  exitCbs: ((code: i32) => void)[] = [];
  partial: string[] = ['', ''];
  done: ((code: i32) => void) | null = null;

  constructor(handle: i32) {
    this.handle = handle;
    this.pid = P.pid(handle);
    this.exited = new Promise<i32>(resolve => { this.done = resolve; });
  }
  /** Each complete stdout line (without the newline); a last line without newline comes at exit. */
  onStdout(cb: (line: string) => void): Process { this.lineCbs[0].push(cb); return this; }
  onStderr(cb: (line: string) => void): Process { this.lineCbs[1].push(cb); return this; }
  /** Raw output as read from the pipes (UTF-8 sequences are never split). */
  onData(cb: (chunk: string, stderr: boolean) => void): Process { this.dataCbs.push(cb); return this; }
  onExit(cb: (code: i32) => void): Process { this.exitCbs.push(cb); return this; }
  /** Writes to stdin; false once stdin is closed or the process is gone. */
  write(s: string): boolean { return this.running && P.write(this.handle, s); }
  closeStdin(): void { if (this.running) P.closeStdin(this.handle); }
  /** Sends a signal: 15 SIGTERM (default), 9 SIGKILL, 2 SIGINT. */
  kill(signal: i32 = 15): void { if (this.running) P.kill(this.handle, signal); }

  chunk(k: i32, s: string): void {
    for (const cb of this.dataCbs) cb(s, k === 1);
    if (this.lineCbs[k].length === 0) return;
    const lines = (this.partial[k] + s).split('\n');
    this.partial[k] = lines[lines.length - 1];
    for (let i = 0; i < lines.length - 1; i++) this.line(k, lines[i]);
  }
  line(k: i32, l: string): void {
    const t = l.endsWith('\r') ? l.slice(0, l.length - 1) : l;
    for (const cb of this.lineCbs[k]) cb(t);
  }
  finish(code: i32): void {
    for (let k = 0; k < 2; k++) if (this.partial[k].length > 0) { this.line(k, this.partial[k]); this.partial[k] = ''; }
    this.code = code;
    this.running = false;
    for (const cb of this.exitCbs) cb(code);
    const d = this.done;
    if (d !== null) d(code);
  }
}

const live: (Process | null)[] = [];
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  P.onEvent((h: i32, kind: i32, data: string) => {
    const p = h < live.length ? live[h] : null;
    if (p === null) return;
    if (kind === 2) { live[h] = null; p.finish(parseInt(data)); } else p.chunk(kind, data);
  });
}

/** Starts `cmd` (looked up in PATH) with `args`. Throws when it cannot be started (not found, not executable). */
export function spawn(cmd: string, args: string[], opts: SpawnOptions): Process {
  // arguments travel joined by SEP: one containing it would become several argv entries (argument injection), and a
  // NUL would cut it short
  for (const a of [cmd, opts.cwd ?? '', ...args, ...(opts.env ?? [])]) {
    if (a.indexOf(SEP) >= 0 || a.indexOf('\u0000') >= 0) throw new Error('spawn: an argument contains U+001F or NUL');
  }
  listen();
  const h = P.spawn(cmd, args.join(SEP), opts.cwd ?? '', (opts.env ?? []).join(SEP));
  if (h < 0) throw new Error('spawn ' + P.error());
  const p = new Process(h);
  while (live.length <= h) live.push(null);
  live[h] = p;
  return p;
}

/** Runs a short command to completion and collects its output. Rejects only when it cannot be started. */
export function run(cmd: string, args: string[], opts: SpawnOptions): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    let out = '', err = '';
    let p: Process;
    try { p = spawn(cmd, args, opts); } catch (e) { reject(e); return; }
    p.onData((s: string, stderr: boolean) => { if (stderr) err += s; else out += s; });
    p.onExit((code: i32) => { resolve(new Result(code, out, err)); });
  });
}
