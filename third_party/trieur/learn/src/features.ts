// From metadata to features.
//
// The choice of features matters more than the choice of model. Which is why they are
// extracted here, once, and every model receives exactly the same list: comparing two models
// only means something on the same features.

import type { Feature } from './types.js';

const STOP = new Set(
  ('the a an of to in on for and or is are with as at by from this that it its you your ' +
    'le la les un une des de du et ou en au aux pour par sur avec sans dans').split(' '),
);

/** Splits a text value into useful tokens (words of 3 to 24 letters, no stop words). */
export function words(s: string): string[] {
  return String(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && w.length <= 24 && !STOP.has(w));
}

/** An extractor turns arbitrary metadata into features. */
export type Extractor = (meta: unknown) => Feature[];

/**
 * Default features: every property becomes one or more `key:value` tokens.
 *
 * - array → one feature per element (`tag:react`)
 * - short text (≤ 3 words) → one feature as-is (`domain:github.com`)
 * - long text → one feature per word (`title:hooks`)
 *
 * Numbers and booleans are ignored: they do not discriminate a filing, and a sparse model
 * would not know what to do with them.
 */
export const tokens: Extractor = (meta) => {
  const out: Feature[] = [];
  for (const [k, v] of Object.entries((meta ?? {}) as Record<string, unknown>)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      out.push(...v.filter((x): x is string => typeof x === 'string').map((x) => `${k}:${x.toLowerCase()}`));
    } else if (typeof v === 'string') {
      if (v.trim().split(/\s+/).length <= 3) out.push(`${k}:${v.trim().toLowerCase()}`);
      else out.push(...words(v).map((x) => `${k}:${x}`));
    }
  }
  return [...new Set(out)];
};

/** A feature transform: takes the list, returns another one. */
export type Transform = (features: Feature[]) => Feature[];

const keyOf = (f: Feature) => f.slice(0, f.indexOf(':'));

/**
 * Crossed features: `domain:github.com` + `tag:rust` → `domain:github.com×tag:rust`.
 *
 * This is the best value for money on the whole ladder. Naive Bayes assumes features are
 * independent: to it, "github and rust" is exactly the sum of "github" and "rust". Which is
 * wrong — the combination files somewhere neither of them would. Manufacturing the cross
 * makes the combination visible **without changing model**.
 *
 * The price is vocabulary explosion: n values × m values. Hence two guard rails: only an
 * explicit list of key pairs is crossed, and at most `max` values per key (a page's tags are
 * already sorted by relevance by the caller). The linear model then prunes what never helped.
 */
export function crosses(pairs: Array<[string, string]>, max = 4): Transform {
  return (features) => {
    const byKey = new Map<string, Feature[]>();
    for (const f of features) {
      const k = keyOf(f);
      const list = byKey.get(k) ?? [];
      if (list.length < max) list.push(f);
      byKey.set(k, list);
    }
    const out = [...features];
    for (const [a, b] of pairs) {
      for (const fa of byKey.get(a) ?? []) {
        for (const fb of byKey.get(b) ?? []) {
          if (fa !== fb) out.push(fa < fb ? `${fa}×${fb}` : `${fb}×${fa}`); // stable order
        }
      }
    }
    return [...new Set(out)];
  };
}

/** Keeps only the features whose key is listed. */
export function only(...keys: string[]): Transform {
  const set = new Set(keys);
  return (features) => features.filter((f) => set.has(keyOf(f)));
}

/** Chains an extractor and a few transforms. */
export function pipe(base: Extractor, ...steps: Transform[]): Extractor {
  return (meta) => steps.reduce<Feature[]>((f, step) => step(f), base(meta));
}

/** The recommended extractor: tokens plus domain/author/host × tag crosses. */
export const defaultFeatures: Extractor = pipe(
  tokens,
  crosses([
    ['domain', 'tag'],
    ['author', 'tag'],
    ['host', 'tag'],
  ]),
);
