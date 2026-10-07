// zinc:system/instance: one running copy of the app. The first process to call lock() keeps the app; a second one is told so, hands its command line and working directory to the first (second-instance
// event) and should exit (docs/reports/system-integration.md 4.7). The lock is a file lock plus a local socket, both named from app.id.
import { call, on } from 'zinc:system';
import { APP } from 'zinc:system/app';
import * as sys from 'zinc:sys';

function appId(): string {
  const at = APP.indexOf('"id":"');
  if (at < 0) return '';
  const from = at + 6;
  return APP.slice(from, APP.indexOf('"', from));
}

/** true: this process is the first and keeps running; false: another instance has the app, it was told (argv, cwd) and this one should exit. `onSecond(cwd, argv)` runs in the first when a later copy starts. */
export async function lock(onSecond: (cwd: string, argv: string[]) => void): Promise<boolean> {
  on('second-instance', (a: string[]) => { onSecond(a[0], a.slice(1)); });
  const r = call('instance.lock', { id: appId(), argv: sys.args() }) as { first: boolean };
  return r.first;
}
