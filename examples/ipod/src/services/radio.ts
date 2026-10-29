// A guided radio (Genius that never ends): from a seed song, the queue is topped up by itself with songs picked as Genius picks them
// (services/genius.ts), close to the seeds (the song it started from and every 👍) and to the last songs queued, never one queued before
// in the radio, the artists spread across the extensions. 👎 on a song pushes the next picks away from it and leaves its artist out for
// the rest of the radio. Songs are kept by id, so the radio outlives a model built again. No UI and no player here: src/radio.ts keeps
// the queue topped up; nothing is saved to the iPod.
import * as ipod from 'zinc:ipod';
import { Model, path } from './genius';

/** The songs queued last that the next picks follow (with the seeds). */
const RECENT: i32 = 5;

export class Radio {
  /** The song it started from, then the songs given a 👍 (track ids). */
  seeds: string[] = [];
  /** Songs given a 👎: the picks move away from them. */
  disliked: string[] = [];
  /** Artists of the songs given a 👎 (normalised, as Model.artist): never picked again. */
  bannedArtists: Set<string> = new Set<string>();
  /** Every song queued in this radio: never picked twice. */
  used: Set<string> = new Set<string>();
}

/** A radio from `seedId`; null when the seed is not a music track of the model. */
export function startRadio(m: Model, seedId: string): Radio | null {
  if (!m.index.has(seedId)) return null;
  const r = new Radio();
  r.seeds.push(seedId);
  r.used.add(seedId);
  return r;
}

/** 👍 on `id`: a seed from now on. */
export function like(r: Radio, id: string): void { if (r.seeds.indexOf(id) < 0) r.seeds.push(id); }

/** 👎 on `id`: the picks move away from it, its artist is out. */
export function dislike(m: Model, r: Radio, id: string): void {
  if (r.disliked.indexOf(id) < 0) r.disliked.push(id);
  const k = r.seeds.indexOf(id);
  if (k > 0) r.seeds.splice(k, 1);   // the song it started from stays a seed
  const at = m.index.get(id);
  if (at !== undefined && m.artist[at as i32] !== '') r.bannedArtists.add(m.artist[at as i32]);
}

/** Forgets that the songs `ids` were queued (taken off the queue before they played: they may be picked again). */
export function unqueue(r: Radio, ids: string[]): void { for (const id of ids) r.used.delete(id); }

function indices(m: Model, ids: string[]): i32[] {
  const out: i32[] = [];
  for (const id of ids) { const at = m.index.get(id); if (at !== undefined) out.push(at as i32); }
  return out;
}

function mean(m: Model, list: i32[], i: i32): number {
  let s = 0;
  for (const a of list) s += m.pair(a, i);
  return list.length > 0 ? s / list.length : 0;
}

/** The next `n` songs of the radio after `queued` (the ids of the radio's queue so far, oldest first, songs added by hand included),
 *  marked as used: close to the seeds and to the last songs queued, away from the songs disliked, in Genius' path order from the last
 *  song queued. Fewer (or none) when the library runs out. Deterministic. */
export function extend(m: Model, r: Radio, queued: string[], n: i32): ipod.Track[] {
  for (const id of queued) r.used.add(id);
  const trail = indices(m, queued);
  const seeds = indices(m, r.seeds), disliked = indices(m, r.disliked);
  if (trail.length === 0) { if (seeds.length === 0) return []; trail.push(seeds[0]); }
  const recent = trail.slice(Math.max(0, trail.length - RECENT));
  const score: number[] = [];
  const pool: i32[] = [];
  for (let i: i32 = 0; i < m.tracks.length; i++) {
    score.push(0);
    if (r.used.has(m.tracks[i].id) || !m.pickable(i) || r.bannedArtists.has(m.artist[i])) continue;
    score[i] = 0.6 * mean(m, seeds, i) + 0.4 * mean(m, recent, i) - 0.5 * mean(m, disliked, i) + m.prior[i];
    pool.push(i);
  }
  pool.sort((a: i32, b: i32) => score[b] - score[a] !== 0 ? score[b] - score[a] : m.tracks[a].id < m.tracks[b].id ? -1 : 1);
  const last = trail[trail.length - 1];
  const picked = path(m, last, pool.slice(0, Math.max(4 * n, 100)), score, n + 1, trail.slice(0, trail.length - 1));
  const out: ipod.Track[] = [];
  for (let k = 1; k < picked.length; k++) { const t = m.tracks[picked[k]]; out.push(t); r.used.add(t.id); }
  return out;
}
