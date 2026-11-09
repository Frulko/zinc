// zinc:net's fetch on the web (docs/targets/web.md, "What the export is"): the fetch rows over the page's own fetch (CORS applies; zinc.json targets.web.proxy and the dev bridge
// still reach sites that send no CORS headers, as they wrap fetch). A call ends with zinc:net's events, as on the desktop: 40 done, 41 failed with "fetch failed: <why>".
// The servers (serve, serveAsync) have no rows here: a page cannot listen (under zinc dev they listen on the machine, through the bridge).
// This file only loads in an app that calls one of these rows (the export puts it into native.js).
const Z = globalThis.__zincWeb, G = globalThis;
const enc = new TextEncoder(), dec = new TextDecoder();
const calls = new Map();   // handle -> { status, url, head, body (bytes), save, append }; handles are never reused
let next = 1;
function headersOf(lines) {
  const h = new Headers();
  for (const l of String(lines).split('\n')) { const c = l.indexOf(':'); if (c > 0) try { h.append(l.slice(0, c).trim(), l.slice(c + 1).trim()); } catch {} }
  return h;
}
function load(path) { const n = G.__host_fsLoad(path); return n > 0 ? Uint8Array.from(G.__host_fsBytes()) : new Uint8Array(0); }
function start(url, method, lines, body, timeoutMs, maxBytes) {
  const h = next++, c = { status: 0, url: String(url), head: '', body: new Uint8Array(0), save: '' };
  calls.set(h, c);
  const ctl = new AbortController(), max = maxBytes > 0 ? maxBytes : 64 << 20;
  const timer = setTimeout(() => ctl.abort(), timeoutMs > 0 ? timeoutMs : 120000);
  const m = String(method || 'GET').toUpperCase();
  const done = (ok, why) => { clearTimeout(timer); if (calls.has(h)) Z.hostEvent(h, ok ? 40 : 41, ok ? '' : 'fetch failed: ' + why, ''); };
  G.fetch(c.url, { method: m, headers: headersOf(lines), body: m === 'GET' || m === 'HEAD' || body.length === 0 ? undefined : body, signal: ctl.signal, redirect: 'follow' })
    .then(async (r) => {
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length > max) return done(false, 'response too large');
      c.status = r.status; c.url = r.url || c.url;
      let head = r.statusText + '\n';
      r.headers.forEach((v, k) => { head += k + ': ' + v + '\n'; });
      c.head = head;
      if (c.save !== '' && (r.status === 200 || r.status === 206)) {   // RequestInit.saveTo: a 200 replaces the file, a 206 adds to it; the body is not kept
        const old = r.status === 206 ? load(c.save) : new Uint8Array(0), all = new Uint8Array(old.length + b.length);
        all.set(old); all.set(b, old.length);
        G.__host_fsWriteBytes(c.save, Array.from(all));
        if (G.__host_fsFailed()) return done(false, 'cannot write ' + c.save);
      } else c.body = b;
      done(true, '');
    })
    .catch((e) => done(false, ctl.signal.aborted ? 'timeout' : (e && e.message) || String(e)));
  return h;
}
const R = {
  httpFetch: (url, method, lines, body, timeoutMs, maxBytes) => start(url, method, lines, enc.encode(String(body)), timeoutMs, maxBytes),
  httpFetchBytes: (url, method, lines, bytes, timeoutMs, maxBytes) => start(url, method, lines, Uint8Array.from(bytes), timeoutMs, maxBytes),
  httpFetchFile: (url, method, lines, file, prefix, suffix, timeoutMs, maxBytes) => {   // a multipart form's parts around the file's bytes
    const a = enc.encode(String(prefix)), f = load(file), z = enc.encode(String(suffix)), b = new Uint8Array(a.length + f.length + z.length);
    b.set(a); b.set(f, a.length); b.set(z, a.length + f.length);
    return start(url, method, lines, b, timeoutMs, maxBytes);
  },
  httpSaveTo: (h, path) => { const c = calls.get(h); if (c) c.save = String(path); },
  httpStatus: (h) => (calls.get(h) || { status: 0 }).status,
  httpUrl: (h) => (calls.get(h) || { url: '' }).url,
  httpHead: (h) => (calls.get(h) || { head: '' }).head,
  httpBody: (h) => { const c = calls.get(h); return c ? dec.decode(c.body) : ''; },
  httpBodySize: (h) => { const c = calls.get(h); return c ? c.body.length : 0; },
  httpBodyBytes: (h) => { const c = calls.get(h); return c ? Array.from(c.body) : []; },
  httpFree: (h) => { calls.delete(h); },
};
for (const [n, f] of Object.entries(R)) G['__host_' + n] = f;
