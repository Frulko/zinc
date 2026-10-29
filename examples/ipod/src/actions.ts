// The actions that copy or change something, each a job of the transfers queue (services/transfers.ts), logged when it ends:
// download tracks to the computer, add files to the iPod, back up, restore, delete a backup, check and repair, mount and eject.
// What changes the iPod or its backups refuses to run while Allow changes is off, and what destroys asks first. Eject and mount are not
// jobs: their outcome is a toast (notify) wherever the owner clicked them.
import { createSignal, batch } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as dialog from 'zinc:system/dialog';
import { library, setLibrary, allowChanges, rescan, page, showPage, playlists, openPlaylist } from './state';
import { PodLibrary, readLibrary, downloadTracks, addTracks, removeTracks, ejectOpen } from './services/ipod';
import { enqueue, notify, runningJob, Job, JobLine } from './services/transfers';
import { log } from './services/log';
import { stop as stopPlaying } from './services/player';
import { dropCovers } from './services/covers';
import { count, bytes } from './format';
import { ADD_KINDS, MEDIA_EXTENSIONS, PAGE_ADD, REMOTE_LOCAL_ONLY } from './constants';

/** The download folder chosen with the picker ('' = the default, downloadFolder()). */
export const [downloadDir, setDownloadDir] = createSignal<string>('');
/** What adding does with the next files: their kind (TrackInput.mediaType) and a playlist to put them in ('' = none). */
export const [addKind, setAddKind] = createSignal<string>(ADD_KINDS[0]);
export const [addPlaylist, setAddPlaylist] = createSignal<string>('');
/** One line per file of the last add (the file and what happened to it). */
export const [addResults, setAddResults] = createSignal<ipod.AddResult[]>([]);
/** A message for the page that asked (a change refused while Allow changes is off). */
export const [notice, setNotice] = createSignal<string>('');
export const [backupList, setBackupList] = createSignal<ipod.Backup[]>([]);
/** The last check: null before one ran. */
export const [health, setHealth] = createSignal<ipod.Check | null>(null);

function lib(): PodLibrary | null { return library(); }
export function podName(): string { const l = lib(); return l !== null && (l as PodLibrary).device.name !== '' ? (l as PodLibrary).device.name : 'iPod'; }

/** A name safe for a folder (what zinc:ipod's download does to the tags). */
function safe(name: string): string {
  let s = '';
  for (let i = 0; i < name.length; i++) s += '/\\:*?"<>|'.indexOf(name[i]) >= 0 || name.charCodeAt(i) < 32 ? '_' : name[i];
  s = s.trim();
  while (s.startsWith('.')) s = s.slice(1);
  return s !== '' ? s : 'iPod';
}

/** Where downloads go: the folder chosen, else ~/Music/iPod/<the iPod's name> (IPOD_DEMO_DOWNLOADS replaces it: the tests). */
export function downloadFolder(): string {
  if (downloadDir() !== '') return downloadDir();
  const given = sys.env('IPOD_DEMO_DOWNLOADS');
  return given !== '' ? given : `${sys.env('HOME')}/Music/iPod/${safe(podName())}`;
}

/** Asks for another download folder (the system's folder picker). */
export async function chooseDownloadDir(): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = 'Download to';
  o.directory = true;
  o.defaultPath = downloadFolder();
  const picked = await dialog.open(o);
  if (picked !== null && (picked as string[]).length > 0) setDownloadDir((picked as string[])[0]);
}

/** True while the iPod open is a remote one (an iPod daemon's). */
export function remoteOpen(): boolean { const l = lib(); return l !== null && (l as PodLibrary).remote !== ''; }

/** False (and a notice) for what only an iPod plugged into this computer can do (backups, check, repair, optimise). */
export function localOnly(what: string): boolean {
  if (!remoteOpen()) return true;
  setNotice(`${what}: ${REMOTE_LOCAL_ONLY}`);
  return false;
}

/** False (and a notice) while Allow changes is off. */
export function allowed(what: string): boolean {
  if (allowChanges()) return true;
  setNotice(`${what}: turn on Allow changes first (the iPod and its backups are only read until then)`);
  log(what, 'refused: Allow changes is off', false);
  return false;
}

export async function confirm(question: string, detail: string, yes: string): Promise<boolean> {
  const o = new dialog.MessageOptions(question);
  o.detail = detail;
  o.kind = 'warning';
  o.buttons = [yes, 'Cancel'];
  return (await dialog.message(o)) === 0;
}

