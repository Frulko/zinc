// trieur's model store (`Store` of @trieur/learn) on zinc:storage: the model a demo learns is kept between runs, as IndexedDB keeps it
// in a browser.

import * as storage from 'zinc:storage';
import type { Store } from '@trieur/learn';

export function kvStore(prefix = 'trieur:'): Store {
  return {
    async load<T>(key: string): Promise<T | null> {
      const raw = storage.get(prefix + key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async save(key: string, value: unknown): Promise<void> { storage.set(prefix + key, JSON.stringify(value)); },
    async remove(key: string): Promise<void> { storage.remove(prefix + key); },
  };
}
