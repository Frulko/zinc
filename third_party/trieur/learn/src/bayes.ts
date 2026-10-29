// Rung 1: multinomial naive Bayes.
//
// Why this one first: it learns from the 3rd example (no training phase), fits in a hundred
// lines, serialises to JSON, and above all it **explains itself** — "suggested because
// tag:react and domain:github.com".
//
// Its ceiling is known and accepted: it assumes features are independent. "github" and
// "rust" vote separately, never together. Two answers to that, in order of value for money:
// feed it crossed features (`crosses()`, no model change at all), then move to a linear model
// that learns weights instead of counting (`Linear`).

import type { Feature, Model, ModelJSON, Ranked } from './types.js';
import { softmax } from './types.js';

export interface BayesOptions {
  /** Laplace smoothing: higher is more cautious */
  alpha?: number;
  /** below this, suggest nothing */
  minExamples?: number;
}

export class Bayes implements Model {
  readonly kind = 'bayes';
  alpha: number;
  minExamples: number;
  examples = 0;

  /** zone → feature → count */
  #counts = new Map<string, Map<Feature, number>>();
  /** zone → total number of features seen */
  #totals = new Map<string, number>();
  /** zone → number of cards filed */
  #docs = new Map<string, number>();
  #vocab = new Set<Feature>();

  constructor(opts: BayesOptions = {}) {
    this.alpha = opts.alpha ?? 0.4;
    this.minExamples = opts.minExamples ?? 3;
  }

  get vocabSize(): number {
    return this.#vocab.size;
  }
  get targets(): string[] {
    return [...this.#counts.keys()];
  }

  learn(features: Feature[], target: string, weight = 1): void {
    if (!this.#counts.has(target)) {
      this.#counts.set(target, new Map());
      this.#totals.set(target, 0);
      this.#docs.set(target, 0);
    }
    const c = this.#counts.get(target)!;
    for (const f of features) {
      c.set(f, (c.get(f) ?? 0) + weight);
      this.#vocab.add(f);
    }
    this.#totals.set(target, this.#totals.get(target)! + features.length * weight);
    this.#docs.set(target, this.#docs.get(target)! + weight);
    this.examples += weight;
  }

  predict(features: Feature[], targets: string[]): Ranked[] {
    const ids = targets.length ? targets : this.targets;
    if (this.examples < this.minExamples || !ids.length) return [];
    // Features never seen before are ignored. Without this, every unknown word of a title
    // penalises the zone that has learned a lot (its denominator is large) and hands the win
    // to an untouched zone: the model would systematically suggest the empty folders.
    const feats = features.filter((f) => this.#vocab.has(f));
    if (!feats.length) return [];

    const V = Math.max(this.#vocab.size, 1);
    const why: Feature[][] = [];
    const logp = ids.map((id) => {
      const c = this.#counts.get(id) ?? new Map<Feature, number>();
      const total = this.#totals.get(id) ?? 0;
      // log P(zone) + Σ log P(feature | zone), smoothed — logs avoid underflow
      let lp = Math.log(((this.#docs.get(id) ?? 0) + this.alpha) / (this.examples + this.alpha * ids.length));
      const hits: Array<{ f: Feature; n: number }> = [];
      for (const f of feats) {
        const n = c.get(f) ?? 0;
        lp += Math.log((n + this.alpha) / (total + this.alpha * V));
        if (n > 0) hits.push({ f, n });
      }
      why.push(
        hits
          .sort((a, b) => b.n - a.n)
          .slice(0, 3)
          .map((h) => h.f),
      );
      return lp;
    });

    return softmax(logp)
      .map((score, i) => ({ id: ids[i]!, score, why: why[i]! }))
      .sort((a, b) => b.score - a.score);
  }

  toJSON(): ModelJSON {
    return {
      kind: this.kind,
      v: 1,
      alpha: this.alpha,
      minExamples: this.minExamples,
      examples: this.examples,
      counts: Object.fromEntries([...this.#counts].map(([k, m]) => [k, Object.fromEntries(m)])),
      docs: Object.fromEntries(this.#docs),
    };
  }

  static fromJSON(data: any, opts: BayesOptions = {}): Bayes {
    const b = new Bayes({ alpha: data?.alpha, minExamples: data?.minExamples, ...opts });
    for (const [id, feats] of Object.entries((data?.counts ?? {}) as Record<string, Record<string, number>>)) {
      const m = new Map(Object.entries(feats));
      b.#counts.set(id, m);
      b.#totals.set(
        id,
        [...m.values()].reduce((a, x) => a + x, 0),
      );
      for (const f of m.keys()) b.#vocab.add(f);
    }
    for (const [id, n] of Object.entries((data?.docs ?? {}) as Record<string, number>)) b.#docs.set(id, n);
    b.examples = data?.examples ?? [...b.#docs.values()].reduce((a, x) => a + x, 0);
    return b;
  }
}
