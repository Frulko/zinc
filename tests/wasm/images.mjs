// HostArg arrays contain eight-byte Slots, even when their element type is u8/u32.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { wasiImports } from '../../targets/wasm/glue/wasi.mjs';
const memory = new WebAssembly.Memory({ initial: 2 });
let dispatch, nextString = 64;
const strings = new Map();
function str(s) { if (!strings.has(s)) { const p = nextString; nextString += s.length + 1; new Uint8Array(memory.buffer, p, s.length).set(new TextEncoder().encode(s)); strings.set(s, p); } return strings.get(s); }
const rows = [ ['gfxCreateImage', 'ii>i'], ['gfxImageFromPixels', 'Bii>i'], ['gfxUpdatePixels', 'iUb>n'], ['gfxDestroyImage', 'i>n'], ['gfxImageWidth', 'i>i'], ['gfxBeginImage', 'i>n'], ['gfxEndImage', '>n'], ['gfxWidth', '>i'], ['gfxImageFromBytes', 'B>i'] ];
function call(id, args = []) {
  const v = new DataView(memory.buffer), sig = rows[id][1].split('>')[0];
  let p = 8192;
  for (let k = 0; k < sig.length; k++) {
    const b = 4096 + k * 24;
    if ('BU'.includes(sig[k])) {
      v.setUint32(b + 16, p, true); v.setUint32(b + 20, args[k].length, true);
      for (const x of args[k]) { v.setBigUint64(p, BigInt(x), true); p += 8; }
    } else v.setBigInt64(b + 8, BigInt(args[k]), true);
  }
  const done = () => Number(new DataView(memory.buffer).getBigInt64(6008, true));
  const r = dispatch(id, 4096, 6000); return r?.then ? r.then(done) : done();
}
const writes = [];
class Canvas {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() { return { putImageData: d => writes.push([...d.data]), drawImage() {}, getTransform: () => ({}), setTransform() {}, resetTransform() {}, save() {}, restore() {} }; }
}
const ex = { memory, zn_alloc: () => 16384, zn_image_size_ok: () => 1, zn_free() {}, zn_row_sig: id => str(rows[id][1]), zn_row_name: id => str('host.' + rows[id][0]), zn_run: async () => {
  assert.equal(call(0, [0, 4]), -1);
  const id = call(1, [[255, 1, 2, 128, 3, 4, 5, 255], 2, 1]);
  assert.deepEqual(writes.pop(), [255, 1, 2, 128, 3, 4, 5, 255]);
  call(2, [id, [0x04030201, 0x80706050], 1]);
  assert.deepEqual(writes.pop(), [1, 2, 3, 255, 80, 96, 112, 255]);
  call(5, [id]); assert.equal(call(7), 2);
  call(3, [id]); assert.equal(call(7), 400); assert.equal(call(4, [id]), 0);
  const newer = call(0, [3, 2]); assert.notEqual(newer, id);
  call(3, [id]); assert.equal(call(4, [newer]), 3);
  assert.equal(await call(8, [[1, 2, 3]]), -1);
  assert.equal(await call(8, [[]]), -1);
  return 0;
} };
const errors = [];
const context = { TextDecoder, TextEncoder, DataView, Uint8Array, Uint8ClampedArray, Uint32Array, Float64Array, Int32Array, Blob, console, setTimeout, clearTimeout,
  OffscreenCanvas: Canvas, ImageData: class { constructor(data) { this.data = data; } }, createImageBitmap: async () => { throw new Error('bad image'); },
  BrowserAssets: class {}, TextureDecoder: class {}, wasiImports: () => ({}), self: { location: { href: 'https://example.test/' }, postMessage(m) { if (m.error) errors.push(m.error); } }, URL,
  WebAssembly: { Memory: WebAssembly.Memory, Module: class {}, compile: async () => ({}), Suspending: function(f) { dispatch = f; return f; }, promising: f => f, instantiate: async () => ({ exports: ex }) } };
vm.runInNewContext(readFileSync('targets/wasm/glue/worker.mjs', 'utf8').replace(/^import .*;\n/gm, ''), context);
await context.self.onmessage({ data: { wasm: new ArrayBuffer(0), zbc: new ArrayBuffer(0), canvas: new Canvas(400, 180), base: 'https://example.test/' } });
assert.deepEqual(errors, []);
console.log('wasm_images: Slot arrays, update, target, stale ids and decode failure passed');

if (existsSync('build-wasm/vm-web.wasm')) {
  const mod = await WebAssembly.compile(readFileSync('build-wasm/vm-web.wasm'));
  let mem;
  const real = (await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasiImports(mod, () => mem, () => {}), zn: { gfx() {} } })).exports;
  mem = real.memory; real._initialize?.();
  const bytes = readFileSync('tests/data/image_rect/assets/sheet.png'), p = real.zn_alloc(bytes.length);
  try {
    new Uint8Array(mem.buffer, p, bytes.length).set(bytes);
    assert.equal(real.zn_image_size_ok(p, bytes.length), 1);
    const data = new DataView(mem.buffer);
    data.setUint32(p + 16, 16384, false); data.setUint32(p + 20, 16384, false);
    assert.equal(real.zn_image_size_ok(p, bytes.length), 0);
    assert.equal(real.zn_image_size_ok(p, 0), 0);
    data.setUint32(p, 0, false); assert.equal(real.zn_image_size_ok(p, bytes.length), 0);
  } finally { real.zn_free(p); }
  console.log('wasm_images: vendored metadata rejects oversized and invalid images before decode');
}
