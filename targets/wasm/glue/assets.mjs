// Cache Storage is an optimisation: every hit still passes SHA-256 and the runtime's ZPK reader.
export const Group = Object.freeze({ Unloaded: 0, Loading: 1, Loaded: 2, Failed: 3 });
export const Request = Object.freeze({ Loading: 0, Done: 1, Failed: 2 });
const MAX = 256 * 1024 * 1024;
export class BrowserAssets {
  constructor(manifest, base, decode, progress = () => {}) {
    if (manifest?.version !== 1 || !Array.isArray(manifest.packs)) throw new Error('unsupported boot manifest');
    this.base = new URL(base); this.decode = decode; this.progress = progress;
    this.groups = new Map(); this.names = new Map(); this.requests = new Map(); this.handles = new Map(); this.next = 1; this.peak = 0;
    this.budget = manifest.ramBudget ?? 512 * 1024 * 1024;
    if (!Number.isSafeInteger(this.budget) || this.budget < 0) throw new Error('invalid asset RAM budget');
    for (const p of manifest.packs) {
      if (!p || typeof p.group !== 'string' || !p.group || this.groups.has(p.group) || !/^[a-f0-9]{64}$/.test(p.sha256) ||
          p.file !== p.sha256 + '.zpk' || !Number.isSafeInteger(p.bytes) || p.bytes < 32 || p.bytes > MAX || !Array.isArray(p.entries)) throw new Error('invalid boot pack');
      const g = { ...p, state: Group.Unloaded, generation: 0, count: p.entries.length, entries: new Map(), request: 0 };
      this.groups.set(p.group, g);
      for (const e of p.entries) {
        if (!e || typeof e.name !== 'string' || !e.name || this.names.has(e.name) || !Number.isInteger(e.kind) || e.kind < 0 || e.kind > 255) throw new Error('invalid boot entry');
        this.names.set(e.name, { group: g, kind: e.kind });
      }
    }
  }
  transition(g, next) {
    if (!(next === Group.Unloaded || (next === Group.Loading && g.state !== Group.Loading) ||
        (g.state === Group.Loading && (next === Group.Loaded || next === Group.Failed)))) throw new Error('invalid asset group transition');
    g.state = next;
  }
  id() { if (this.next > 0x7fffffff) throw new Error('asset request ids exhausted'); return this.next++; }
  load(name) {
    const g = this.groups.get(name);
    if (!g) throw new Error('no asset group ' + name);
    if (g.request && this.requests.has(g.request) && g.state !== Group.Failed) { this.requests.get(g.request).refs++; return g.request; }
    const id = this.id(), r = { state: Request.Loading, done: 0, total: g.bytes, error: '', refs: 1 };
    this.requests.set(id, r); g.request = id;
    if (g.state === Group.Loaded) { r.state = Request.Done; r.done = r.total; return id; }
    this.transition(g, Group.Loading);
    const generation = ++g.generation;
    g.abort = new AbortController();
    g.promise = this.fetch(g, r, g.abort.signal).then((entries) => {
      if (g.generation !== generation) return;
      const added = entries.reduce((n, e) => n + e.bytes.length + (e.pixels?.length || 0), 0);
      this.checkBudget(added);
      g.entries = new Map(entries.map(e => [e.name, e])); this.measure();
      this.transition(g, Group.Loaded); r.done = r.total; r.state = Request.Done;
    }).catch((error) => {
      if (g.generation !== generation) return;
      this.transition(g, Group.Failed); r.error = String(error.message || error); r.state = Request.Failed;
    });
    return id;
  }
  async fetch(g, r, signal) {
    const url = new URL(g.file, this.base).href;
    let cache;
    try { cache = await caches.open('zinc-assets-v1:' + this.base.href); } catch { /* Private mode or quota: download normally. */ }
    const validate = async (bytes) => {
      if (bytes.byteLength !== g.bytes) throw new Error('wrong pack size for ' + g.group);
      const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      if (sha !== g.sha256) throw new Error('wrong pack hash for ' + g.group);
      const entries = this.decode(bytes);
      if (entries.length !== g.count) throw new Error('pack index differs from boot manifest');
      for (const e of entries) { const row = this.names.get(e.name); if (row?.group !== g || row.kind !== e.kind) throw new Error('pack entry differs from boot manifest'); }
      return entries;
    };
    if (cache) {
      try {
        const hit = await cache.match(url);
        if (hit) {
          const bytes = await this.read(hit, g.bytes, signal, n => { r.done = Math.max(r.done, n); });
          const entries = await validate(bytes); this.progress({ group: g.group, done: g.bytes, total: g.bytes, cached: true }); return entries;
        }
      } catch (error) { if (signal.aborted) throw error; try { await cache.delete(url); } catch {} }
    }
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('download ' + g.group + ': HTTP ' + response.status);
    const bytes = await this.read(response, g.bytes, signal, n => { r.done = Math.max(r.done, n); this.progress({ group: g.group, done: n, total: g.bytes, cached: false }); });
    const entries = await validate(bytes);
    if (cache && !signal.aborted) try { await cache.put(url, new Response(bytes)); } catch { /* Quota must not stop the app. */ }
    return entries;
  }
  async read(response, total, signal, progress) {
    const reader = response.body.getReader(), bytes = new Uint8Array(total);
    let done = 0;
    try {
      for (;;) {
        if (signal.aborted) throw new Error('asset load cancelled');
        const part = await reader.read();
        if (part.done) break;
        if (part.value.byteLength > total - done) throw new Error('pack exceeds its manifest size');
        bytes.set(part.value, done); done += part.value.byteLength; progress(done);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (done !== total) throw new Error('truncated asset pack');
    return bytes.buffer;
  }
  async ensure(name) {
    const row = this.names.get(name);
    if (!row) return null;
    const id = this.load(row.group.group);
    try {
      await row.group.promise;
      const r = this.requests.get(id);
      if (r?.state === Request.Failed) throw new Error(r.error);
      return row.group.entries.get(name) || null;
    } finally { this.forget(id); }
  }
  forget(id) { const r = this.requests.get(id); if (r && r.state !== Request.Loading && --r.refs === 0) this.requests.delete(id); }
  unload(name) {
    const g = this.groups.get(name);
    if (!g) return;
    ++g.generation; g.abort?.abort();
    const r = this.requests.get(g.request);
    if (r?.state === Request.Loading) { r.state = Request.Failed; r.error = 'asset load cancelled'; }
    g.request = 0; g.entries.clear(); this.transition(g, Group.Unloaded);
  }
  resident() {
    const entries = new Set(this.handles.values());
    for (const g of this.groups.values()) for (const e of g.entries.values()) entries.add(e);
    return [...entries].reduce((n, e) => n + e.bytes.length + (e.pixels?.length || 0), 0);
  }
  checkBudget(added) { if (this.budget && this.resident() + added > this.budget) throw new Error('asset load exceeds the RAM budget'); }
  measure() { const bytes = this.resident(); this.peak = Math.max(this.peak, bytes); return bytes; }
  acquire(name) {
    const row = this.names.get(name), entry = row?.group.entries.get(name);
    if (!entry) throw new Error('asset is not resident: ' + name);
    const id = this.id(); this.handles.set(id, entry); return id;
  }
}
