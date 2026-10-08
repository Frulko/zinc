// The interpreter and the program in a worker (ZN-135): zinc:gfx draws on an OffscreenCanvas, the page's frame ticks and input arrive in a SharedArrayBuffer (Int32Array):
// [0] frame tick counter, [1] pointer x * 16, [2] pointer y * 16, [3] pointer down, [4] button bit mask (Btn: Up Down Left Right A B X Y L R Start Select), [5] quit.
// The runtime's frame loop blocks in gfxPoll (Atomics.wait) until the next tick, so no asyncify is needed. Needs cross-origin isolation (COOP/COEP) for the SharedArrayBuffer.
import { wasiImports } from './wasi.mjs';

const ARG = 24;   // sizeof(HostArg): double d @0, int64 i @8, void* p @16, uint32 n @20
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

self.onmessage = async (e) => {
  const { wasm, zbc, canvas, sab } = e.data;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const shared = new Int32Array(sab);
  const module = await WebAssembly.compile(wasm);
  let memory;
  const fonts = [];
  let lastTick = 0, prevBits = 0, frames = 0, ex;
  const dv = () => new DataView(memory.buffer);
  const cstr = (p) => { const b = new Uint8Array(memory.buffer); let q = p; while (b[q]) q++; return new TextDecoder().decode(b.subarray(p, q)); };
  const rows = [];   // id -> { name, params, ret }
  const row = (id) => rows[id] || (rows[id] = (() => { const sig = cstr(ex.zn_row_sig(id)); const [p, r] = sig.split('>'); return { name: cstr(ex.zn_row_name(id)), params: p, ret: r }; })());
  const warned = new Set();

  function gfx(id, argsPtr, resPtr) {
    const { name, params, ret } = row(id);
    const v = dv(), a = [];
    for (let k = 0; k < params.length; k++) {
      const base = argsPtr + k * ARG, c = params[k];
      if (c === 'd') a.push(v.getFloat64(base, true));
      else if (c === 's') { const p = v.getUint32(base + 16, true), n = v.getUint32(base + 20, true); a.push(new TextDecoder().decode(new Uint8Array(memory.buffer, p, n))); }
      else if (c === 'D') { const p = v.getUint32(base + 16, true), n = v.getUint32(base + 20, true); a.push(new Float64Array(memory.buffer.slice(p, p + n * 8))); }
      else if (c === 'u') a.push(Number(v.getBigInt64(base + 8, true)) >>> 0);
      else a.push(Number(v.getBigInt64(base + 8, true)));
    }
    let out = 0;
    switch (name) {
      case 'host.gfxFrames': out = 2147483647; break;
      case 'host.gfxBegin': case 'host.gfxEnd': case 'host.gfxFinish': case 'host.gfxKeep': case 'host.gfxProfMark': case 'host.gfxSetCursor': case 'host.gfxUnclip': break;
      case 'host.gfxClear': ctx.globalAlpha = 1; ctx.fillStyle = hex(a[0]); ctx.fillRect(0, 0, W, H); break;
      case 'host.gfxRect': ctx.globalAlpha = 1; ctx.fillStyle = hex(a[4]); ctx.fillRect(a[0], a[1], a[2], a[3]); break;
      case 'host.gfxRRect': ctx.globalAlpha = a[6] / 255; ctx.fillStyle = hex(a[5]); ctx.beginPath(); ctx.roundRect(a[0], a[1], a[2], a[3], a[4]); ctx.fill(); ctx.globalAlpha = 1; break;
      case 'host.gfxLine': ctx.globalAlpha = 1; ctx.strokeStyle = hex(a[4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.stroke(); break;
      case 'host.gfxText': ctx.globalAlpha = 1; ctx.fillStyle = hex(a[3]); ctx.font = `${8 * Math.max(1, a[4])}px monospace`; ctx.textBaseline = 'top'; ctx.fillText(a[2], a[0], a[1]); break;
      case 'host.gfxFont': fonts.push({ family: a[0], px: a[1] }); out = fonts.length - 1; break;
      case 'host.gfxFontAscent': out = Math.round(fonts[a[0]].px * 0.97); break;
      case 'host.gfxLineHeight': out = Math.round(fonts[a[0]].px * 1.21); break;
      case 'host.gfxTextWidth': { const f = fonts[a[0]]; ctx.font = `${f.px}px ${f.family === 'mono' ? 'monospace' : 'sans-serif'}`; out = ctx.measureText(a[1]).width + a[2] * a[1].length; break; }
      case 'host.gfxDrawText': { const f = fonts[a[0]]; ctx.globalAlpha = a[5] / 255; ctx.fillStyle = hex(a[4]); ctx.font = `${f.px}px ${f.family === 'mono' ? 'monospace' : 'sans-serif'}`; ctx.textBaseline = 'top'; ctx.fillText(a[3], a[1], a[2]); ctx.globalAlpha = 1; break; }
      case 'host.gfxWidth': out = W; break;
      case 'host.gfxHeight': out = H; break;
      case 'host.gfxPixelScale': out = 1; break;
      case 'host.gfxProfiling': out = 0; break;
      case 'host.gfxPoll': {   // the frame loop: wait for the page's next tick, then the input of this frame
        Atomics.wait(shared, 0, lastTick, 200);
        lastTick = Atomics.load(shared, 0);
        prevBits = this_bits; this_bits = Atomics.load(shared, 4);
        frames++; if (frames % 10 === 0) self.postMessage({ frames });
        out = 1 / 60; break;
      }
      case 'host.gfxShouldQuit': out = Atomics.load(shared, 5); break;
      case 'host.gfxIsDown': out = (this_bits >> a[0]) & 1; break;
      case 'host.gfxWasPressed': out = ((this_bits >> a[0]) & 1) && !((prevBits >> a[0]) & 1) ? 1 : 0; break;
      case 'host.gfxPointerX': out = Atomics.load(shared, 1) / 16; break;
      case 'host.gfxPointerY': out = Atomics.load(shared, 2) / 16; break;
      case 'host.gfxPointerDown': out = Atomics.load(shared, 3); break;
      default:
        if (!warned.has(name)) { warned.add(name); console.warn('zinc wasm: ' + name + ' is not available in the browser'); }
        out = 0;
    }
    const rv = dv();
    if (ret === 'd') rv.setFloat64(resPtr, out, true);
    else if (ret === 'i' || ret === 'b') rv.setBigInt64(resPtr + 8, BigInt(Math.trunc(out)), true);
    else if (ret === 's') { rv.setUint32(resPtr + 16, ex.zn_scratch(), true); rv.setUint32(resPtr + 20, 0, true); }
  }
  let this_bits = 0;

  const imports = {
    wasi_snapshot_preview1: wasiImports(module, () => memory, (fd, text) => (fd === 2 ? console.error : console.log)(text.replace(/\n$/, ''))),
    zn: { gfx },
  };
  const inst = await WebAssembly.instantiate(module, imports);
  ex = inst.exports; memory = ex.memory;
  if (ex._initialize) ex._initialize();
  const p = ex.zn_alloc(zbc.byteLength);
  new Uint8Array(memory.buffer, p, zbc.byteLength).set(new Uint8Array(zbc));
  self.postMessage({ started: true });
  let rc;
  try { rc = ex.zn_run(p, zbc.byteLength); } catch (err) { console.error(String(err)); rc = -1; }
  self.postMessage({ done: true, rc, frames });
  if (canvas.convertToBlob) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ png: await blob.arrayBuffer() });
  }
};
