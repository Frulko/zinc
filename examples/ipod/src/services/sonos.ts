// Sonos as an output (zinc:sonos): the groups of the house, the one chosen, and the URLs a speaker fetches the iPod's songs from. A
// local iPod's files are served by a small zinc:net server of this app on the LAN (a free port, a random token in every path, only the
// tracks of the open iPod by their id: no path from the request reaches the disk); a remote iPod's files come straight from its daemon
// (/api/file/<id>?token=). Only services/player.ts and the output picker call this file.
import { createSignal, batch } from 'zinc:ui/solid';
import * as sonos from 'zinc:sonos';
import * as net from 'zinc:net';
import * as os from 'zinc:os';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { PodLibrary } from './ipod';
import * as remote from './remote';
import { loadConfig, saveConfig } from './config';
import { backupPlace } from './log';

/** A group as the picker lists it. */
export class OutputChoice {
  id: string; name: string;
  constructor(id: string, name: string) { this.id = id; this.name = name; }
}

export const [outputs, setOutputs] = createSignal<OutputChoice[]>([]);
/** The group the music plays on, '' for this computer. */
export const [output, setOutput] = createSignal<string>('');
export const [searching, setSearching] = createSignal<boolean>(false);
export const [sonosError, setSonosError] = createSignal<string>('');
export const [pickerOpen, setPickerOpen] = createSignal<boolean>(false);

let house: sonos.System | null = null;

/** Finds the Sonos groups: IPOD_DEMO_SONOS (a speaker's address), else the speaker that answered last time, else an SSDP search. */
export async function findSpeakers(): Promise<void> {
  if (searching()) return;
  batch(() => { setSearching(true); setSonosError(''); });
  const config = loadConfig();
  const known = sys.env('IPOD_DEMO_SONOS') !== '' ? sys.env('IPOD_DEMO_SONOS') : config.sonosSeed;
  try {
    const found = await sonos.discover(known, 2000);
    house = found;
    const list: OutputChoice[] = [];
    for (const g of found.groups) list.push(new OutputChoice(g.id, g.name()));
    setOutputs(list);
    if (config.sonosSeed !== found.seed) { config.sonosSeed = found.seed; saveConfig(config); }
  } catch (e) {
    setSonosError((e as Error).message);
  }
  setSearching(false);
}

/** The group chosen, null for this computer (or when it left the house). */
export function chosenGroup(): sonos.Group | null {
  const h = house;
  return h === null || output() === '' ? null : (h as sonos.System).group(output());
}
export function system(): sonos.System { return house as sonos.System; }

// ---- the songs as URLs a speaker can fetch

const TYPES: string[] = ['mp3', 'audio/mpeg', 'm4a', 'audio/mp4', 'm4b', 'audio/mp4', 'm4p', 'audio/mp4', 'mp4', 'audio/mp4', 'aac', 'audio/aac',
  'wav', 'audio/wav', 'aif', 'audio/aiff', 'aiff', 'audio/aiff', 'flac', 'audio/flac'];
function mimeOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const i = dot < 0 ? -1 : TYPES.indexOf(path.slice(dot + 1).toLowerCase());
  return i >= 0 && i % 2 === 0 ? TYPES[i + 1] : '*';
}

let port: i32 = 0;
let token = '';
let shared: Map<string, ipod.Track> = new Map<string, ipod.Track>();
let sharedMount = '';

function hex(bytes: u8[]): string { let s = ''; for (const b of bytes) s += (b < 16 ? '0' : '') + (b as i32).toString(16); return s; }

/** The four bytes of an IPv4 address, [] when it is not one. */
function octets(a: string): i32[] {
  const out: i32[] = [];
  for (const x of a.split('.')) { const v = parseInt(x); if (isNaN(v) || v < 0 || v > 255) return []; out.push(v as i32); }
  return out.length === 4 ? out : [];
}
/** This computer's address on the speaker's network (the interface whose subnet holds `speaker`), else its first LAN address. */
export function addressFor(speaker: string): string {
  const target = octets(speaker);
  let first = '';
  for (const nic of os.networkInterfaces()) {
    if (nic.family !== 'IPv4') continue;
    const a = octets(nic.address), m = octets(nic.netmask);
    let same = a.length === 4 && m.length === 4 && target.length === 4;
    for (let i = 0; same && i < 4; i++) same = (a[i] & m[i]) === (target[i] & m[i]);
    if (same) return nic.address;
    if (first === '' && !nic.internal) first = nic.address;
  }
  return first !== '' ? first : '127.0.0.1';
}

async function serveSong(req: net.Request): Promise<net.Reply> {
  const parts = req.path.split('?')[0].split('/');   // '', token, 'file' | 'cover', id
  const t = parts.length === 4 && parts[1] === token ? shared.get(decodeURIComponent(parts[3])) : undefined;
  if (t === undefined) return { status: 404, body: 'not found', contentType: 'text/plain' };
  const track = t as ipod.Track;
  if (parts[2] === 'file') return { status: 200, body: '', contentType: mimeOf(track.path), file: `${sharedMount}/${track.path}` };
  if (parts[2] !== 'cover' || !track.artwork) return { status: 404, body: 'not found', contentType: 'text/plain' };
  const png = `${backupPlace()}/sonos-covers/${track.id}.png`;
  fs.mkdir(`${backupPlace()}/sonos-covers`, true);
  if (!fs.exists(png) && !(await ipod.saveArtwork(track.id, png))) return { status: 404, body: 'no cover', contentType: 'text/plain' };
  return { status: 200, body: '', contentType: 'image/png', file: png };
}

/** Serves the open iPod's tracks (started the first time, the tracks replaced when another iPod is open). */
function share(lib: PodLibrary): void {
  if (port === 0) { token = hex(sys.randomBytes(16)); port = net.serveAsync(0, serveSong); }
  if (sharedMount === lib.device.mountpoint && shared.size === lib.tracks.length) return;
  shared = new Map<string, ipod.Track>();
  for (const t of lib.tracks) shared.set(t.id, t);
  sharedMount = lib.device.mountpoint;
}

/** The tracks as songs the group fetches: from the daemon for a remote iPod, else from this app's server. */
export function songsOf(lib: PodLibrary, g: sonos.Group, tracks: ipod.Track[]): sonos.Song[] {
  let base = '';
  if (lib.remote === '') { share(lib); base = `http://${addressFor(g.coordinator.ip.split(':')[0])}:${port}/${token}`; }
  const out: sonos.Song[] = [];
  for (const t of tracks) {
    const s = new sonos.Song();
    const id = encodeURIComponent(t.id);
    s.url = lib.remote !== '' ? remote.fileUrl(t.id) : `${base}/file/${id}`;
    s.title = t.title !== '' ? t.title : 'Untitled'; s.artist = t.artist; s.album = t.album;
    s.mime = mimeOf(t.path); s.duration = t.durationMs / 1000;
    if (t.artwork) s.art = lib.remote !== '' ? remote.coverUrl(t.id) : `${base}/cover/${id}`;
    out.push(s);
  }
  return out;
}
