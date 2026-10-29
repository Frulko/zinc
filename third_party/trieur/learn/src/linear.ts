// Rung 2: an online linear model (margin perceptron / logistic).
//
// Weights that are **learned** rather than counted. Where Bayes adds up frequencies assuming
// independence, this one corrects its weights when it is wrong: two correlated features stop
// voting twice, and a crossed feature (`domain:github×tag:rust`) can carry a weight neither
// `domain:github` nor `tag:rust` has.
//
// Three choices that matter:
//
// 1. **Contrastive update**, not dense. Textbook multinomial logistic regression updates
//    *every* class on every example: the weight matrix becomes |vocab| × |zones|, hundreds of
//    thousands of entries to serialise inside a browser. So we only touch two zones: the
//    right one, and the best of the wrong ones. That is the multiclass perceptron update, and
//    it stays sparse.
// 2. **AdaGrad rather than a fixed step.** The usual complaint about an online model is "a
//    learning rate to tune". AdaGrad tunes it per feature: a rare feature keeps a large step,
//    a feature seen everywhere calms down on its own. Six lines, one hyperparameter fewer.
// 3. **Pruning.** Crossed features blow the vocabulary up. Past `maxVocab`, the features
//    whose peak weight is lowest are dropped — the ones that never tipped a decision.

import type { Feature, Model, ModelJSON, Ranked } from './types.js';
import { softmax } from './types.js';

export interface LinearOptions {
  /** base learning rate (AdaGrad modulates it per feature) */
  lr?: number;
  /** margin required between the right zone and the best wrong one */
  margin?: number;
  minExamples?: number;
  /** past this, the least useful features are pruned */
  maxVocab?: number;
}

export class Linear implements Model {
  readonly kind = 'linear';
  lr: number;
  margin: number;
  minExamples: number;
  maxVocab: number;
  examples = 0;

  /** zone → feature → weight */
  #w = new Map<string, Map<Feature, number>>();
  /** zone → feature → sum of squared gradients (AdaGrad) */
  #g2 = new Map<string, Map<Feature, number>>();
  #bias = new Map<string, number>();
  #vocab = new Set<Feature>();

  constructor(opts: LinearOptions = {}) {
    this.lr = opts.lr ?? 0.5;
    this.margin = opts.margin ?? 1;
    this.minExamples = opts.minExamples ?? 3;
    this.maxVocab = opts.maxVocab ?? 40_000;
  }

  get vocabSize(): number {
    return this.#vocab.size;
  }
  get targets(): string[] {
    return [...this.#w.keys()];
  }

  /** Raw score of a zone: bias plus the weights of the features present. */
  #score(features: Feature[], target: string): number {
    const w = this.#w.get(target);
    if (!w) return 0;
    let s = this.#bias.get(target) ?? 0;
    for (const f of features) s += w.get(f) ?? 0;
    return s;
  }

