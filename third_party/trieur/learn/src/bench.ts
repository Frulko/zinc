// Measuring, rather than believing.
//
// Protocol: **prequential**, that is, test-then-learn. Every card is first shown to the model,
// which has never seen it; we note whether it was right; only then does it learn. No
// train/test split to rig, no leakage possible, and the number you get is exactly what the
// user experiences: the accuracy of a model discovering the corpus as it goes.
//
// The zones offered are the ones **already encountered** — we do not ask the model to guess a
// folder that does not exist yet.
//
// This is exported (`@trieur/learn/bench`) rather than buried in a script: the day you
// hesitate between two feature extractors, the answer should come from your corpus, not from
// a table in a README.

import { crosses, tokens, type Extractor } from './features.js';
import type { Model } from './types.js';

export interface Card {
  meta: unknown;
  target: string;
}

export interface Run {
  name: string;
  /** accuracy of the first suggestion */
  top1: number;
  /** the right zone is among the first three */
  top3: number;
  /** share of cards where the model chose to stay silent */
  silent: number;
  vocab: number;
  ms: number;
  asked: number;
}

/** The extractor with crosses, the one behind `defaultFeatures`. */
export const crossed: Extractor = (meta) =>
  crosses([
    ['domain', 'tag'],
    ['author', 'tag'],
    ['host', 'tag'],
  ])(tokens(meta));

export function evaluate(name: string, model: Model, extract: Extractor, cards: Card[]): Run {
  const seen = new Set<string>();
  let hit1 = 0;
  let hit3 = 0;
  let silent = 0;
  let asked = 0;
  const t0 = Date.now();

  for (const card of cards) {
    const features = extract(card.meta);
    // the model is only judged once it has at least two zones to get wrong
    if (seen.size > 1) {
      asked++;
      const ranked = model.predict(features, [...seen]);
      if (!ranked.length) silent++;
      else {
        if (ranked[0]!.id === card.target) hit1++;
        if (ranked.slice(0, 3).some((r) => r.id === card.target)) hit3++;
      }
    }
    model.learn(features, card.target);
    seen.add(card.target);
  }

  return {
    name,
    top1: asked ? hit1 / asked : 0,
    top3: asked ? hit3 / asked : 0,
    silent: asked ? silent / asked : 0,
    vocab: (model as Model & { vocabSize?: number }).vocabSize ?? 0,
    ms: Date.now() - t0,
    asked,
  };
}

// --- synthetic corpus ---------------------------------------------------------
//
// Built to look like a real filing stream, with the three regimes you meet in practice: some
// domains always go to the same place (marginal signal), some domain × tag pairs decide with
// nothing to hint at it feature by feature (interaction), and one draw in ten goes elsewhere
// (noise). Without the interaction regime every model ties and the bench proves nothing.

export interface SynthCard extends Card {
  meta: { domain: string; tag: string[]; title: string };
}

/** Deterministic PRNG: two runs give the same corpus, hence comparable numbers. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOMAINS = ['github.com', 'x.com', 'youtube.com', 'medium.com', 'reddit.com', 'arxiv.org'];
const TAGS = ['rust', 'js', 'css', 'ml', 'cooking', 'photo', 'diy', 'finance', 'games', 'cycling', 'garden', 'law'];
const ZONES = ['dev', 'ai', 'design', 'personal', 'home', 'watch', 'to-read', 'archive'];
const WORDS = 'guide tutorial takeaways tool quick comparison introduction advanced practical note sheet method tip overview'.split(' ');

export function synth(n = 2000, seed = 7): SynthCard[] {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

  const table = new Map<string, string>();
  for (const d of DOMAINS) for (const t of TAGS) table.set(`${d}|${t}`, pick(ZONES));
  const marginal = new Map<string, string>([
    ['arxiv.org', 'ai'],
    ['reddit.com', 'watch'],
  ]);

  return Array.from({ length: n }, () => {
    const domain = pick(DOMAINS);
    const tag = pick(TAGS);
    const truth = marginal.get(domain) ?? table.get(`${domain}|${tag}`)!;
    const target = rnd() < 0.1 ? pick(ZONES) : truth;
    // the title talks about the subject, never about the zone: slipping the answer in there
    // would make the bench flattering and useless
    const title = [tag, ...Array.from({ length: 4 }, () => pick(WORDS))].join(' ');
    return { meta: { domain, tag: [tag, pick(TAGS)], title }, target };
  });
}
