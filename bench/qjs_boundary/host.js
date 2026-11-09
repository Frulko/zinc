// The engine's own boundary (ZN-601, ZN-596): zinc:gfx host rows called from QuickJS the way the zinc:gfx module calls them,
// ns per call over the empty loop, median of 5 runs. Run headless: ZINC_HEADLESS=1 zinc run bench/qjs_boundary/host.js --engine quickjs
const N = 300000;
function med(fn) { const s = []; for (let r = 0; r < 5; r++) { const t0 = performance.now(); fn(N); s.push(performance.now() - t0); } s.sort((x, y) => x - y); return s[2] * 1e6 / N; }
const base = med((n) => { for (let i = 0; i < n; i++) {} });
function row(id, what, fn) { console.log('BENCH ' + id.padEnd(22) + ' ' + (med(fn) - base).toFixed(1).padStart(8) + '  ' + what); }
row('host_gfx_int', '__host_gfxWidth(): no argument, an int back', (n) => { let s = 0; for (let i = 0; i < n; i++) s += __host_gfxWidth(); return s; });
row('host_gfx_int_double', '__host_gfxEase(i, d): an int and a double, a double back', (n) => { let s = 0; for (let i = 0; i < n; i++) s += __host_gfxEase(1, 0.5); return s; });
row('host_gfx_6d', '__host_gfxSetTransform(6 doubles)', (n) => { for (let i = 0; i < n; i++) __host_gfxSetTransform(1, 0, 0, 1, 0.5, 0.5); });
__host_gfxResetTransform();
