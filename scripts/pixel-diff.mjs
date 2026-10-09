#!/usr/bin/env node
// Tolerance comparison of two frames (BMP from display-gl's ZINC_SHOT, or PNG from ZINC_SHOT elsewhere):
//   node scripts/pixel-diff.mjs cpu.bmp gl.bmp [--threshold 8] [--max-share 1.0] [--out diff.png] [--label name]
// A pixel differs when any channel differs by more than --threshold (0..255). Prints the max channel difference, the
// share (%) of differing pixels and a coarse histogram; exits 1 when the share exceeds --max-share (%).
// The optional diff image shows the software frame dimmed, with differing pixels in red (brightness = difference).
import fs from 'node:fs';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : args.splice(i, 2)[1]; };
const threshold = Number(opt('threshold', 8)), maxShare = Number(opt('max-share', 100)), out = opt('out', ''), label = opt('label', '');
const [fa, fb] = args;
if (!fa || !fb) { console.error('usage: pixel-diff.mjs a b [--threshold n] [--max-share pct] [--out diff.png] [--label name]'); process.exit(2); }

/** { w, h, rgb } (top row first) from a 24-bit BMP or an 8-bit RGB / RGBA PNG. */
function load(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x42 && b[1] === 0x4d) {
    const off = b.readUInt32LE(10), w = b.readInt32LE(18), hh = b.readInt32LE(22), bpp = b.readUInt16LE(28), h = Math.abs(hh);
    if (bpp !== 24) throw new Error(`${file}: only 24-bit BMP`);
    const row = (w * 3 + 3) & ~3, rgb = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      const sy = hh > 0 ? h - 1 - y : y;
      for (let x = 0; x < w; x++) { const s = off + sy * row + x * 3, d = (y * w + x) * 3; rgb[d] = b[s + 2]; rgb[d + 1] = b[s + 1]; rgb[d + 2] = b[s]; }
    }
    return { w, h, rgb };
  }
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a BMP or PNG`);
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < b.length) {
    const n = b.readUInt32BE(p), t = b.toString('latin1', p + 4, p + 8);
    if (t === 'IHDR') { w = b.readUInt32BE(p + 8); h = b.readUInt32BE(p + 12); ct = b[p + 17]; }
    else if (t === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + n));
    p += 12 + n;
  }
  const ch = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, rgb = Buffer.alloc(w * h * 3);
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0;
      const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
      cur[i] = (line[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? up : c))) & 255;
    }
    for (let x = 0; x < w; x++) { rgb[(y * w + x) * 3] = cur[x * ch]; rgb[(y * w + x) * 3 + 1] = cur[x * ch + 1]; rgb[(y * w + x) * 3 + 2] = cur[x * ch + 2]; }
    cur.copy(prev);
  }
  return { w, h, rgb };
}

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const chunk = (t, d) => { const c = Buffer.alloc(12 + d.length); c.writeUInt32BE(d.length, 0); c.write(t, 4, 'latin1'); d.copy(c, 8); c.writeUInt32BE(zlib.crc32(c.subarray(4, 8 + d.length)) >>> 0, 8 + d.length); return c; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const A = load(fa), B = load(fb);
if (A.w !== B.w || A.h !== B.h) { console.log(`${label} size differs: ${A.w}x${A.h} vs ${B.w}x${B.h}`); process.exit(1); }
const n = A.w * A.h, diff = Buffer.alloc(n * 3), hist = [0, 0, 0, 0, 0];   // max channel diff: <=1, <=3, <=8, <=32, more
let max = 0, bad = 0;
for (let i = 0; i < n; i++) {
  let m = 0;
  for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(A.rgb[i * 3 + k] - B.rgb[i * 3 + k]));
  if (m > max) max = m;
  hist[m <= 1 ? 0 : m <= 3 ? 1 : m <= 8 ? 2 : m <= 32 ? 3 : 4]++;
  if (m > threshold) { bad++; diff[i * 3] = Math.min(255, 96 + m); }
  else for (let k = 0; k < 3; k++) diff[i * 3 + k] = A.rgb[i * 3 + k] >> 2;
}
const share = 100 * bad / n;
console.log(`${label ? label + ': ' : ''}${A.w}x${A.h} max channel diff ${max}, differing (> ${threshold}) ${bad} px = ${share.toFixed(3)} %, max-diff histogram (<=1 <=3 <=8 <=32 >32): ${hist.map(v => (100 * v / n).toFixed(2) + '%').join(' ')}`);
if (out) fs.writeFileSync(out, png(A.w, A.h, diff));
process.exit(share > maxShare ? 1 : 0);
