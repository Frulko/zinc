// Combining several opinions without decreeing which one is right.
//
// This is the experts algorithm (Hedge / multiplicative weights), and it is used in two
// places: between the sparse models of an `Ensemble`, and server-side between the sparse
// models and the embeddings. One file for both, otherwise the two formulas drift apart the
// day one of them is touched.

import { softmax, type Feature, type Ranked } from './types.js';

export interface Tally {
  hits: number;
  seen: number;
}

/**
 * Weights a set of experts from their past mistakes.
 *
 * Each expert weighs `exp(-η × its mistakes)`, with `η = √(2 ln N / T)`. That rate decreases
 * with the number of rounds: early on the weights stay close (we do not yet know who is
 * right), then the gap widens as evidence accumulates. The classic guarantee of the
 * algorithm is that in the long run the ensemble does as well as its best expert — without
 * anyone having had to name it in advance.
 *
 * An expert that was never asked counts as wrong half the time: neutral, so it does not take
 * over merely by being new.
 */
export function hedge(tallies: Tally[]): number[] {
  if (!tallies.length) return [];
  const n = Math.max(tallies.length, 2);
  const rounds = Math.max(...tallies.map((t) => t.seen), 1);
  const eta = Math.sqrt((2 * Math.log(n)) / rounds);
  return softmax(tallies.map((t) => -eta * (t.seen ? (t.seen - t.hits) / t.seen : 0.5) * rounds));
}

/** Weighted blend of rankings. An expert that says nothing (`[]`) carries no weight. */
export function blend(votes: Ranked[][], weights: number[]): Ranked[] {
  const scores = new Map<string, number>();
  const why = new Map<string, Feature[]>();
  let voted = false;
  votes.forEach((ranked, i) => {
    if (!ranked.length) return;
    voted = true;
    const w = weights[i] ?? 0;
    for (const r of ranked) {
      scores.set(r.id, (scores.get(r.id) ?? 0) + w * r.score);
      if (r.why.length && !why.has(r.id)) why.set(r.id, r.why);
    }
  });
  if (!voted) return [];
  const sum = [...scores.values()].reduce((a, b) => a + b, 0) || 1;
  return [...scores.entries()]
    .map(([id, s]) => ({ id, score: s / sum, why: why.get(id) ?? [] }))
    .sort((a, b) => b.score - a.score);
}
