// The native <-> QuickJS boundary (ZN-601): ns per call over the empty loop, median of 5 runs of N calls, on the harness's fake GL
// class (harness.c). One line per case: `BENCH <id> <ns>  <what>`; tools/bench gates the ids of baseline.json.
// Plain names go through a magic thunk like webgl_js.cpp's callThunk, names ending in D are registered directly.
const N = 300000;
function med(fn, a, n = N) { const s = []; for (let r = 0; r < 5; r++) { const t0 = now(); fn(n, a); s.push(now() - t0); } s.sort((x, y) => x - y); return s[2] * 1e6 / n; }
let base = 0;
function row(id, what, fn, a, n = N) { const ns = med(fn, a, n) - base; print('BENCH ' + id.padEnd(22) + ' ' + ns.toFixed(1).padStart(8) + '  ' + what); }
const gl = newGL(), loc = newLoc(3), f4 = new Float32Array([1, 2, 3, 4]), m16 = new Float32Array(16), ab = new ArrayBuffer(16);
function deep(d, fn) { return d ? deep(d - 1, fn) : fn(); }

base = med((n) => { for (let i = 0; i < n; i++) {} });
print('BENCH empty_loop_abs           ' + base.toFixed(1).padStart(8) + '  the empty loop (absolute, subtracted from the others)');
row('lookup', 'f = gl.nop: the method lookup only', (n, g) => { let f; for (let i = 0; i < n; i++) f = g.nop; }, gl);
row('lookup_const', 'gl.CONST_300 on a 600-property prototype', (n, g) => { let f; for (let i = 0; i < n; i++) f = g.CONST_300; }, gl);
row('nop_thunk', 'gl.nop() through the thunk', (n, g) => { for (let i = 0; i < n; i++) g.nop(); }, gl);
row('nop_direct', 'gl.nopD() registered directly', (n, g) => { for (let i = 0; i < n; i++) g.nopD(); }, gl);
row('int_thunk', 'gl.bind(7): one JS_ToUint32, thunk', (n, g) => { for (let i = 0; i < n; i++) g.bind(7); }, gl);
row('int_direct', 'gl.bindD(7) direct', (n, g) => { for (let i = 0; i < n; i++) g.bindD(7); }, gl);
row('uniform4f_thunk', 'gl.uniform4f(loc, 4 doubles) thunk', (n, g) => { for (let i = 0; i < n; i++) g.uniform4f(loc, 1.5, 2.5, 3.5, 4.5); }, gl);
row('vec4_direct', 'gl.vec4D(4 doubles) direct, no location', (n, g) => { for (let i = 0; i < n; i++) g.vec4D(1.5, 2.5, 3.5, 4.5); }, gl);
row('uniform4fv_view', 'uniform4fv(loc, Float32Array): tests first, in place', (n, g) => { for (let i = 0; i < n; i++) g.uniform4fv(loc, f4); }, gl);
row('uniform4fv_throw', 'the same with a throw as type test + heap copy', (n, g) => { for (let i = 0; i < n; i++) g.uniform4fvThrow(loc, f4); }, gl, N / 20);
row('uniform4fv_throw_deep', '  the same, 20 JS frames deeper', (n, g) => deep(20, () => { for (let i = 0; i < n; i++) g.uniform4fvThrow(loc, f4); }), gl, N / 20);
row('uniform4fv_buffer', 'uniform4fv(loc, ArrayBuffer)', (n, g) => { for (let i = 0; i < n; i++) g.uniform4fv(loc, ab); }, gl);
row('matrix16_view', 'uniformMatrix-like (loc, Float32Array of 16)', (n, g) => { for (let i = 0; i < n; i++) g.uniform4fv(loc, m16); }, gl);
row('upload_direct', 'upload(1, Float32Array) direct', (n, g) => { for (let i = 0; i < n; i++) g.uploadD(1, f4); }, gl);
row('throw_discard', 'throw and discard a TypeError', (n, g) => { for (let i = 0; i < n; i++) g.throwDiscardD(); }, gl, N / 20);
row('string_arg', "str('modelViewMatrix'): JS_ToCStringLen", (n, g) => { for (let i = 0; i < n; i++) g.strD('modelViewMatrix'); }, gl);
row('ret_number', 'retNum() -> a double', (n, g) => { let s = 0; for (let i = 0; i < n; i++) s += g.retNumD(); return s; }, gl);
row('ret_object_str', 'retObjStr() -> {x,y,z}, JS_SetPropertyStr', (n, g) => { let s = 0; for (let i = 0; i < n; i++) s += g.retObjStrD().x; return s; }, gl);
row('ret_object_atoms', 'retObjFrom() -> {x,y,z}, atoms made once', (n, g) => { let s = 0; for (let i = 0; i < n; i++) s += g.retObjFromD().x; return s; }, gl);
const sh = sharedF32();
row('ret_shared', 'retShared() + read 3 floats of a shared Float32Array', (n, g) => { let s = 0; for (let i = 0; i < n; i++) { g.retSharedD(); s += sh[0] + sh[1] + sh[2]; } return s; }, gl);
row('host_heap', '__host_*-style thunk, 2 heap allocations (4 doubles)', (n) => { for (let i = 0; i < n; i++) hostHeap(1.5, 2.5, 3.5, 4.5); });
row('host_stack', '__host_*-style thunk, stack arrays (4 doubles)', (n) => { for (let i = 0; i < n; i++) hostStack(1.5, 2.5, 3.5, 4.5); });
row('typed_f_f_f', 'hypotFF(a, b): JS_CFUNC_f_f_f', (n) => { let s = 0; for (let i = 0; i < n; i++) s += hypotFF(1.5, 2.5); return s; });
row('generic_2d', 'hypotG(a, b): generic + 2 JS_ToFloat64', (n) => { let s = 0; for (let i = 0; i < n; i++) s += hypotG(1.5, 2.5); return s; });
print('BENCH native_to_js           ' + med((n) => callN((x) => x, n)).toFixed(1).padStart(8) + '  native -> JS: JS_Call of a 1-argument function (the loop is in C: not subtracted)');
const cmd = new Float64Array(256 * 6);
row('js_command_buffer', 'uniform4f recorded in a Float64Array, flushed per 256', (n, g) => {
  let k = 0;
  for (let i = 0; i < n; i++) { cmd[k] = 1; cmd[k + 1] = 3; cmd[k + 2] = 1.5; cmd[k + 3] = 2.5; cmd[k + 4] = 3.5; cmd[k + 5] = 4.5; k += 6; if (k === cmd.length) { g.flushD(cmd, k); k = 0; } }
}, gl);
