// CPU and memory usage from Linux's /proc (Raspberry Pi OS); on machines without /proc (macOS) a plausible random
// walk stands in, so the graph can be tried on the Mac.
import { readText, exists } from 'zinc:fs';

const HAVE_PROC = exists('/proc/stat') && exists('/proc/meminfo');
let lastBusy = 0, lastTotal = 0;
let fakeCpu = 0.3, fakeMem = 0.45;

/** True when the numbers are simulated. */
export function simulated(): boolean { return !HAVE_PROC; }

/** CPU usage (0..1) since the previous call. First line of /proc/stat: "cpu user nice system idle iowait irq ...". */
export function cpuUsage(): number {
  if (!HAVE_PROC) {
    // drifts back to ~25 % with noise and the occasional burst
    fakeCpu = Math.max(0.02, Math.min(1, fakeCpu + (0.25 - fakeCpu) * 0.3 + (Math.random() - 0.5) * 0.3 + (Math.random() < 0.08 ? 0.6 : 0)));
    return fakeCpu;
  }
  const first = readText('/proc/stat').split('\n')[0];
  const f = first.split(' ').filter((s: string) => s.length > 0);
  let total = 0;
  for (let i: i32 = 1; i < f.length; i++) total += parseInt(f[i]);
  const idle = parseInt(f[4]) + parseInt(f[5]);  // idle + iowait
  const busy = total - idle;
  const dt = total - lastTotal, db = busy - lastBusy;
  lastTotal = total; lastBusy = busy;
  return dt > 0 ? Math.max(0, Math.min(1, db / dt)) : 0;
}

/** Memory in use (0..1): 1 - MemAvailable / MemTotal from /proc/meminfo (values in kB). */
export function memUsage(): number {
  if (!HAVE_PROC) {
    fakeMem = Math.max(0.2, Math.min(0.95, fakeMem + (Math.random() - 0.5) * 0.04));
    return fakeMem;
  }
  let total = 0, avail = 0;
  for (const l of readText('/proc/meminfo').split('\n')) {
    const v = l.split(' ').filter((s: string) => s.length > 0);
    if (v.length < 2) continue;
    if (v[0] === 'MemTotal:') total = parseInt(v[1]);
    if (v[0] === 'MemAvailable:') avail = parseInt(v[1]);
  }
  return total > 0 ? 1 - avail / total : 0;
}
