// zinc:spotify — the Spotify Web API for a remote (docs/plugins/spotify.md, docs/reports/spotify-web-api.md): the account's
// playlists, liked songs, recent plays and search, and starting them on a Spotify Connect device (a Sonos room, a computer...).
// The login is done once on a computer (plugins/spotify/login.py, PKCE): it writes { client_id, refresh_token }; this module
// refreshes the access token, saves the refresh token Spotify rotates, and calls the API over HTTPS.
import { exists, readText, writeText } from 'zinc:fs';
import { env } from 'zinc:sys';

const API = 'https://api.spotify.com/v1';
const TIMEOUT_MS = 10000;

/** Something to play or show: a playlist, an album, an artist, a track, the liked songs. `uri` is a Spotify URI. */
export class Item {
  kind: string = '';
  uri: string = '';
  name: string = '';
  /** The artists, or a playlist's owner. */
  subtitle: string = '';
  /** A cover about 300 px wide ('' when none). */
  art: string = '';
  /** The same cover about 64 px wide, for a list row: a fifth of the decoding time on a slow CPU. */
  thumb: string = '';
  /** A track: its album or playlist, to play the track inside it (the next ones follow). */
  context: string = '';
}

/** A Spotify Connect device. `restricted`: Spotify accepts no command for it (some Sonos speakers). */
export class Device {
  id: string = '';
  name: string = '';
  type: string = '';
  active: boolean = false;
  restricted: boolean = false;
  volume: i32 = -1;
}

/** The account's playback. */
export class Playback {
  active: boolean = false;
  playing: boolean = false;
  device: Device = new Device();
  item: Item = new Item();
  progressMs: number = 0;
  durationMs: number = 0;
  shuffle: boolean = false;
  /** off, track or context. */
  repeat: string = 'off';
  context: string = '';
}

export class SpotifyError extends Error {
  status: i32;
  constructor(message: string, status: i32) { super(message); this.status = status; }
}

/** The URL of the image whose width is closest to `size`. */
function pickArt(images: any, size: number = 300): string {
  if (images === undefined || images === null || images.length === 0) return '';
  let best = '' + images[0].url, gap = 1e9;
  for (let i = 0; i < images.length; i++) {
    const w = images[i].width === null || images[i].width === undefined ? 300 : images[i].width as number;
    if (Math.abs(w - size) < gap) { gap = Math.abs(w - size); best = '' + images[i].url; }
  }
  return best;
}
function names(artists: any): string {
  const out: string[] = [];
  if (artists !== undefined && artists !== null) for (let i = 0; i < artists.length; i++) out.push('' + artists[i].name);
  return out.join(', ');
}
function trackItem(t: any): Item {
  const it = new Item();
  it.kind = '' + t.type; it.uri = '' + t.uri; it.name = '' + t.name; it.subtitle = names(t.artists);
  if (t.album !== undefined && t.album !== null) { it.art = pickArt(t.album.images); it.thumb = pickArt(t.album.images, 64); it.context = '' + t.album.uri; }
  else if (t.images !== undefined) { it.art = pickArt(t.images); it.thumb = pickArt(t.images, 64); }   // an episode
  return it;
}
function listItem(p: any): Item {
  const it = new Item();
  it.kind = '' + p.type; it.uri = '' + p.uri; it.name = '' + p.name; it.art = pickArt(p.images); it.thumb = pickArt(p.images, 64);
  if (p.type === 'playlist') it.subtitle = p.owner !== undefined && p.owner !== null ? '' + p.owner.display_name : '';
  else it.subtitle = names(p.artists);
  return it;
}

/** One account. `file` holds { client_id, refresh_token } and is rewritten when Spotify rotates the token. */
export class Spotify {
  file: string;
  clientId: string = '';
  private refreshToken: string = '';
  private token: string = '';
  private expires: number = 0;
  userId: string = '';
  /** Why the account cannot be used ('' when it can): no login file, or a login to do again (it expires after six months). */
  problem: string = '';

