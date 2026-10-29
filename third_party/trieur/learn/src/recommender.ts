// What an app plugs in: a recommender.
//
// It is the only object a host handles. It exposes exactly what `@trieur/core` expects from
// an `Advisor` — so `deck.setOptions({ advisor: recommender })` is enough — plus what it takes
// to display a state (`stats`) and to lose nothing on close (`flush`).
//
// Two modes, one interface:
//
// - **light**: everything local, model in IndexedDB. No server, no data leaving the browser.
//   It is the default, and for many apps it is all that is ever needed.
// - **full**: the light mode *plus* a server. The local model still answers — it is instant
//   and works offline — while the server receives the events, trains what a browser cannot
//   (embeddings, the full corpus, several devices) and warm-starts a new machine.
//
// **One rule that is not negotiable: the prediction never blocks the gesture.** The card is
// already under the finger. The local model answers immediately; the server is only consulted
// when the local one has nothing to say, and with a short deadline.

import type { Extractor } from './features.js';
import { defaultFeatures } from './features.js';
import { defaultModel, modelFromJSON } from './models.js';
import { eventId, type SortEvent } from './protocol.js';
import { Client, type ClientOptions } from './remote.js';
import { autoStore, type Store } from './store.js';
import type { Model, ModelJSON, Prediction, Ranked, SortRecord, Stats } from './types.js';

export interface Recommender {
  /** the best zone if it stands out, otherwise `null` */
  best(meta: unknown, targets: string[], minScore?: number): Promise<Prediction | null>;
  /** the full ranking */
  suggest(meta: unknown, targets: string[]): Promise<Ranked[]>;
  /** a filing just happened */
  record(r: SortRecord): Promise<void>;
  /** that filing is being undone */
  forget(r: SortRecord): Promise<void>;
  stats(): Promise<Stats>;
  /** writes whatever is pending (call before closing the page) */
  flush(): Promise<void>;
  /** writes, then removes the listeners — call when replacing the recommender */
  destroy(): Promise<void>;
}

/** A window listener that knows how to remove itself. Without this, replacing a recommender
 *  leaves one behind every time — invisible, until there are a hundred. */
function listen(event: string, fn: () => void): () => void {
  if (typeof addEventListener !== 'function') return () => {};
  addEventListener(event, fn);
  return () => removeEventListener(event, fn);
}

export interface LocalOptions {
  /** storage key — one model per deck */
  key?: string;
  model?: Model;
  features?: Extractor;
  store?: Store;
  /** minimum score to suggest anything */
  minConfidence?: number;
  /** delay before saving, in ms: the model is not rewritten on every card */
  saveDelay?: number;
}

const MIN_CONFIDENCE = 0.45;

/** Light mode: local model, nothing goes over the network. */
export class LocalRecommender implements Recommender {
  model: Model;
  readonly features: Extractor;
  readonly store: Store;
  readonly key: string;
  minConfidence: number;
  saveDelay: number;

  #ready: Promise<void>;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #dirty = false;
  #detach: Array<() => void> = [];

  constructor(opts: LocalOptions = {}) {
    this.key = opts.key ?? 'model';
    this.model = opts.model ?? defaultModel();
    this.features = opts.features ?? defaultFeatures;
    this.store = opts.store ?? autoStore();
    this.minConfidence = opts.minConfidence ?? MIN_CONFIDENCE;
    this.saveDelay = opts.saveDelay ?? 800;
    this.#ready = this.#load();
    // closing the tab must not cost the last few filings
    this.#detach.push(listen('pagehide', () => void this.flush()));
  }

  async destroy(): Promise<void> {
    for (const off of this.#detach) off();
    this.#detach = [];
    await this.flush();
  }

  /** Resolves once the stored model has been read back. */
  ready(): Promise<void> {
    return this.#ready;
  }

  async #load(): Promise<void> {
    try {
      const saved = await this.store.load<ModelJSON>(this.key);
      if (saved) this.model = modelFromJSON(saved);
    } catch {
      // storage unavailable or model unreadable: start from a fresh model rather than
      // refusing to run
    }
  }