/** Reads the library again after a change, keeping the page shown. */
export async function refresh(): Promise<void> {
  const fresh = await readLibrary();
  setLibrary(fresh);
}

// ---- download (reads the iPod only: no switch)

/** Queues the copy of `tracks` to the download folder; `key` is what the control that asked shows busy for (a track's arrow). */
export function download(label: string, tracks: ipod.Track[], key: string = ''): void {
  if (lib() === null || tracks.length === 0) return;
  const dir = downloadFolder();
  enqueue('download', `Download ${label}`, async (): Promise<string> => {
    const res = await downloadTracks(tracks, dir);
    let copied = 0, skipped = 0, total = 0;
    const errors: string[] = [];
    const out: JobLine[] = [];
    for (const r of res) {
      if (r.error !== '') errors.push(r.error); else if (r.skipped) skipped++; else copied++;
      out.push(new JobLine(r.error === '', r.error !== '' ? r.error : `${r.file.slice(dir.length + 1)}${r.skipped ? '  (already there)' : ''}`, r.error !== '' ? -1 : sizeOf(r.file)));
      if (r.error === '' && !r.skipped) total += Math.max(0, sizeOf(r.file));
    }
    const job = runningJob();
    if (job !== null) { (job as Job).setLines(out); (job as Job).reveal = dir; }
    const line = `${count(copied, 'file', 'files')} copied (${bytes(total)}), ${skipped} already there${errors.length > 0 ? `, ${errors.length} failed (${errors[0]})` : ''} → ${dir}`;
    if (errors.length > 0 && copied + skipped === 0) throw new Error(line);
    return line;
  }, key);
}

// ---- add

/** The size of a file of the computer in bytes, -1 when it cannot be read. */
function sizeOf(path: string): number { try { return fs.stat(path).size; } catch (e) { return -1; } }

function extensionOf(path: string): string { const d = path.lastIndexOf('.'); return d > path.lastIndexOf('/') ? path.slice(d + 1).toLowerCase() : ''; }

/** The files of `paths`: a folder gives its media files (every level), a file is kept as it is (zinc:ipod says why it refuses one). */
export function mediaFiles(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.DirEntry[] = [];
    try { entries = fs.readDir(dir); } catch (e) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) walk(p);
      else if (e.isFile && MEDIA_EXTENSIONS.indexOf(extensionOf(e.name)) >= 0) out.push(p);
    }
  };
  for (const p of paths) {
    let isDir = false;
    try { isDir = fs.stat(p).isDirectory; } catch (e) { /* gone: zinc:ipod reports it */ }
    if (isDir) walk(p); else out.push(p);
  }
  return out;
}

/** Queues the copy of files (or folders) to the iPod as the chosen kind, into the chosen playlist; a result per file, then the
 *  library is read again. */
export function addFiles(paths: string[]): void {
  if (lib() === null) return;
  if (page() !== PAGE_ADD) showPage(PAGE_ADD);
  if (!allowed('Add to the iPod')) return;
  const files = mediaFiles(paths);
  if (files.length === 0) { setNotice('No music, podcast, audiobook or video files there'); return; }
  setNotice('');
  const kind = addKind(), playlist = addPlaylist().trim();
  const items: ipod.TrackInput[] = [];
  for (const f of files) items.push({ file: f, mediaType: kind });
  enqueue('add', `Add ${count(files.length, 'file', 'files')}${playlist !== '' ? ` to “${playlist}”` : ''}`, async (): Promise<string> => {
    const res = await addTracks(items, playlist);
    setAddResults(res);
    let added = 0;
    for (const r of res) if (r.error === '') added++;
    await refresh();
    const job = runningJob(), l = lib();
    if (job !== null) {   // the file's tags as the iPod now holds them, or why it was refused
      const out: JobLine[] = [];
      for (const r of res) {
        const file = r.file.slice(r.file.lastIndexOf('/') + 1);
        if (r.error !== '') { out.push(new JobLine(false, `${file}: ${r.error}`, sizeOf(r.file))); continue; }
        let t: ipod.Track | null = null;
        if (l !== null) for (const x of (l as PodLibrary).tracks) if (x.id === r.id) { t = x; break; }
        out.push(new JobLine(true, t === null ? file : `${t.title}${t.artist !== '' ? ` — ${t.artist}` : ''}${t.album !== '' ? ` · ${t.album}` : ''}  (${file})`, t !== null ? t.size : sizeOf(r.file)));
      }
      (job as Job).setLines(out);
    }
    if (res.length === 0) throw new Error('nothing was added');
    let total = 0;
    for (const x of job !== null ? (job as Job).lines() : []) if (x.ok && x.size > 0) total += x.size;
    return `${added} added (${bytes(total)}), ${res.length - added} refused`;
  });
}