  constructor(file: string) {
    // a program without its own login file takes the machine's shared one, $ZINC_HOME/spotify.json (~/.zinc), so every app of a desktop
    // uses one login (login.py writes it there); a device (Android, webOS) gets that file beside the app when it is installed
    const home = env('ZINC_HOME') !== '' ? env('ZINC_HOME') : env('HOME') !== '' ? env('HOME') + '/.zinc' : '';
    this.file = !exists(file) && home !== '' && exists(home + '/spotify.json') ? home + '/spotify.json' : file;
    if (!exists(this.file)) { this.problem = 'not logged in'; return; }
    try {
      const j = JSON.parse(readText(this.file));
      this.clientId = '' + j.client_id; this.refreshToken = '' + j.refresh_token;
    } catch (e) { this.problem = 'unreadable login file'; }
  }
  ready(): boolean { return this.problem === ''; }

  private async refresh(): Promise<void> {
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.refreshToken)}&client_id=${encodeURIComponent(this.clientId)}`;
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', body, timeoutMs: TIMEOUT_MS, headers: [['Content-Type', 'application/x-www-form-urlencoded']],
    });
    const j = JSON.parse(await r.text());
    if (r.status !== 200) {
      if (j.error === 'invalid_grant') this.problem = 'login expired';
      throw new SpotifyError(`token: ${j.error}`, r.status as i32);
    }
    this.token = '' + j.access_token;
    this.expires = Date.now() + (j.expires_in as number - 60) * 1000;
    if (j.refresh_token !== undefined && j.refresh_token !== null && j.refresh_token !== this.refreshToken) {
      this.refreshToken = '' + j.refresh_token;
      writeText(this.file, JSON.stringify({ client_id: this.clientId, refresh_token: this.refreshToken }));
    }
  }

  /** One API call; the parsed answer, or null for an empty one (204). Retries once on an expired token. @throws SpotifyError */
  async call(method: string, path: string, body: string = ''): Promise<any> {
    if (!this.ready()) throw new SpotifyError(this.problem, 0);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.token === '' || Date.now() > this.expires) await this.refresh();
      const init: any = { method, timeoutMs: TIMEOUT_MS, headers: [['Authorization', 'Bearer ' + this.token], ['Content-Type', 'application/json']] };
      if (body !== '' || method === 'PUT' || method === 'POST') init.body = body;
      const r = await fetch(API + path, init);
      const text = await r.text();
      if (r.status === 401 && attempt === 0) { this.token = ''; continue; }
      if (r.status >= 300) {
        let reason = '' + r.status;
        try { const j = JSON.parse(text); if (j.error !== undefined) reason = '' + (j.error.reason ?? j.error.message ?? reason); } catch (e) { /* not JSON */ }
        throw new SpotifyError(`${method} ${path.split('?')[0]}: ${reason}`, r.status as i32);
      }
      if (text === '') return null;
      return JSON.parse(text);
    }
    return null;
  }

  async me(): Promise<string> {
    const j = await this.call('GET', '/me');
    this.userId = '' + j.id;
    return '' + j.display_name;
  }

  /** The lists are read a page at a time: `limit` items (50 at most, Spotify's limit) from `offset`; fewer than `limit` means the last page. */
  async playlists(offset: i32 = 0, limit: i32 = 50): Promise<Item[]> {
    const out: Item[] = [];
    const j = await this.call('GET', `/me/playlists?limit=${limit}&offset=${offset}`);
    for (let i = 0; i < j.items.length; i++) if (j.items[i] !== null) out.push(listItem(j.items[i]));
    return out;
  }
  async likedTracks(offset: i32 = 0, limit: i32 = 50): Promise<Item[]> {
    const out: Item[] = [];
    const j = await this.call('GET', `/me/tracks?limit=${limit}&offset=${offset}`);
    for (let i = 0; i < j.items.length; i++) out.push(trackItem(j.items[i].track));
    return out;
  }
  async albums(offset: i32 = 0, limit: i32 = 50): Promise<Item[]> {
    const out: Item[] = [];
    const j = await this.call('GET', `/me/albums?limit=${limit}&offset=${offset}`);
    for (let i = 0; i < j.items.length; i++) out.push(listItem(j.items[i].album));
    return out;
  }
  /** Recently played tracks, newest first, each once. */
  async recent(): Promise<Item[]> {
    const out: Item[] = [];
    const seen: string[] = [];
    const j = await this.call('GET', '/me/player/recently-played?limit=50');
    for (let i = 0; i < j.items.length; i++) {
      const it = trackItem(j.items[i].track);
      if (j.items[i].context !== null && j.items[i].context !== undefined) it.context = '' + j.items[i].context.uri;
      if (seen.indexOf(it.uri) >= 0) continue;
      seen.push(it.uri); out.push(it);
    }
    return out;
  }
  /** Tracks, playlists, albums and artists matching the words (10 of each, Spotify's limit). */
  async search(q: string): Promise<Item[]> {
    const out: Item[] = [];
    const j = await this.call('GET', `/search?q=${encodeURIComponent(q)}&type=track,playlist,album,artist&limit=10`);
    for (const key of ['tracks', 'playlists', 'albums', 'artists']) {
      const part = j[key];
      if (part === undefined || part === null) continue;
      for (let i = 0; i < part.items.length; i++) if (part.items[i] !== null) out.push(key === 'tracks' ? trackItem(part.items[i]) : listItem(part.items[i]));
    }
    return out;
  }

  async devices(): Promise<Device[]> {
    const out: Device[] = [];
    const j = await this.call('GET', '/me/player/devices');
    for (let i = 0; i < j.devices.length; i++) {
      const d = j.devices[i], dev = new Device();
      dev.id = d.id === null ? '' : '' + d.id; dev.name = '' + d.name; dev.type = '' + d.type;
      dev.active = d.is_active === true; dev.restricted = d.is_restricted === true;
      dev.volume = d.volume_percent === null ? -1 : d.volume_percent as i32;
      out.push(dev);
    }
    return out;
  }
  /** The device named so (a Sonos room's name, case ignored), or null. */
  async device(name: string): Promise<Device | null> {
    for (const d of await this.devices()) if (d.name.toLowerCase() === name.toLowerCase() && d.id !== '') return d;
    return null;
  }

  async playback(): Promise<Playback> {
    const p = new Playback();
    const j = await this.call('GET', '/me/player?additional_types=episode');
    if (j === null) return p;
    p.active = true; p.playing = j.is_playing === true;
    p.shuffle = j.shuffle_state === true; p.repeat = '' + j.repeat_state;
    p.progressMs = j.progress_ms === null ? 0 : j.progress_ms as number;
    if (j.context !== null && j.context !== undefined) p.context = '' + j.context.uri;
    if (j.device !== null && j.device !== undefined) { p.device.id = j.device.id === null ? '' : '' + j.device.id; p.device.name = '' + j.device.name; p.device.restricted = j.device.is_restricted === true; }
    if (j.item !== null && j.item !== undefined) { p.item = trackItem(j.item); p.durationMs = j.item.duration_ms as number; }
    return p;
  }

  /** Plays an item on a device: a playlist, album or artist from its start, a track inside its context (album or playlist) when it has one,
   *  the liked songs ('liked'). */
  async play(it: Item, deviceId: string): Promise<void> {
    let body = '';
    if (it.kind === 'liked') body = `{"context_uri":"spotify:user:${this.userId}:collection"}`;
    else if (it.kind === 'track' || it.kind === 'episode') body = it.context !== '' && !it.context.startsWith('spotify:artist:')
      ? `{"context_uri":${JSON.stringify(it.context)},"offset":{"uri":${JSON.stringify(it.uri)}}}` : `{"uris":[${JSON.stringify(it.uri)}]}`;
    else body = `{"context_uri":${JSON.stringify(it.uri)}}`;
    await this.call('PUT', `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, body);
  }
  /** Moves the playback to a device. */
  async transfer(deviceId: string, play: boolean): Promise<void> { await this.call('PUT', '/me/player', `{"device_ids":[${JSON.stringify(deviceId)}],"play":${play}}`); }
  async setShuffle(on: boolean): Promise<void> { await this.call('PUT', `/me/player/shuffle?state=${on}`); }
  /** off, track or context. */
  async setRepeat(mode: string): Promise<void> { await this.call('PUT', `/me/player/repeat?state=${mode}`); }
  async queue(uri: string): Promise<void> { await this.call('POST', `/me/player/queue?uri=${encodeURIComponent(uri)}`); }
  async isLiked(uri: string): Promise<boolean> { const j = await this.call('GET', `/me/library/contains?uris=${encodeURIComponent(uri)}`); return j !== null && j[0] === true; }
  async setLiked(uri: string, liked: boolean): Promise<void> { await this.call(liked ? 'PUT' : 'DELETE', `/me/library?uris=${encodeURIComponent(uri)}`); }
}
