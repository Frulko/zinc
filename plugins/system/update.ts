// zinc:system/update: the app updates itself from its channel (zinc.json "update": url, channel, publicKey; ZN-324). The engine fetches the
// channel's signed manifest and checks it with the app's key, downloads the newer .zapp with its SHA-256 and stages it; restart() starts the app
// again, which runs the staged version on trial (it is kept once healthy() is called, after 5 s, or at a normal exit; a crash rolls it back).
import { call } from 'zinc:system';

export class UpdateInfo { available: boolean = false; version: string = ''; notes: string = ''; }

/** Whether the channel offers a newer version. Throws SystemError('failed') when the manifest cannot be fetched or its signature is wrong. */
export function check(): UpdateInfo {
  const r = call('update.check', {}) as { available: boolean; version: string; notes: string };
  const u = new UpdateInfo();
  u.available = r.available; u.version = r.version; u.notes = r.notes;
  return u;
}
/** Downloads the newer version, checks it and stages it for the next start; resolves with its version. */
export function download(): string { const r = call('update.download', {}) as { version: string; path: string }; return r.version; }
/** Starts the app again (same arguments): the staged version runs. */
export function restart(): void { call('update.restart', {}); }
/** The version on trial works: keep it now (otherwise after 5 s or at a normal exit). */
export function healthy(): void { call('update.healthy', {}); }