/** The system's file picker: files, or a folder with `folder`. */
export async function pickAndAdd(folder: boolean): Promise<void> {
  if (!allowed('Add to the iPod')) return;
  const o = new dialog.OpenOptions();
  o.title = folder ? 'Add a folder to the iPod' : 'Add files to the iPod';
  o.multiple = !folder;
  o.directory = folder;
  if (!folder) o.filters = [new dialog.Filter('Music, podcasts, audiobooks and videos', MEDIA_EXTENSIONS)];
  const picked = await dialog.open(o);
  if (picked !== null) addFiles(picked as string[]);
}

// ---- backups

export async function refreshBackups(): Promise<void> {
  try { setBackupList(await ipod.backups()); } catch (e) { setNotice((e as Error).message); }
}

/** Copies the database (and with `music` the music, only what is new) to the computer: reads the iPod only. */
export function backupNow(music: boolean): void {
  if (lib() === null || !localOnly('Back up')) return;
  enqueue('backup', `Back up ${podName()}${music ? ' with its music' : ''}`, async (): Promise<string> => {
    const folder = await ipod.backup('', music);
    const job = runningJob();
    if (job !== null) (job as Job).reveal = folder;
    await refreshBackups();
    return `saved in ${folder}`;
  });
}

export async function restore(b: ipod.Backup): Promise<void> {
  const l = lib();
  if (l === null || !localOnly('Restore a backup') || !allowed('Restore a backup')) return;
  const mp = (l as PodLibrary).device.mountpoint;
  if (!(await confirm(`Restore ${podName()} from this backup?`, `The iPod's database is replaced by the one of ${b.folder} (${count(b.tracks, 'track', 'tracks')}). What is on the iPod now is backed up first.`, 'Restore'))) { log('Restore a backup', 'cancelled', true); return; }
  stopPlaying();
  enqueue('restore', `Restore ${b.folder}`, async (): Promise<string> => {
    await ipod.restoreBackup(b.folder, mp);
    await refresh();
    await refreshBackups();
    return `${count((library() as PodLibrary).tracks.length, 'track', 'tracks')} on the iPod`;
  });
}

export async function deleteBackup(b: ipod.Backup): Promise<void> {
  if (!allowed('Delete a backup')) return;
  if (!(await confirm('Delete this backup?', `${b.folder} (${bytes(b.bytes)}) is deleted from the computer. The music shared by the backups is kept.`, 'Delete'))) { log('Delete a backup', 'cancelled', true); return; }
  enqueue('delete', `Delete backup ${b.folder}`, async (): Promise<string> => {
    await ipod.deleteBackup(b.folder);
    await refreshBackups();
    return 'deleted';
  });
}

// ---- health, mount, eject

export function checkPod(): void {
  if (lib() === null || !localOnly('Check')) return;
  enqueue('check', `Check ${podName()}`, async (): Promise<string> => {
    const c = await ipod.check();
    setHealth(c);
    return `${count(c.missing.length, 'track', 'tracks')} without a file, ${count(c.orphans.length, 'file', 'files')} no track uses (${bytes(c.orphanBytes)})`;
  });
}

export async function repairPod(): Promise<void> {
  if (lib() === null || !localOnly('Repair') || !allowed('Repair the iPod')) return;
  if (!(await confirm(`Repair ${podName()}?`, 'Tracks whose file is gone are removed and files no track uses are deleted. The database is backed up first.', 'Repair'))) { log('Repair the iPod', 'cancelled', true); return; }
  stopPlaying();
  enqueue('repair', `Repair ${podName()}`, async (): Promise<string> => {
    const c = await ipod.repair();
    setHealth(c);
    await refresh();
    return 'repaired';
  });
}

/** Mounts an iPod seen over USB only (diskutil): nothing on it is written. */
export async function mountPod(): Promise<void> {
  try { await ipod.mount(''); log('Mount the iPod', 'mounted', true); notify('mount', 'Mount the iPod', 'Mounted: it opens in a moment', true); }
  catch (e) { setNotice((e as Error).message); log('Mount the iPod', (e as Error).message, false); notify('mount', 'Mount the iPod', (e as Error).message, false); }
  rescan(true);
}

