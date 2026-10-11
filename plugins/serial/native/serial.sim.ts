// zinc:serial without native code (a deterministic run, a machine that cannot build the plugin): one port, 'loopback', that gives back what is
// written to it, so a program and its test run with no board attached. Opening anything else fails as a missing device does.
const LOOPBACK = 'loopback';
const queues: u8[][] = [];      // per handle: the bytes written, waiting to be read
const opened: boolean[] = [];
let err: string = '';
const known = (h: i32): boolean => h >= 0 && h < opened.length && opened[h];

export default {
  list(): string { return LOOPBACK + '\n'; },
  open(path: string, baud: i32, dataBits: i32, parity: i32, stopBits: i32): i32 {
    if (baud <= 0 || dataBits < 5 || dataBits > 8 || parity < 0 || parity > 2 || stopBits < 1 || stopBits > 2) { err = `${path}: bad baud rate or framing`; return -1; }
    if (path !== LOOPBACK) { err = `${path}: cannot open: no such port in the simulator (only '${LOOPBACK}')`; return -1; }
    queues.push([]); opened.push(true);
    return opened.length - 1;
  },
  error(): string { return err; },
  read(h: i32): u8[] {
    if (!known(h)) return [];
    const r = queues[h];
    queues[h] = [];
    return r;
  },
  alive(h: i32): boolean { return known(h); },
  write(h: i32, data: u8[]): boolean {
    if (!known(h)) return false;
    for (const b of data) queues[h].push(b);
    return true;
  },
  pending(h: i32): i32 { return 0; },
  setSignals(h: i32, dtr: boolean, rts: boolean): boolean { return known(h); },
  close(h: i32): void { if (known(h)) { opened[h] = false; queues[h] = []; } },
};
