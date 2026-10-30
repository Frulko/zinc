// What the recommendations (Genius, For you) are made from, one line per source, as Settings › Recommendations shows it: the Last.fm
// history (services/history.ts), the similar artists from Last.fm (services/genius.ts, <history>/similar-artists.jsonl) and AudioMuse's
// results (services/audiomuse.ts). Read from disk; no UI and no app state here (pages/settings/PrepareFields.tsx runs the jobs).
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { Row } from 'zinc:sqlite';
import { History } from './history';
import { readArtistGraph } from './genius';
import { Budget } from './slice';
import { Deep } from './audiomuse';
import { count } from '../format';

/** 38882 -> "38,882". */
export function thousands(n: number): string {
  const s = `${Math.round(n)}`;
  let out = '';
  for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0 && s[i - 1] !== '-') out += ','; out += s[i]; }
  return out;
}

/** How long before `now` the time `at` was (Unix seconds): "just now", "5 minutes ago", "1 hour ago", "2 days ago". */
export function ago(at: number, now: number): string {
  const s = now - at;
  if (s < 60) return 'just now';
  if (s < 3600) return `${count(Math.floor(s / 60), 'minute', 'minutes')} ago`;
  if (s < 86400) return `${count(Math.floor(s / 3600), 'hour', 'hours')} ago`;
  return `${count(Math.floor(s / 86400), 'day', 'days')} ago`;
}

/** "Last.fm history: 38,882 listens, imported 2 days ago" (or not imported yet, or stopped). */
export function historyLine(h: History | null, now: number): string {
  if (h === null) return 'Last.fm history: not imported yet';
  const r = (h as History).db.prepare("SELECT count(*) AS n FROM listens WHERE source = 'lastfm'").get([]);
  const n = r !== null ? (r as Row).number('n') : 0;
  if ((h as History).get('lastfm.running') === '1') return `Last.fm history: ${thousands(n)} listens so far, import unfinished at page ${(h as History).get('lastfm.pages')}`;
  const at = (h as History).getNumber('lastfm.newest');
  return at > 0 ? `Last.fm history: ${thousands(n)} listens, imported ${ago(at, now)}` : n > 0 ? `Last.fm history: ${thousands(n)} listens` : 'Last.fm history: not imported yet';
}

export class Similar { n: number = 0; at: number = 0; }

/** The similar artists kept in the history folder `dir`: how many artists, and when the file was written (Unix seconds); read within a
 *  budget (a few thousand artists are megabytes of JSON). */
export async function similarKnown(dir: string): Promise<Similar> {
  const k = new Similar();
  k.n = (await readArtistGraph(dir, new Budget())).size;
  k.at = similarWritten(dir);
  return k;
}

/** When the similar artists' file of `dir` was last written (Unix seconds), 0 when there is none: cheap, to know when to read it again. */
export function similarWritten(dir: string): number {
  let at = 0;
  for (const f of [`${dir}/similar-artists.jsonl`, `${dir}/similar-artists.json`]) {
    try { if (fs.exists(f)) at = Math.max(at, fs.stat(f).mtimeMs / 1000); } catch (e) { /* unreadable: no date */ }
  }
  return at;
}

/** "Similar artists: 1,376 known, updated 3 days ago", from similarKnown. */
export function similarLine(k: Similar, now: number): string {
  return k.n > 0 ? `Similar artists: ${thousands(k.n)} known, updated ${ago(k.at, now)}` : 'Similar artists: none yet (they need the Last.fm API key)';
}

/** "AudioMuse: 2,131 of 2,334 songs analysed, synced 1 hour ago" for the iPod's `tracks`; `setUp` false: not set up. */
export function museLine(d: Deep | null, tracks: ipod.Track[], setUp: boolean, now: number): string {
  if (d === null) return setUp ? 'AudioMuse: never synced' : 'AudioMuse: not set up (its card below)';
  let songs: i32 = 0;
  for (const t of tracks) if (t.mediaType === 'audio' || t.mediaType === '') songs++;
  return `AudioMuse: ${thousands((d as Deep).tracks.length)} of ${thousands(songs)} songs analysed, synced ${ago((d as Deep).syncedAt, now)}`;
}