/** Stops playback, closes the iPod and ejects it, so it shows "OK to disconnect". */
export async function ejectPod(): Promise<void> {
  const l = lib();
  if (l === null) return;
  const name = podName(), mp = (l as PodLibrary).device.mountpoint;
  if (runningJob() !== null) {
    const why = 'A transfer is running: wait for it, or cancel the ones waiting, then eject';
    setNotice(why); notify('eject', `Eject ${name}`, why, false); return;
  }
  stopPlaying();
  if ((l as PodLibrary).remote !== '') {   // the daemon ejects it, or refuses with its sentence and the iPod stays open
    try { await ejectOpen(mp); }
    catch (e) { setNotice((e as Error).message); log(`Eject ${name}`, (e as Error).message, false); notify('eject', `Eject ${name}`, (e as Error).message, false); return; }
    dropCovers();
    batch(() => { setLibrary(null); setHealth(null); });
    log(`Eject ${name}`, `${(l as PodLibrary).remote} ejected it: it can be unplugged from there`, true);
    notify('eject', `Eject ${name}`, `${(l as PodLibrary).remote} ejected it: it can be unplugged from there`, true);
    return;
  }
  dropCovers();
  batch(() => { setLibrary(null); setHealth(null); });
  try {
    await ejectOpen(mp);
    log(`Eject ${name}`, `${mp} ejected: it can be unplugged`, true);
    notify('eject', `Eject ${name}`, `Ejected: it can be unplugged`, true);
  } catch (e) {
    log(`Eject ${name}`, (e as Error).message, false);
    notify('eject', `Eject ${name}`, (e as Error).message, false);
  }
  rescan(true);
}

/** Removes the tracks and their files from the iPod, after a question (Allow changes); the library is read again. */
export async function deleteTracks(label: string, tracks: ipod.Track[]): Promise<void> {
  if (lib() === null || tracks.length === 0 || !allowed('Delete from the iPod')) return;
  if (!(await confirm(`Delete ${label} from ${podName()}?`, `${count(tracks.length, 'track is', 'tracks are')} removed from the iPod with ${tracks.length === 1 ? 'its file' : 'their files'}.`, 'Delete'))) { log('Delete from the iPod', 'cancelled', true); return; }
  const ids: string[] = [];
  for (const t of tracks) ids.push(t.id);
  stopPlaying();
  setNotice('');
  enqueue('delete', `Delete ${label}`, async (): Promise<string> => {
    try { await removeTracks(ids); }
    catch (e) { setNotice((e as Error).message); throw e; }   // the daemon's sentence (read only) on the page too
    await refresh();
    return `${count(ids.length, 'track', 'tracks')} removed`;
  });
}

// ---- playlists (Allow changes; an iPod plugged into this computer)

/** New playlist: an empty normal playlist ("untitled playlist", numbered when taken), filled from a song's menu (Add to playlist). */
export function newPlaylist(): void {
  if (!localOnly('New playlist') || !allowed('New playlist')) return;
  const taken: string[] = playlists().map((p: ipod.Playlist) => p.name);
  let name = 'untitled playlist';
  for (let n = 2; taken.indexOf(name) >= 0; n++) name = `untitled playlist ${n}`;
  enqueue('playlist', `New playlist “${name}”`, async (): Promise<string> => {
    const id = await ipod.createPlaylist(name);
    await ipod.save();
    await refresh();
    openPlaylist(id);
    return `“${name}” made`;
  });
}

/** Add to playlist: the songs at the end of the normal playlist `id`. */
export function addToPlaylist(id: string, tracks: ipod.Track[]): void {
  let p: ipod.Playlist | null = null;
  for (const x of playlists()) if (x.id === id) p = x;
  if (p === null || !localOnly('Add to playlist') || !allowed('Add to playlist')) return;
  const name = (p as ipod.Playlist).name, ids = (p as ipod.Playlist).trackIds.slice();
  for (const t of tracks) ids.push(t.id);
  enqueue('playlist', `Add to “${name}”`, async (): Promise<string> => {
    await ipod.setPlaylistTracks(id, ids);
    await ipod.save();
    await refresh();
    return `${count(tracks.length, 'song', 'songs')} added to “${name}”`;
  });
}