  #row(target: string): Map<Feature, number> {
    let w = this.#w.get(target);
    if (!w) {
      w = new Map();
      this.#w.set(target, w);
      this.#g2.set(target, new Map());
      this.#bias.set(target, 0);
    }
    return w;
  }

  /** One AdaGrad step on a zone. */
  #step(target: string, features: Feature[], g: number): void {
    const w = this.#row(target);
    const g2 = this.#g2.get(target)!;
    for (const f of features) {
      const acc = (g2.get(f) ?? 0) + g * g;
      g2.set(f, acc);
      w.set(f, (w.get(f) ?? 0) + (this.lr * g) / (Math.sqrt(acc) + 1e-8));
      this.#vocab.add(f);
    }
    this.#bias.set(target, (this.#bias.get(target) ?? 0) + this.lr * g * 0.1);
  }

  /**
   * A negative `weight` approximately undoes the example: the step is replayed the other way.
   * It is not the exact inverse (AdaGrad has already moved its accumulators), but on an
   * isolated undo the difference is invisible — and an online model has no exact memory of
   * its past anyway.
   */
  learn(features: Feature[], target: string, weight = 1): void {
    this.#row(target);
    const rivals = this.targets.filter((t) => t !== target);
    // the best wrong zone: that is what we correct against
    let worst: string | null = null;
    let worstScore = -Infinity;
    for (const t of rivals) {
      const s = this.#score(features, t);
      if (s > worstScore) {
        worstScore = s;
        worst = t;
      }
    }
    this.examples += weight;

    if (!worst) {
      // only one known zone: nothing to contrast against, so nudge it gently
      this.#step(target, features, 0.1 * weight);
      return;
    }
    const good = this.#score(features, target);
    const gap = good - worstScore;
    if (weight > 0 && gap >= this.margin) return; // already right with margin to spare: leave it alone

    // logistic gradient over the pair {right, wrong} — 1 when badly wrong, near 0 when it was
    // nearly right
    const g = weight * (1 / (1 + Math.exp(gap)));
    this.#step(target, features, g);
    this.#step(worst, features, -g);
    if (this.#vocab.size > this.maxVocab) this.#prune();
  }

  predict(features: Feature[], targets: string[]): Ranked[] {
    const ids = targets.length ? targets : this.targets;
    if (this.examples < this.minExamples || !ids.length) return [];
    // same rule as Bayes: a feature never seen says nothing, so it must not vote
    const feats = features.filter((f) => this.#vocab.has(f));
    if (!feats.length) return [];

    const scores = ids.map((id) => this.#score(feats, id));
    const why = ids.map((id) => {
      const w = this.#w.get(id);
      if (!w) return [];
      return feats
        .map((f) => ({ f, v: w.get(f) ?? 0 }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3)
        .map((x) => x.f);
    });
    return softmax(scores)
      .map((score, i) => ({ id: ids[i]!, score, why: why[i]! }))
      .sort((a, b) => b.score - a.score);
  }

  /** Drops the features that never tipped a decision. */
  #prune(): void {
    const peak = new Map<Feature, number>();
    for (const w of this.#w.values()) {
      for (const [f, v] of w) peak.set(f, Math.max(peak.get(f) ?? 0, Math.abs(v)));
    }
    const keep = new Set(
      [...peak.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.floor(this.maxVocab * 0.8))
        .map(([f]) => f),
    );
    for (const [t, w] of this.#w) {
      const g2 = this.#g2.get(t)!;
      for (const f of [...w.keys()]) {
        if (!keep.has(f)) {
          w.delete(f);
          g2.delete(f);
        }
      }
    }
    this.#vocab = keep;
  }

  toJSON(): ModelJSON {
    return {
      kind: this.kind,
      v: 1,
      lr: this.lr,
      margin: this.margin,
      minExamples: this.minExamples,
      maxVocab: this.maxVocab,
      examples: this.examples,
      w: Object.fromEntries([...this.#w].map(([k, m]) => [k, Object.fromEntries(m)])),
      g2: Object.fromEntries([...this.#g2].map(([k, m]) => [k, Object.fromEntries(m)])),
      bias: Object.fromEntries(this.#bias),
    };
  }

  static fromJSON(data: any, opts: LinearOptions = {}): Linear {
    const l = new Linear({
      lr: data?.lr,
      margin: data?.margin,
      minExamples: data?.minExamples,
      maxVocab: data?.maxVocab,
      ...opts,
    });
    for (const [id, feats] of Object.entries((data?.w ?? {}) as Record<string, Record<string, number>>)) {
      const m = new Map(Object.entries(feats));
      l.#w.set(id, m);
      l.#g2.set(id, new Map(Object.entries((data?.g2?.[id] ?? {}) as Record<string, number>)));
      l.#bias.set(id, data?.bias?.[id] ?? 0);
      for (const f of m.keys()) l.#vocab.add(f);
    }
    l.examples = data?.examples ?? 0;
    return l;
  }
}
