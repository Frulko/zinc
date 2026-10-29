// The registry: from JSON back to the matching model, and the recommended default.

import { Bayes } from './bayes.js';
import { Ensemble } from './ensemble.js';
import { Knn } from './knn.js';
import { Linear } from './linear.js';
import type { Model, ModelJSON } from './types.js';

/**
 * The default model: the three rungs together, weighted by their measured accuracy.
 *
 * Taken separately none of them wins everywhere — that is what `tools/bench.ts` shows. kNN
 * answers alone over the first cards, Bayes is solid in the middle, the linear model wins
 * when features interact.
 */
export const defaultModel = (): Ensemble => new Ensemble([new Bayes(), new Linear(), new Knn()]);

/** Rebuilds a serialised model. Unknown or missing JSON yields the default model. */
export function modelFromJSON(json: ModelJSON | null | undefined): Model {
  switch (json?.kind) {
    case 'bayes':
      return Bayes.fromJSON(json);
    case 'linear':
      return Linear.fromJSON(json);
    case 'knn':
      return Knn.fromJSON(json);
    case 'ensemble':
      return Ensemble.fromJSON(json, modelFromJSON);
    default:
      return defaultModel();
  }
}