  async suggest(meta: unknown, targets: string[]): Promise<Ranked[]> {
    await this.#ready;
    return this.model.predict(this.features(meta), targets);
  }

  async best(meta: unknown, targets: string[], minScore = this.minConfidence): Promise<Prediction | null> {
    const [top] = await this.suggest(meta, targets);
    return top && top.score >= minScore ? top : null;
  }

  async record(r: SortRecord): Promise<void> {
    await this.#ready;
    this.model.learn(this.features(r.meta), r.zoneId, 1);
    this.#save();
  }

  async forget(r: SortRecord): Promise<void> {
    await this.#ready;
    this.model.learn(this.features(r.meta), r.zoneId, -1);
    this.#save();
  }

  async stats(): Promise<Stats> {
    await this.#ready;
    const m = this.model as Model & { stats?: () => Stats; vocabSize?: number; targets?: string[] };
    return (
      m.stats?.() ?? {
        examples: m.examples,
        targets: m.targets?.length ?? 0,
        vocab: m.vocabSize ?? 0,
        accuracy: 0,
      }
    );
  }

  #save(): void {
    this.#dirty = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), this.saveDelay);
  }

  async flush(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (!this.#dirty) return;
    this.#dirty = false;
    await this.store.save(this.key, this.model.toJSON());
  }
}

export interface HybridOptions extends LocalOptions {
  server: Omit<ClientOptions, 'deck'> & { deck?: string };
  /** deck identifier server-side (defaults to `key`) */
  deck?: string;
  /** number of events before an immediate push */
  batch?: number;
  /** push delay, in ms */
  pushDelay?: number;
  /** maximum time granted to the server for a prediction, in ms */
  remoteTimeout?: number;
}

/**
 * Full mode: the local model plus a server.
 *
 * The event queue is **persisted**: a sorting session done offline leaves when the network
 * comes back, and since every event carries an id, resending learns nothing twice.
 */
export class HybridRecommender implements Recommender {
  readonly local: LocalRecommender;
  readonly client: Client;
  batch: number;
  pushDelay: number;
  remoteTimeout: number;

  #queue: SortEvent[] = [];
  #queueKey: string;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #sending: Promise<void> | null = null;
  #ready: Promise<void>;
  #detach: Array<() => void> = [];

  constructor(opts: HybridOptions) {
    this.local = new LocalRecommender(opts);
    this.client = new Client({ ...opts.server, deck: opts.deck ?? opts.server.deck ?? this.local.key });
    this.batch = opts.batch ?? 20;
    this.pushDelay = opts.pushDelay ?? 3000;
    this.remoteTimeout = opts.remoteTimeout ?? 400;
    this.#queueKey = `${this.local.key}:queue`;
    this.#ready = this.#boot();
    this.#detach.push(
      listen('online', () => void this.flush()),
      listen('pagehide', () => void this.#persistQueue()),
    );
  }

