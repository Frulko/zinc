// A minimal WASI for the browser (ZN-135): stdout and stderr go to a callback, the clock to performance.now, everything else answers "not supported" (ENOSYS) or "nothing".
export function wasiImports(module, getMemory, onWrite) {
  const mem = () => new DataView(getMemory().buffer);
  const u8 = () => new Uint8Array(getMemory().buffer);
  const impl = {
    args_sizes_get: (argc, size) => { mem().setUint32(argc, 0, true); mem().setUint32(size, 0, true); return 0; },
    args_get: () => 0,
    environ_sizes_get: (n, size) => { mem().setUint32(n, 0, true); mem().setUint32(size, 0, true); return 0; },
    environ_get: () => 0,
    clock_time_get: (id, precision, out) => { const ns = BigInt(Math.floor((id === 0 ? Date.now() : performance.now()) * 1e6)); mem().setBigUint64(out, ns, true); return 0; },
    fd_write: (fd, iovs, n, written) => {
      let total = 0, text = '';
      const dec = new TextDecoder();
      for (let i = 0; i < n; i++) {
        const p = mem().getUint32(iovs + i * 8, true), len = mem().getUint32(iovs + i * 8 + 4, true);
        text += dec.decode(u8().slice(p, p + len)); total += len;
      }
      onWrite(fd, text);
      mem().setUint32(written, total, true);
      return 0;
    },
    fd_read: (fd, iovs, n, nread) => { mem().setUint32(nread, 0, true); return 0; },
    fd_close: () => 0,
    fd_seek: () => 70,                                   // ESPIPE
    fd_fdstat_get: (fd, out) => { mem().setUint8(out, 2); mem().setUint16(out + 2, 0, true); return 0; },   // a character device
    fd_prestat_get: () => 8,                             // EBADF: no preopened directories
    fd_prestat_dir_name: () => 8,
    random_get: (p, n) => { crypto.getRandomValues(u8().subarray(p, p + n)); return 0; },
    proc_exit: (code) => { throw new Error('exit ' + code); },
    sched_yield: () => 0,
    poll_oneoff: (inp, out, n, ne) => { mem().setUint32(ne, 0, true); return 0; },
  };
  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) if (imp.module === 'wasi_snapshot_preview1') imports[imp.name] = impl[imp.name] || (() => 52);   // ENOSYS
  return imports;
}
