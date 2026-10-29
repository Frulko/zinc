// MusicBrainz and the Cover Art Archive, for the Repair page: an album's release (search by title and artist), its year and genre (the
// release group's first release date and its most voted genre) and its front cover. MusicBrainz's rules are kept: a User-Agent that
// names the app and where to reach it, and at most one request a second (IPOD_MB_PACE_MS replaces the pace: the tests). What was found is
// kept in <backups>/cache/musicbrainz.jsonl, one JSON line per album asked (nothing found is kept too), and the covers in
// <backups>/cache/coverart/<release>.<ext>. IPOD_MUSICBRAINZ_URL and IPOD_COVERART_URL replace the services (the tests' stub).
import * as net from 'zinc:net';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { backupPlace } from './log';

const MB_URL = sys.env('IPOD_MUSICBRAINZ_URL') !== '' ? sys.env('IPOD_MUSICBRAINZ_URL') : 'https://musicbrainz.org/ws/2';
const CAA_URL = sys.env('IPOD_COVERART_URL') !== '' ? sys.env('IPOD_COVERART_URL') : 'https://coverartarchive.org';
const PACE_MS: number = sys.env('IPOD_MB_PACE_MS') !== '' ? Number(sys.env('IPOD_MB_PACE_MS')) : 1000;
const AGENT = 'ZincIPod/0.1 ( https://github.com/Frulko/zinc )';
const MIN_SCORE: number = 90;   // a search hit below this is not the album
const TIMEOUT_MS: i32 = 30000;

/** What MusicBrainz says of an album: its release ('' when none matched), year (0 unknown) and genre ('' unknown). */
export interface ReleaseInfo { key: string; release: string; year: i32; genre: string; }

let lastCall: number = 0;
function sleep(ms: number): Promise<void> { return new Promise<void>((r: () => void) => { setTimeout(r, ms); }); }

async function get(url: string): Promise<net.Response> {
  const wait = lastCall + PACE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const h = new net.Headers();
  h.set('User-Agent', AGENT);
  h.set('Accept', 'application/json');
  return await net.fetch(url, { headers: h, timeoutMs: TIMEOUT_MS });
}

async function json(url: string): Promise<any> {
  const r = await get(url);
  const body = await r.text();
  if (r.status === 404) return null;
  if (r.status >= 400) throw new Error(`MusicBrainz: HTTP ${r.status}`);
  return JSON.parse(body);
}

function cacheFile(): string { return `${backupPlace()}/cache/musicbrainz.jsonl`; }

/** The albums asked before, by key. */
export function known(): Map<string, ReleaseInfo> {
  const by = new Map<string, ReleaseInfo>();
  try {
    if (fs.exists(cacheFile())) for (const line of fs.readText(cacheFile()).split('\n')) {
      if (line === '') continue;
      try { const e: ReleaseInfo = JSON.parse(line); by.set(e.key, e); } catch (e) { /* a line cut short: asked again */ }
    }
  } catch (e) { /* unreadable: asked again */ }
  return by;
}

/** A phrase for MusicBrainz's search (Lucene): quoted, its quotes and backslashes escaped. */
function phrase(s: string): string { return `"${s.split('\\').join('\\\\').split('"').join('\\"')}"`; }

function capital(s: string): string { return s === '' ? s : s[0].toUpperCase() + s.slice(1); }

/** Asks MusicBrainz for the album `title` by `artist` (key: the app's album key) and keeps the answer. Throws on a network error. */
export async function lookUp(key: string, title: string, artist: string): Promise<ReleaseInfo> {
  const info: ReleaseInfo = { key: key, release: '', year: 0, genre: '' };
  const q = encodeURIComponent(`release:${phrase(title)} AND artist:${phrase(artist)}`);
  const found = await json(`${MB_URL}/release?query=${q}&fmt=json&limit=5`);
  const list: any = found !== null && found.releases !== undefined ? found.releases : [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (Number(r.score) < MIN_SCORE) continue;
    info.release = '' + r.id;
    const date: string = r.date !== undefined && r.date !== null ? '' + r.date : '';
    if (date.length >= 4) info.year = Number(date.slice(0, 4)) as i32;
    const group: string = r['release-group'] !== undefined ? '' + r['release-group'].id : '';
    if (group !== '') {
      const g = await json(`${MB_URL}/release-group/${group}?inc=genres&fmt=json`);
      if (g !== null) {
        const first: string = g['first-release-date'] !== undefined && g['first-release-date'] !== null ? '' + g['first-release-date'] : '';
        if (first.length >= 4) info.year = Number(first.slice(0, 4)) as i32;
        let best = 0;
        const genres: any = g.genres !== undefined ? g.genres : [];
        for (let k = 0; k < genres.length; k++) if (Number(genres[k].count) > best) { best = Number(genres[k].count); info.genre = capital('' + genres[k].name); }
      }
    }
    break;
  }
  fs.mkdir(`${backupPlace()}/cache`, true);
  fs.appendText(cacheFile(), JSON.stringify(info) + '\n');
  return info;
}

/** The release's front cover from the Cover Art Archive (500 px), downloaded once; '' when it has none. */
export async function frontCover(release: string): Promise<string> {
  const dir = `${backupPlace()}/cache/coverart`;
  for (const ext of ['jpg', 'png']) if (fs.exists(`${dir}/${release}.${ext}`)) return `${dir}/${release}.${ext}`;
  if (fs.exists(`${dir}/${release}.none`)) return '';
  fs.mkdir(dir, true);
  const r = await get(`${CAA_URL}/release/${release}/front-500`);
  if (r.status === 404) { fs.writeText(`${dir}/${release}.none`, ''); return ''; }
  if (r.status >= 400) throw new Error(`Cover Art Archive: HTTP ${r.status}`);
  const file = `${dir}/${release}.${r.headers.get('Content-Type').indexOf('png') >= 0 ? 'png' : 'jpg'}`;
  fs.writeBytes(`${file}.part`, await r.bytes());
  fs.rename(`${file}.part`, file);
  return file;
}
