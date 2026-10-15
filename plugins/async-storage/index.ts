// React Native's AsyncStorage (@react-native-async-storage/async-storage, v2 API) on zinc:storage, the key/value store of every target (a file
// on a desktop or a device, NVS on an ESP32). `import AsyncStorage from '@react-native-async-storage/async-storage'` works unchanged.
// Its keys carry a prefix: zinc:storage holds other settings too (and on a desktop, every program's), and clear() must touch only its own.
import { get, set, remove, keys } from 'zinc:storage';

const PREFIX = '@async/';
// zinc:storage answers '' for a missing key: a marker tells an empty string from nothing
const HERE = '=';

function read(key: string): string | null {
  const v = get(PREFIX + key);
  return v === '' ? null : v.slice(1);
}
function write(key: string, value: string): void { set(PREFIX + key, HERE + value); }

/** `patch` merged into `base` as AsyncStorage's mergeItem does: objects key by key, deeply; anything else replaced. */
function merge(base: any, patch: any): any {
  if (base === null || patch === null || typeof base !== 'object' || typeof patch !== 'object' || Array.isArray(base) || Array.isArray(patch)) return patch;
  const out: any = {};
  for (const k in base) out[k] = base[k];
  for (const k in patch) out[k] = out[k] !== undefined ? merge(out[k], patch[k]) : patch[k];
  return out;
}
function mergeInto(key: string, value: string): void {
  const old = read(key);
  write(key, old === null ? value : JSON.stringify(merge(JSON.parse(old), JSON.parse(value))));
}
function ownKeys(): string[] {
  const out: string[] = [];
  for (const k of keys()) if (k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  return out;
}

// ponytail: the deprecated node-style callbacks of v1 are left out; Promises only, as v2 documents
class AsyncStorageStatic {
  async getItem(key: string): Promise<string | null> { return read(key); }
  async setItem(key: string, value: string): Promise<void> { write(key, value); }
  async removeItem(key: string): Promise<void> { remove(PREFIX + key); }
  async mergeItem(key: string, value: string): Promise<void> { mergeInto(key, value); }
  async clear(): Promise<void> { for (const k of ownKeys()) remove(PREFIX + k); }
  async getAllKeys(): Promise<string[]> { return ownKeys(); }
  async multiGet(ks: string[]): Promise<[string, string | null][]> { return ks.map((k: string): [string, string | null] => [k, read(k)]); }
  async multiSet(pairs: [string, string][]): Promise<void> { for (const p of pairs) write(p[0], p[1]); }
  async multiRemove(ks: string[]): Promise<void> { for (const k of ks) remove(PREFIX + k); }
  async multiMerge(pairs: [string, string][]): Promise<void> { for (const p of pairs) mergeInto(p[0], p[1]); }
  flushGetRequests(): void {}
}
const AsyncStorage = new AsyncStorageStatic();
export default AsyncStorage;
