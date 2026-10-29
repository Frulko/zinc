// The assembly — and the one rung that is not really a rung.
//
// The three models do not have the same strengths at the same time: kNN is the only one
// answering over the first ten cards, Bayes holds the middle game, the linear model takes over
// when volume rises and features interact. Rather than picking once and for all, we let them
// vote.
//
// **The weights are measured, not decreed.** Before an example is learned, every member is
// asked and its answer compared to the real filing. That is prequential evaluation — test
// before learning — so it is never measured on examples already seen. The accumulated
// mistakes give the weights through the experts algorithm (`hedge.ts`), which guarantees
// doing as well as the best member in the long run.
//
// Measured on a real corpus of 3,412 links across 72 folders: 35.8% top-1 and 60.9% top-3,
// against 33.1 / 57.1 for the best member on its own (`tools/bench.ts`).

import { blend, hedge } from './hedge.js';
import type { Feature, Model, ModelJSON, Ranked, Stats } from './types.js';

interface Member {
  model: Model;
  hits: number;
  seen: number;
}

export class Ensemble implements Model {
  readonly kind = 'ensemble';
  #members: Member[];
  #hits = 0;
  #seen = 0;

  constructor(models: Model[]) {
    this.#members = models.map((model) => ({ model, hits: 0, seen: 0 }));
  }

  get models(): Model[] {
    return this.#members.map((m) => m.model);
  }

  get examples(): number {
    return Math.max(0, ...this.#members.map((m) => m.model.examples));
  }

  get vocabSize(): number {
    return Math.max(0, ...this.#members.map((m) => (m.model as { vocabSize?: number }).vocabSize ?? 0));
  }

  get targets(): string[] {
    return [...new Set(this.#members.flatMap((m) => (m.model as { targets?: string[] }).targets ?? []))];
  }

  /** Each member's weight, through the experts algorithm (see `hedge.ts`). */
  get weights(): Record<string, number> {
    const w = hedge(this.#members);
    return Object.fromEntries(this.#members.map((m, i) => [m.model.kind, w[i]!]));
  }

  learn(features: Feature[], target: string, weight = 1): void {
    // Test before learning: the measured accuracy stays honest. Every member is asked once
    // and its answer reused for the vote — otherwise each filing would cost two full
    // predictions.
    if (weight > 0) {
      const votes = this.#members.map((m) => m.model.predict(features, []));
      this.#members.forEach((m, i) => {
        const top = votes[i]![0];
        if (!top) return;
        m.seen++;
        if (top.id === target) m.hits++;
      });
      const mine = this.#blend(votes)[0];
      if (mine) {
        this.#seen++;
        if (mine.id === target) this.#hits++;
      }
    }
    for (const m of this.#members) m.model.learn(features, target, weight);
  }

  predict(features: Feature[], targets: string[]): Ranked[] {
    return this.#blend(this.#members.map((m) => m.model.predict(features, targets)));
  }

  /** Blends the distributions, weighted by each member's measured accuracy. */
  #blend(votes: Ranked[][]): Ranked[] {
    return blend(votes, hedge(this.#members));
  }

  stats(): Stats {
    return {
      examples: this.examples,
      targets: this.targets.length,
      vocab: this.vocabSize,
      accuracy: this.#seen ? this.#hits / this.#seen : 0,
      members: Object.fromEntries(this.#members.map((m) => [m.model.kind, m.seen ? m.hits / m.seen : 0])),
    };
  }

  toJSON(): ModelJSON {
    return {
      kind: this.kind,
      v: 1,
      hits: this.#hits,
      seen: this.#seen,
      members: this.#members.map((m) => ({ hits: m.hits, seen: m.seen, model: m.model.toJSON() })),
    };
  }

  static fromJSON(data: any, revive: (json: ModelJSON) => Model): Ensemble {
    const members = ((data?.members ?? []) as Array<{ hits: number; seen: number; model: ModelJSON }>).map((m) => ({
      model: revive(m.model),
      hits: m.hits ?? 0,
      seen: m.seen ?? 0,
    }));
    const e = new Ensemble(members.map((m) => m.model));
    e.#members = members;
    e.#hits = data?.hits ?? 0;
    e.#seen = data?.seen ?? 0;
    return e;
  }
}
