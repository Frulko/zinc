// The Zinc compiler in a page (ZN-774.29): runs build-wasm/zinc-compile.wasm (tools/build-wasm compiler) over a file system kept in memory, with
// no SharedArrayBuffer and no worker needed. `files` maps absolute paths to bytes: the engine files under /zinc (lib/std/..., targets/capabilities.json)
// and the program; `compile(module, files, '/p/main.ts')` answers { code, zbc, stderr, ms }. One fresh instance per compile: no state carries over.
const enc = new TextEncoder(), dec = new TextDecoder();
const E = { BADF: 8, EXIST: 20, INVAL: 28, ISDIR: 31, NOENT: 44, NOSYS: 52, NOTDIR: 54 };
const RIGHTS = 0x1fffffffn;

export function compile(module, files, src, out = '/o/out.zbc', env = {}) {
  const fs = new Map(files);
  const isDir = (p) => { const d = p.endsWith('/') ? p : p + '/'; for (const k of fs.keys()) if (k.startsWith(d)) return true; return p === '/'; };
  const norm = (base, rel) => {
    const parts = [];
    for (const s of (rel.startsWith('/') ? rel : base + '/' + rel).split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
    return '/' + parts.join('/');
  };
  const fds = [null, null, null, { path: '/', dir: true, pre: true }];
  let memory, stderr = '';
  const mem = () => new DataView(memory.buffer), u8 = () => new Uint8Array(memory.buffer);
  const str = (p, n) => dec.decode(u8().subarray(p, p + n));
  const args = ['zinc-compile', src, out], envs = Object.entries({ ZINC_ROOT: '/zinc', ...env }).map(([k, v]) => `${k}=${v}`);
  const list = (ptrs, buf, xs) => { let b = buf; xs.forEach((x, i) => { const e = enc.encode(x + '\0'); mem().setUint32(ptrs + i * 4, b, true); u8().set(e, b); b += e.length; }); return 0; };
  const sizes = (n, sz, xs) => { mem().setUint32(n, xs.length, true); mem().setUint32(sz, xs.reduce((a, x) => a + enc.encode(x).length + 1, 0), true); return 0; };
  const filestat = (buf, dir, size) => { const v = mem(); for (let i = 0; i < 64; i += 8) v.setBigUint64(buf + i, 0n, true); v.setUint8(buf + 16, dir ? 3 : 4); v.setBigUint64(buf + 24, 1n, true); v.setBigUint64(buf + 32, BigInt(size), true); };
  const fd = (n) => fds[n] || null;
  const impl = {
    args_get: (p, b) => list(p, b, args), args_sizes_get: (n, s) => sizes(n, s, args),
    environ_get: (p, b) => list(p, b, envs), environ_sizes_get: (n, s) => sizes(n, s, envs),
    clock_time_get: (id, prec, outp) => { mem().setBigUint64(outp, BigInt(Math.floor((id === 0 ? Date.now() : performance.now()) * 1e6)), true); return 0; },
    fd_prestat_get: (n, buf) => { const f = fd(n); if (!f || !f.pre) return E.BADF; mem().setUint8(buf, 0); mem().setUint32(buf + 4, f.path.length, true); return 0; },
    fd_prestat_dir_name: (n, p, len) => { const f = fd(n); if (!f || !f.pre) return E.BADF; u8().set(enc.encode(f.path).subarray(0, len), p); return 0; },
    fd_fdstat_get: (n, buf) => { const f = fd(n); const v = mem(); v.setUint8(buf, n < 3 ? 2 : f ? (f.dir ? 3 : 4) : 0); v.setUint16(buf + 2, 0, true); v.setBigUint64(buf + 8, RIGHTS, true); v.setBigUint64(buf + 16, RIGHTS, true); return n < 3 || f ? 0 : E.BADF; },
    fd_fdstat_set_flags: () => 0,
    fd_close: (n) => { const f = fd(n); if (!f) return E.BADF; if (f.w) fs.set(f.path, f.data.slice(0, f.size)); fds[n] = null; return 0; },
    fd_write: (n, iovs, cnt, written) => {
      const v = mem(); let total = 0;
      for (let i = 0; i < cnt; i++) {
        const p = v.getUint32(iovs + i * 8, true), len = v.getUint32(iovs + i * 8 + 4, true), bytes = u8().slice(p, p + len);
        if (n === 1 || n === 2) stderr += dec.decode(bytes);
        else { const f = fd(n); if (!f || !f.w) return E.BADF; if (f.pos + len > f.data.length) { const g = new Uint8Array(Math.max(f.data.length * 2, f.pos + len)); g.set(f.data); f.data = g; } f.data.set(bytes, f.pos); f.pos += len; f.size = Math.max(f.size, f.pos); }
        total += len;
      }
      v.setUint32(written, total, true); return 0;
    },
    fd_read: (n, iovs, cnt, nread) => {
      const f = fd(n); if (!f || f.dir) return n === 0 ? (mem().setUint32(nread, 0, true), 0) : E.BADF;
      const v = mem(); let total = 0;
      for (let i = 0; i < cnt; i++) {
        const p = v.getUint32(iovs + i * 8, true), len = v.getUint32(iovs + i * 8 + 4, true), chunk = f.data.subarray(f.pos, Math.min(f.size, f.pos + len));
        u8().set(chunk, p); f.pos += chunk.length; total += chunk.length; if (chunk.length < len) break;
      }
      v.setUint32(nread, total, true); return 0;
    },
    fd_seek: (n, off, whence, outp) => { const f = fd(n); if (!f || f.dir) return E.BADF; const o = Number(off); f.pos = whence === 0 ? o : whence === 1 ? f.pos + o : f.size + o; mem().setBigUint64(outp, BigInt(f.pos), true); return 0; },
    fd_readdir: (n, buf, len, cookie, used) => {
      const f = fd(n); if (!f || !f.dir) return E.BADF;
      const d = f.path === '/' ? '/' : f.path + '/', names = new Map();
      for (const k of fs.keys()) if (k.startsWith(d)) { const rest = k.slice(d.length), s = rest.indexOf('/'); names.set(s < 0 ? rest : rest.slice(0, s), s >= 0); }
      const entries = [...names].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      let at = 0; const v = mem();
      for (let i = Number(cookie); i < entries.length; i++) {
        const name = enc.encode(entries[i][0]), head = new Uint8Array(24), hv = new DataView(head.buffer);
        hv.setBigUint64(0, BigInt(i + 1), true); hv.setBigUint64(8, BigInt(i + 1), true); hv.setUint32(16, name.length, true); hv.setUint8(20, entries[i][1] ? 3 : 4);
        const rec = new Uint8Array(24 + name.length); rec.set(head); rec.set(name, 24);
        const take = Math.min(rec.length, len - at); u8().set(rec.subarray(0, take), buf + at); at += take;
        if (at >= len) break;
      }
      v.setUint32(used, at, true); return 0;
    },
    path_filestat_get: (n, flags, p, len, buf) => {
      const f = fd(n); if (!f) return E.BADF; const path = norm(f.path, str(p, len));
      if (fs.has(path)) { filestat(buf, false, fs.get(path).length); return 0; }
      if (isDir(path)) { filestat(buf, true, 0); return 0; }
      return E.NOENT;
    },
    path_open: (n, dirflags, p, len, oflags, rb, ri, fdflags, outp) => {
      const f = fd(n); if (!f) return E.BADF; const path = norm(f.path, str(p, len));
      let entry;
      if (oflags & 1) { if (oflags & 4 && fs.has(path)) return E.EXIST; entry = { path, w: true, data: new Uint8Array(1 << 16), size: 0, pos: 0 }; }
      else if (fs.has(path)) { if (oflags & 2) return E.NOTDIR; const data = fs.get(path); entry = { path, data, size: data.length, pos: 0 }; }
      else if (isDir(path)) entry = { path, dir: true };
      else return E.NOENT;
      fds.push(entry); mem().setUint32(outp, fds.length - 1, true); return 0;
    },
    path_readlink: () => E.INVAL,
    proc_exit: (code) => { throw { exit: code }; },
  };
  const imports = { wasi_snapshot_preview1: {} };
  for (const imp of WebAssembly.Module.imports(module)) if (imp.module === 'wasi_snapshot_preview1') imports.wasi_snapshot_preview1[imp.name] = impl[imp.name] || (() => E.NOSYS);
  const t0 = performance.now();
  const inst = new WebAssembly.Instance(module, imports);
  memory = inst.exports.memory;
  let code = 0;
  try { inst.exports._start(); } catch (e) { if (e && typeof e.exit === 'number') code = e.exit; else throw e; }
  return { code, zbc: fs.get(out) || null, stderr, ms: performance.now() - t0 };
}
