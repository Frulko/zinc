export { Bayes, type BayesOptions } from './bayes.js';
export { Linear, type LinearOptions } from './linear.js';
export { Knn, type KnnOptions } from './knn.js';
export { Ensemble } from './ensemble.js';
export { blend, hedge, type Tally } from './hedge.js';
export { defaultModel, modelFromJSON } from './models.js';

export { crosses, defaultFeatures, only, pipe, tokens, words, type Extractor, type Transform } from './features.js';

export { autoStore, idbStore, localStore, memoryStore, type Store } from './store.js';

export {
  createRecommender,
  HybridRecommender,
  LocalRecommender,
  type HybridOptions,
  type LocalOptions,
  type Recommender,
  type RecommenderConfig,
} from './recommender.js';

export { Client, HttpError, type ClientOptions } from './remote.js';
export * from './protocol.js';
export { softmax, type Feature, type Model, type ModelJSON, type Prediction, type Ranked, type SortRecord, type Stats } from './types.js';
