// What an app says it uses (zinc.json "permissions", docs/guide/08-security.md), in plain words for the consent screen, and what the owner
// allowed for it: HUB_DIR/apps/<id>/granted, one id per line, `*` for an app that declares nothing (it can do what any program can).
import * as fs from 'zinc:fs';
import { HUB_DIR } from '../constants';

const WORDS: string[][] = [
  ['fs', 'Read and change every file on the tablet'], ['fs:read', 'Read every file on the tablet'], ['fs:write', 'Change every file on the tablet'],
  ['net', 'Use the network: any site, and accept connections'], ['net:*', 'Use the network: any site, and accept connections'],
  ['process', 'Start other programs'], ['camera', 'Use a camera'], ['microphone', 'Use a microphone'], ['bluetooth', 'Use Bluetooth'],
  ['location', 'Know where you are'], ['photos', 'Read and add photos'], ['photos-add', 'Add photos'], ['serial', 'Use serial ports'],
];

/** One permission id in plain words. */
export function describe(id: string): string {
  for (const w of WORDS) if (w[0] === id) return w[1];
  if (id.startsWith('fs:read:')) return 'Read the files in ' + id.slice(8);
  if (id.startsWith('fs:write:')) return 'Change the files in ' + id.slice(9);
  if (id.startsWith('net:unix:')) return 'Talk to the local service ' + id.slice(9);
  if (id.startsWith('net:')) return 'Connect to ' + id.slice(4);
  return 'System: ' + id;   // zinc:system/<id> (notification, clipboard, power...)
}

/** The lines of the consent screen: the declared ids in words, or what an app that declares nothing can do. */
export function consentLines(declared: boolean, ids: string[]): string[] {
  if (!declared) return ['It does not say what it uses: like any program, it can read and change your files, use the network and start other programs.'];
  return ids.map((id: string) => describe(id));
}

function grantPath(id: string): string { return HUB_DIR + '/apps/' + id + '/granted'; }
/** What was allowed for `id`; null when nothing was asked yet (an app installed before consent existed counts as asked). */
export function granted(id: string): string[] | null {
  if (!fs.exists(grantPath(id))) return null;
  return fs.readText(grantPath(id)).split('\n').filter((l: string) => l !== '');
}
export function grant(id: string, declared: boolean, ids: string[]): void {
  fs.mkdir(HUB_DIR + '/apps/' + id, true);
  fs.writeText(grantPath(id), (declared ? ids : ['*']).join('\n') + '\n');
}
/** The ids that need the owner's yes: all of them on a first install, those not allowed before on an update; [] when none. An app that
 *  declares nothing asks once ('*'); one that declares [] asks nothing. */
export function toAsk(id: string, declared: boolean, ids: string[], installedBefore: boolean): string[] {
  const g = granted(id);
  if (g === null && installedBefore) return [];   // installed before the Hub asked: not asked again until its permissions change
  const had: string[] = g === null ? [] : g as string[];
  if (!declared) return had.indexOf('*') >= 0 ? [] : ['*'];
  if (had.indexOf('*') >= 0) return [];   // it was allowed everything
  return ids.filter((p: string) => had.indexOf(p) < 0);
}
