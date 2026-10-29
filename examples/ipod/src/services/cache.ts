// What the app keeps of each iPod on this computer, so that it does not ask the iPod (or its daemon) again: one folder per iPod, named
// after its FireWire GUID, beside the backups (<backups>/cache/<GUID>/: ~/.zinc/ipod/cache/000A27001234ABCD/ by default).
//   covers/<track id>.png    the covers shown (the largest the iPod stores), read from here before the iPod or the daemon is asked;
//                            the Sonos speakers are served the same files
//   library.json             the last library read (device, tracks, playlists, specs) and the marker of the database it came from
//   audio/<track id>.<ext>   a remote iPod's files played, the least recently used dropped past the size set in the settings
//   plays.json               the plays not yet written to the iPod (services/listening.ts)
// The covers are kept whatever their size (a few tens of KB each); the audio is capped.
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { backupPlace } from './log';

/** The library as the app last read it, and the marker of the iPod's database then (its size and time: services/ipod.ts). */
export interface LibrarySnapshot {
  marker: string;
  device: ipod.Device;
  tracks: ipod.Track[];
  playlists: ipod.Playlist[];
  specs: ipod.SpecItem[];
}

let current = '';

/** The folder name of an iPod: its FireWire GUID without 0x (else its serial), letters and digits only, uppercase. */
export function keyOf(d: ipod.Device): string {
  let raw = d.firewireGuid !== '' ? d.firewireGuid : d.serial !== '' ? d.serial : 'unknown';
  if (raw.startsWith('0x') || raw.startsWith('0X')) raw = raw.slice(2);   // SysInfo writes it 0x000A27...
  let s = '';
  for (let i = 0; i < raw.length; i++) { const c = raw.charCodeAt(i); if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)) s += raw[i]; }
  return s !== '' ? s.toUpperCase() : 'unknown';
}

/** The iPod the calls below are about (set when one is opened). */
export function useIpod(d: ipod.Device): void { current = keyOf(d); }

/** The cache folder of the iPod in use (`sub`: a folder in it), made when missing. */
export function cacheDir(sub: string = ''): string {
  const dir = `${backupPlace()}/cache/${current !== '' ? current : 'unknown'}${sub !== '' ? '/' + sub : ''}`;
  try { fs.mkdir(dir, true); } catch (e) { /* a read-only home: the reads below find nothing */ }
  return dir;
}

/** Writes `bytes` to `file` whole or not at all (a file cut short is never taken for a cover or a song). */
export function writeWhole(file: string, bytes: u8[]): void {
  const part = `${file}.part`;
  fs.writeBytes(part, bytes);
  fs.rename(part, file);
}

// ---- covers

export function coverFile(trackId: string): string { return `${cacheDir('covers')}/${trackId}.png`; }

// ---- the library

function libraryFile(): string { return `${cacheDir()}/library.json`; }

/** The library last read from the iPod in use, null when none was kept (or it cannot be read). */
export function readSnapshot(): LibrarySnapshot | null {
  try {
    if (!fs.exists(libraryFile())) return null;
    const s: LibrarySnapshot = JSON.parse(fs.readText(libraryFile()));
    return s;
  } catch (e) { return null; }
}

export function writeSnapshot(s: LibrarySnapshot): void {
  try {
    const file = libraryFile();
    fs.writeText(`${file}.part`, JSON.stringify(s));
    fs.rename(`${file}.part`, file);
  } catch (e) { console.error(`ipod: ${libraryFile()}: ${(e as Error).message}`); }
}

// ---- a remote iPod's audio, least recently used first out

interface AudioUse { file: string; at: number; }
interface AudioIndex { uses: AudioUse[]; }

function indexFile(): string { return `${cacheDir('audio')}/used.json`; }
function readIndex(): AudioIndex {
  try { if (fs.exists(indexFile())) { const i: AudioIndex = JSON.parse(fs.readText(indexFile())); return i; } } catch (e) { /* rebuilt below */ }
  return { uses: [] };
}

/** The file a remote track is kept in. */
export function audioFile(trackId: string, extension: string): string { return `${cacheDir('audio')}/${trackId}${extension}`; }

/** `file` (of the audio folder) was played now; then the oldest files go until the folder holds at most `capMb` MB (0: no cap).
 *  The file just played is never dropped. */
export function audioUsed(file: string, capMb: number): void {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const index = readIndex();
  const uses: AudioUse[] = [];
  for (const u of index.uses) if (u.file !== name && fs.exists(`${cacheDir('audio')}/${u.file}`)) uses.push(u);
  uses.push({ file: name, at: Date.now() });
  if (capMb > 0) {
    // ponytail: one stat per file at each play; an audio cache holds hundreds of files, not millions
    const dir = cacheDir('audio');
    let total = 0;
    const sizes = new Map<string, number>();
    for (const e of fs.readDir(dir)) {
      if (!e.isFile || e.name === 'used.json' || e.name.endsWith('.part')) continue;
      const size = fs.stat(`${dir}/${e.name}`).size;
      sizes.set(e.name, size);
      total += size;
      let known = false;
      for (const u of uses) known = known || u.file === e.name;
      if (!known) uses.unshift({ file: e.name, at: 0 });   // a file the index lost: the first to go
    }
    uses.sort((a: AudioUse, b: AudioUse) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
    const cap = capMb * 1024 * 1024;
    while (total > cap && uses.length > 1) {
      const old = uses.shift() as AudioUse;
      const size = sizes.get(old.file);
      fs.remove(`${dir}/${old.file}`);
      if (size !== undefined) total -= size as number;
    }
  }
  const index2: AudioIndex = { uses: uses };
  try { fs.writeText(indexFile(), JSON.stringify(index2)); } catch (e) { /* the order is lost, not the files */ }
}
