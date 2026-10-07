// zinc:system/shortcut: global keyboard shortcuts, active while the app is not in front (macOS Carbon hotkeys: no Accessibility permission). The accelerator grammar is the shared parser of
// accelerator.ts (docs/reports/system-integration.md 4.7).
import { callRaw, call, on, supports } from 'zinc:system';
import { parseAccelerator, formatAccelerator } from './accelerator';

const accs: string[] = [];
const cbs: (() => void)[] = [];
let wired = false;
function wire(): void {
  if (wired) return;
  wired = true;
  on('shortcut', (a: string[]) => {
    const i = accs.indexOf(a[0]);
    if (i >= 0) cbs[i]();
  });
}

export function isSupported(): boolean { return supports('shortcuts'); }

/** 'ok' | 'conflict' (taken by this or another app) | 'denied' | 'unsupported' | 'invalid' (the accelerator does not parse; nothing was registered). */
export async function register(accelerator: string, cb: () => void): Promise<string> {
  const a = parseAccelerator(accelerator, true);
  if (!a.ok) return 'invalid';
  wire();
  const canonical = formatAccelerator(a);
  const r = callRaw('shortcut.register', '{"accelerator":"' + canonical + '","key":"' + a.key + '","ctrl":' + (a.ctrl ? 'true' : 'false') + ',"alt":' + (a.alt ? 'true' : 'false') + ',"shift":' + (a.shift ? 'true' : 'false') + ',"meta":' + (a.meta ? 'true' : 'false') + '}') as { status: string };
  if (r.status === 'ok') { accs.push(canonical); cbs.push(cb); }
  return r.status;
}
/** Frees the shortcut; false when it was not registered by this program. */
export function unregister(accelerator: string): boolean {
  const a = parseAccelerator(accelerator, true);
  if (!a.ok) return false;
  const canonical = formatAccelerator(a);
  const i = accs.indexOf(canonical);
  if (i < 0) return false;
  call('shortcut.unregister', { accelerator: canonical });
  accs.splice(i, 1);
  cbs.splice(i, 1);
  return true;
}
