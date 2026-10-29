// The iPod, through zinc:ipod: find the iPods, open one and read its library (tracks, playlists, specs, photos, notes and other
// files), read it again after a change, close it. Nothing here writes to the iPod: the changes are the jobs of state's actions,
// behind the Allow changes switch.
import * as ipod from 'zinc:ipod';
import * as sys from 'zinc:sys';

/** IPOD_DEMO_MOUNT=<folder> shows only the iPod mounted there (the tests use it to keep to their fake iPod). */
const onlyMount = sys.env('IPOD_DEMO_MOUNT');

/** Everything the pages show of an open iPod. */
export class PodLibrary {
  device: ipod.Device;
  tracks: ipod.Track[];
  playlists: ipod.Playlist[];
  specs: ipod.SpecItem[];
  photoAlbums: ipod.PhotoAlbum[];
  extras: ipod.Extra[];
  constructor(device: ipod.Device, tracks: ipod.Track[], playlists: ipod.Playlist[], specs: ipod.SpecItem[], photoAlbums: ipod.PhotoAlbum[], extras: ipod.Extra[]) {
    this.device = device; this.tracks = tracks; this.playlists = playlists; this.specs = specs; this.photoAlbums = photoAlbums; this.extras = extras;
  }
}

/** The iPods plugged in: mounted ones first, then those seen on USB only. */
export async function findPods(): Promise<ipod.Device[]> {
  const found = await ipod.detect();
  const out: ipod.Device[] = [];
  for (const d of found) if (d.connection === 'disk' && (onlyMount === '' || d.mountpoint === onlyMount)) out.push(d);
  for (const d of found) if (d.connection !== 'disk' && onlyMount === '') out.push(d);
  return out;
}

let openMount = '';

/** Opens the iPod at `mountpoint` (closing the one open before) and reads its tracks, playlists and specs. */
export async function openPod(mountpoint: string): Promise<PodLibrary> {
  if (openMount !== '') await closePod();
  await ipod.open(mountpoint);
  openMount = mountpoint;
  return await readLibrary();
}

/** Reads the open iPod's library again (after an add, a restore or a repair), its free space measured again. */
export async function readLibrary(): Promise<PodLibrary> {
  const device = await ipod.info();
  const tracks = await ipod.tracks();
  const playlists = await ipod.playlists();
  const specs = await ipod.specs();
  let photoAlbums: ipod.PhotoAlbum[] = [];
  try { photoAlbums = await ipod.photoAlbums(); } catch (e) { /* a damaged Photo Database: the music is still shown */ }
  const extras = await ipod.extras();
  return new PodLibrary(device, tracks, playlists, specs, photoAlbums, extras);
}

export async function closePod(): Promise<void> {
  if (openMount === '') return;
  openMount = '';
  await ipod.close();
}

/** The iPod was ejected or pulled: zinc:ipod closed it or will fail; forget it here. */
export function forgetPod(): void { openMount = ''; }