  async destroy(): Promise<void> {
    for (const off of this.#detach) off();
    this.#detach = [];
    await this.#persistQueue();
    await this.local.destroy();
  }

  ready(): Promise<void> {
    return this.#ready;
  }

  async #boot(): Promise<void> {
    await this.local.ready();
    this.#queue = (await this.local.store.load<SortEvent[]>(this.#queueKey).catch(() => null)) ?? [];
    await this.warm();
    if (this.#queue.length) void this.flush();
  }

  /**
   * Warm start: the server model is pulled **only if the local one knows less**. That is the
   * case of a new device, or a first launch.
   *
   * ponytail: replacement, not merge. Merging two diverging online models means replaying both
   * sides' events; the day two devices really sort in parallel, the right answer is to have
   * the server replay and pull its model.
   */
  async warm(): Promise<boolean> {
    try {
      const res = await this.client.model(0);
      if (res.model && res.stats.examples > this.local.model.examples) {
        this.local.model = modelFromJSON(res.model);
        return true;
      }
    } catch {
      // offline, no server, bad token: light mode is enough to keep working
    }
    return false;
  }

  async suggest(meta: unknown, targets: string[]): Promise<Ranked[]> {
    const local = await this.local.suggest(meta, targets);
    if (local.length) return local;
    return (await this.#remote(meta, targets))?.ranked ?? [];
  }

  /**
   * Local first. The server is only called when the local model stays silent — typically the
   * first few cards, or a card with no recognised feature. That is exactly where embeddings
   * help, and the only moment when waiting on the network is justified.
   */
  async best(meta: unknown, targets: string[], minScore?: number): Promise<Prediction | null> {
    const local = await this.local.best(meta, targets, minScore);
    if (local) return local;
    const remote = await this.#remote(meta, targets);
    const top = remote?.ranked[0];
    return top && top.score >= (minScore ?? this.local.minConfidence) ? top : null;
  }

  async #remote(meta: unknown, targets: string[]) {
    try {
      return await this.client.predict(
        { features: this.local.features(meta), targets, text: metaText(meta) },
        this.remoteTimeout,
      );
    } catch {
      return null; // the server is a bonus, never a dependency of the gesture
    }
  }

  async record(r: SortRecord): Promise<void> {
    await this.local.record(r);
    this.#enqueue(r, 1);
  }

  async forget(r: SortRecord): Promise<void> {
    await this.local.forget(r);
    this.#enqueue(r, -1);
  }

  #enqueue(r: SortRecord, weight: number): void {
    const text = r.text ?? metaText(r.meta);
    this.#queue.push({
      id: eventId(),
      features: this.local.features(r.meta),
      target: r.zoneId,
      weight,
      at: r.at ?? Date.now(),
      predicted: r.predicted ?? null,
      ...(text ? { text } : {}),
    });
    if (this.#queue.length >= this.batch) return void this.flush();
    if (!this.#timer) this.#timer = setTimeout(() => void this.flush(), this.pushDelay);
  }

  async stats(): Promise<Stats> {
    return this.local.stats();
  }

  /** Server-side stats, across every device. `null` when unreachable. */
  async serverStats(): Promise<Stats | null> {
    return this.client.stats().catch(() => null);
  }

  async flush(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    await this.local.flush();
    if (this.#sending) return this.#sending; // one push at a time, otherwise we double up
    if (!this.#queue.length) return;
    this.#sending = this.#send().finally(() => (this.#sending = null));
    return this.#sending;
  }

  async #send(): Promise<void> {
    const batch = this.#queue.slice(0, Math.max(this.batch, 50));
    try {
      await this.client.push(batch);
      const sent = new Set(batch.map((e) => e.id));
      this.#queue = this.#queue.filter((e) => !sent.has(e.id));
      await this.#persistQueue();
      if (this.#queue.length) await this.#send(); // more left: keep going
    } catch {
      // network failure: the queue stays on disk and will leave on the next flush
      await this.#persistQueue();
    }
  }

  async #persistQueue(): Promise<void> {
    await this.local.store.save(this.#queueKey, this.#queue).catch(() => {});
  }

  /** Number of events not yet accepted by the server. */
  get pending(): number {
    return this.#queue.length;
  }
}

/** Raw text of a metadata object, for server-side embeddings. */
function metaText(meta: unknown): string | undefined {
  if (typeof meta === 'string') return meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const m = meta as Record<string, unknown>;
  const parts = [m.title, m.text, m.description, m.excerpt].filter((v): v is string => typeof v === 'string');
  return parts.length ? parts.join('\n').slice(0, 4000) : undefined;
}

export interface RecommenderConfig extends LocalOptions {
  /** absent = light mode; present = full mode */
  server?: HybridOptions['server'];
  deck?: string;
  batch?: number;
  pushDelay?: number;
  remoteTimeout?: number;
}

/**
 * An app's entry point.
 *
 * ```js
 * const brain = createRecommender({ key: 'links' });                        // light
 * const brain = createRecommender({ key: 'links', server: { url, token } }); // full
 * deck.setOptions({ advisor: brain });
 * ```
 *
 * Going from light to full means adding `server` — nothing else changes in the app.
 */
export function createRecommender(config: RecommenderConfig = {}): Recommender {
  return config.server ? new HybridRecommender(config as HybridOptions) : new LocalRecommender(config);
}
