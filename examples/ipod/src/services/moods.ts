// Mood mixes made to order (the mixer of For you): a mood (Chill, Focus, Party, Workout, Melancholy, Happy), an energy and a tempo
// make a list. When AudioMuse-AI analysed the iPod (services/audiomuse.ts, attached to the model), each analysed song is scored by its
// moods (other_features: danceable, aggressive, happy, party, relaxed, sad, each against the library's mean, weighed per mood), its
// energy (its rank in the library, 0..1) and its tempo; without it, by the genre tags the mood names and the BPM field (energy is not
// known then). pages/foryou/MoodMixer.tsx shows it.
import * as ipod from 'zinc:ipod';
import { Model, path } from './genius';
import { Deep, moodsOf } from './audiomuse';

export class Mood {
  id: string; name: string;
  /** AudioMuse's moods and how much each counts (negative: away from it). */
  moods: string[]; weights: number[];
  /** Words of the genres it means, without AudioMuse. */
  genres: string[];
  /** Where the sliders start: energy 0..1, tempo in BPM. */
  energy: number; tempo: number;
  constructor(id: string, name: string, moods: string[], weights: number[], genres: string[], energy: number, tempo: number) {
    this.id = id; this.name = name; this.moods = moods; this.weights = weights; this.genres = genres; this.energy = energy; this.tempo = tempo;
  }
}

export const MOODS: Mood[] = [
  new Mood('chill', 'Chill', ['relaxed', 'aggressive', 'party'], [1, -0.6, -0.3], ['ambient', 'chill', 'lounge', 'downtempo', 'acoustic', 'jazz', 'folk', 'soul', 'trip'], 0.25, 90),
  new Mood('focus', 'Focus', ['relaxed', 'aggressive', 'party', 'danceable'], [0.6, -0.6, -0.6, -0.3], ['classical', 'ambient', 'instrumental', 'soundtrack', 'piano', 'jazz', 'post'], 0.35, 100),
  new Mood('party', 'Party', ['party', 'danceable', 'happy', 'relaxed'], [1, 1, 0.4, -0.4], ['dance', 'disco', 'house', 'pop', 'hip', 'funk', 'electronic', 'r&b'], 0.8, 122),
  new Mood('workout', 'Workout', ['aggressive', 'danceable', 'party', 'relaxed'], [0.8, 0.6, 0.4, -0.6], ['rock', 'metal', 'punk', 'electronic', 'hip', 'drum', 'dance', 'techno'], 0.9, 135),
  new Mood('melancholy', 'Melancholy', ['sad', 'relaxed', 'happy', 'party'], [1, 0.3, -0.6, -0.5], ['blues', 'folk', 'singer', 'indie', 'soul', 'classical', 'alternative'], 0.3, 80),
  new Mood('happy', 'Happy', ['happy', 'danceable', 'sad'], [1, 0.4, -0.6], ['pop', 'reggae', 'funk', 'soul', 'disco', 'country'], 0.65, 115),
];

export function moodOf(id: string): Mood { for (const m of MOODS) if (m.id === id) return m; return MOODS[0]; }

/** A list made: its songs, and whether AudioMuse's analysis made it (false: genre and BPM only). */
export class MoodMix { tracks: ipod.Track[] = []; deep: boolean = false; }

function tempoGap(bpm: number, target: number): number { return bpm > 0 && target > 0 ? Math.abs(Math.log2(bpm / target)) : 0.5; }

/** `n` songs for the mood `mood` at `energy` (0..1) and `tempo` (BPM), in Genius' path order from the best one. */
export function moodMix(m: Model, mood: Mood, energy: number, tempo: number, n: i32 = 30): MoodMix {
  const out = new MoodMix();
  const score: number[] = [];
  for (let i = 0; i < m.tracks.length; i++) score.push(-1e18);
  const pool: i32[] = [];
  if (m.deep !== null) {
    out.deep = true;
    const d = m.deep as Deep;
    const rows: Map<string, number>[] = [], at: i32[] = [], energies: number[] = [];
    const mean = new Map<string, number>();
    for (const t of d.tracks) {
      const i = m.index.get(t.id);
      if (i === undefined || !m.pickable(i as i32)) continue;
      const x = moodsOf(t);
      x.forEach((v: number, k: string) => { mean.set(k, (mean.has(k) ? mean.get(k) as number : 0) + v); });
      rows.push(x); at.push(i as i32); energies.push(t.energy);
    }
    mean.forEach((v: number, k: string) => { mean.set(k, v / rows.length); });
    const sorted = energies.slice();
    sorted.sort((a: number, b: number) => a - b);
    const rankOf = new Map<number, i32>();   // each energy's first place in the order
    for (let k = sorted.length - 1; k >= 0; k--) rankOf.set(sorted[k], k as i32);
    const tempos = new Map<i32, number>();
    for (const t of d.tracks) { const i = m.index.get(t.id); if (i !== undefined) tempos.set(i as i32, t.tempo); }
    for (let k = 0; k < rows.length; k++) {
      let s = 0;
      for (let j = 0; j < mood.moods.length; j++) {
        const v = rows[k].get(mood.moods[j]);
        if (v !== undefined) s += mood.weights[j] * ((v as number) - (mean.get(mood.moods[j]) as number));
      }
      const rank = sorted.length > 1 ? (rankOf.get(energies[k]) as i32) / (sorted.length - 1) : 0.5;
      s -= Math.abs(rank - energy) + tempoGap(tempos.get(at[k]) as number, tempo);
      score[at[k]] = s;
      pool.push(at[k]);
    }
  } else {
    for (let i: i32 = 0; i < m.tracks.length; i++) {
      if (!m.pickable(i)) continue;
      const g = m.genre[i];   // folded: lower case, no accents
      let s = 0;
      for (const w of mood.genres) if (g.indexOf(w) >= 0) { s = 1; break; }
      score[i] = s - tempoGap(m.tracks[i].bpm, tempo) + m.prior[i];
      pool.push(i);
    }
  }
  if (pool.length === 0) return out;
  pool.sort((a: i32, b: i32) => score[b] - score[a] !== 0 ? score[b] - score[a] : m.tracks[a].id < m.tracks[b].id ? -1 : 1);
  const top = pool.slice(0, Math.min(pool.length, 2 * n));
  for (const i of path(m, top[0], top, score, n)) out.tracks.push(m.tracks[i]);
  return out;
}
