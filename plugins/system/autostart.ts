// zinc:system/autostart: start the app at login. macOS: a LaunchAgent plist in ~/Library/LaunchAgents; Linux: an XDG autostart .desktop (docs/reports/system-integration.md 4.7).
import { call } from 'zinc:system';
import { APP } from 'zinc:system/app';

function field(key: string): string {
  const at = APP.indexOf('"' + key + '":"');
  if (at < 0) return '';
  const from = at + key.length + 4;
  return APP.slice(from, APP.indexOf('"', from));
}
/** `hidden`: the app is started with --hidden (a tray-only start). `args`: extra arguments for the started program. */
export async function enable(hidden: boolean = false, args: string[] = []): Promise<void> { call('autostart.set', { id: field('id'), name: field('name'), enabled: true, hidden: hidden, args: args }); }
export async function disable(): Promise<void> { call('autostart.set', { id: field('id'), enabled: false }); }
export async function isEnabled(): Promise<boolean> { const r = call('autostart.get', { id: field('id') }) as { enabled: boolean }; return r.enabled; }
