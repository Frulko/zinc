// HTTP client for the trieur server. Nothing but `fetch` — usable from a tab, an extension,
// a worker or Node.

import { routes, type ModelResponse, type PredictRequest, type PredictResponse, type PushRequest, type PushResponse, type SortEvent } from './protocol.js';
import type { Stats } from './types.js';

export interface ClientOptions {
  /** server root, no trailing slash */
  url: string;
  /** deck identifier: one model per deck */
  deck: string;
  token?: string;
  /** how long before giving up, in ms */
  timeout?: number;
  /** injectable for tests */
  fetch?: typeof fetch;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class Client {
  readonly url: string;
  readonly deck: string;
  token: string | undefined;
  timeout: number;
  #fetch: typeof fetch;

  constructor(opts: ClientOptions) {
    this.url = opts.url.replace(/\/$/, '');
    this.deck = opts.deck;
    this.token = opts.token;
    this.timeout = opts.timeout ?? 8000;
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async #call<T>(path: string, init?: RequestInit & { timeout?: number }): Promise<T> {
    const res = await this.#fetch(this.url + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(init?.timeout ?? this.timeout),
    });
    if (!res.ok) throw new HttpError(res.status, `${init?.method ?? 'GET'} ${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  push(events: SortEvent[]): Promise<PushResponse> {
    return this.#call<PushResponse>(routes.events(this.deck), {
      method: 'POST',
      body: JSON.stringify({ events } satisfies PushRequest),
    });
  }

  model(since = 0): Promise<ModelResponse> {
    return this.#call<ModelResponse>(`${routes.model(this.deck)}?since=${since}`);
  }

  /** Server-side prediction (heavy models, embeddings). Short timeout by default: a card is
   *  already under the finger, we do not wait on the network. */
  predict(req: PredictRequest, timeout = 400): Promise<PredictResponse> {
    return this.#call<PredictResponse>(routes.predict(this.deck), {
      method: 'POST',
      body: JSON.stringify(req),
      timeout,
    });
  }

  stats(): Promise<Stats> {
    return this.#call<Stats>(routes.stats(this.deck));
  }
}
