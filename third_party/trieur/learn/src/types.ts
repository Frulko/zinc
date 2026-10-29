// The contract every model shares.
//
// A model never sees a domain object: it sees a list of **sparse features**, `key:value`
// strings. That is what lets you swap models without touching anything else, and compare two
// models on the same features (see `bench.ts`).

/** A feature: a `key:value` string, for instance `domain:github.com`. */
export type Feature = string;

/** A ranked zone, with the features that carried the decision. */
export interface Ranked {
  id: string;
  /** in [0,1], summing to 1 over the zones asked about */
  score: number;
  why: Feature[];
}

/** Same shape as `Prediction` from `@trieur/core`: the two packages stay independent. */
export type Prediction = Ranked;

export interface ModelJSON {
  kind: string;
  v: number;
  [k: string]: unknown;
}

export interface Model {
  /** model type identifier, used when deserialising */
  readonly kind: string;
  /** number of examples learned (undos bring it back down) */
  readonly examples: number;

  /** Learns one filing. A negative `weight` undoes an example. */
  learn(features: Feature[], target: string, weight?: number): void;

  /**
   * Ranks `targets` for these features.
   *
   * Returns `[]` to mean "I do not know" — too few examples, or no recognised feature.
   * **Saying nothing costs less than guessing**: a bad suggestion erodes trust in every
   * suggestion that follows.
   */
  predict(features: Feature[], targets: string[]): Ranked[];

  toJSON(): ModelJSON;
}

export interface Stats {
  examples: number;
  targets: number;
  vocab: number;
  /** top-1 accuracy measured prequentially (test before learning) */
  accuracy: number;
  /** per-member accuracy, for an ensemble */
  members?: Record<string, number>;
}

/** One filing, as the deck hands it over (same shape as `SortRecord` from `@trieur/core`). */
export interface SortRecord<T = unknown> {
  item?: T;
  meta: unknown;
  zoneId: string;
  predicted?: string | null;
  at?: number;
  /** raw text of the item, when the server should compute an embedding for it */
  text?: string;
}

/** Softmax of an array of scores → a distribution summing to 1. Goes through the max to
 *  avoid `exp` overflowing. */
export function softmax(scores: number[]): number[] {
  if (!scores.length) return [];
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}
