// zinc:process native side for the Zinc Next engine: the Spec of process.spec.ts over the events of the host's loop (libuv, src/host/loop.cpp) instead of
// posix_spawn and a poller. Output and exit arrive through onEvent, delivered by the event loop (a program with a running child stays alive).
import * as host from 'zinc:__proc';

export default {
  spawn(cmd: string, args: string, cwd: string, env: string): i32 { return host.spawn(cmd, args, cwd, env); },
  error(): string { return host.error(); },
  pid(h: i32): i32 { return host.pid(h); },
  write(h: i32, data: string): boolean { return host.write(h, data); },
  closeStdin(h: i32): void { host.closeStdin(h); },
  kill(h: i32, signal: i32): void { host.signal(h, signal); },
  onEvent(cb: (h: i32, kind: i32, data: string) => void): void { host.onEvent((h: i32, kind: i32, data: string) => { if (kind <= 2) cb(h, kind, data); }); },
};
