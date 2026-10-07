// zinc:system/deeplink: custom URL schemes (notes://doc/1). macOS delivers them to a bundled app registered through app.urlSchemes; Linux passes the URL as an argument (a .desktop entry
// registered with register()); a second launch reaches the running copy through zinc:system/instance. current() has the URLs that launched the app, onOpen() the later ones.
import { call, on } from 'zinc:system';
import { APP } from 'zinc:system/app';
import * as sys from 'zinc:sys';

function field(key: string): string {
  const at = APP.indexOf('"' + key + '":"');
  if (at < 0) return '';
  const from = at + key.length + 4;
  return APP.slice(from, APP.indexOf('"', from));
}
function isUrl(s: string): boolean { const i = s.indexOf('://'); return i > 0 && i < 20 && s.indexOf(' ') < 0; }

/** The URLs the app was started with: delivered by the system (macOS) or found in the arguments (Linux). */
export function current(): string[] {
  const r = call('deep-link.getCurrent', {}) as { urls: string[] };
  const urls: string[] = [];
  for (const u of r.urls) urls.push(u);
  for (const a of sys.args()) if (isUrl(a) && urls.indexOf(a) < 0) urls.push(a);
  return urls;
}
/** Runs `cb(url)` for each URL opened while the app runs (a second launch counts when instance.lock forwards it). */
export function onOpen(cb: (url: string) => void): void {
  on('open-url', (a: string[]) => { for (const u of a) cb(u); });
}
/** Files opened with the app from Finder or the file manager. */
export function onOpenFile(cb: (path: string) => void): void {
  on('open-file', (a: string[]) => { for (const p of a) cb(p); });
}
/** Linux: writes the .desktop entry and the xdg-mime association for `scheme` (dev use). macOS: schemes come from app.urlSchemes of a bundled app; returns false with a reason. */
export async function register(scheme: string): Promise<boolean> {
  const r = call('deep-link.register', { scheme: scheme, id: field('id'), name: field('name') }) as { ok: boolean };
  return r.ok;
}
