// zinc:process on the sim target: Node's child_process with the same events as process.host.cpp.
import { spawn as nodeSpawn, ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const procs: (ChildProcess | null)[] = [];
let cb: ((h: number, kind: number, data: string) => void) | null = null;
let err = '';

export default {
  spawn(cmd: string, args: string, cwd: string, env: string): number {
    const extra: Record<string, string> = {};
    for (const kv of env ? env.split('\u001f') : []) { const i = kv.indexOf('='); if (i > 0) extra[kv.slice(0, i)] = kv.slice(i + 1); }
    const c = nodeSpawn(cmd, args ? args.split('\u001f') : [], { cwd: cwd || undefined, env: { ...process.env, ...extra } });
    if (!c.pid) { err = `${cmd}: No such file or directory`; c.on('error', () => {}); return -1; }
    let h = procs.indexOf(null);
    if (h < 0) { h = procs.length; procs.push(null); }
    procs[h] = c;
    const decoders = [new StringDecoder('utf8'), new StringDecoder('utf8')];
    c.stdout!.on('data', (b: Buffer) => cb?.(h, 0, decoders[0].write(b)));
    c.stderr!.on('data', (b: Buffer) => cb?.(h, 1, decoders[1].write(b)));
    c.stdin!.on('error', () => {});
    c.on('close', (code: number | null, sig: string | null) => {
      procs[h] = null;
      const n = code ?? 128 + ((sig && ({ SIGINT: 2, SIGKILL: 9, SIGTERM: 15 } as Record<string, number>)[sig]) || 0);
      cb?.(h, 2, String(n));
    });
    return h;
  },
  error(): string { return err; },
  pid(h: number): number { return procs[h]?.pid ?? -1; },
  write(h: number, data: string): boolean { const c = procs[h]; return !!c && c.stdin!.writable && c.stdin!.write(data) !== undefined; },
  closeStdin(h: number): void { procs[h]?.stdin!.end(); },
  kill(h: number, signal: number): void { procs[h]?.kill(signal); },
  onEvent(f: (h: number, kind: number, data: string) => void): void { cb = f; },
};
