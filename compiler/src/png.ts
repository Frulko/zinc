// PNG helpers for zinc capture / zinc test --pixels: the runtime writes 8-bit RGB PNGs with stored (uncompressed)
// deflate blocks (runtime/gfx.cpp); here they are decoded, compared, and written back compressed with Node's zlib.
import * as zlib from 'node:zlib';

export interface Image { w: number; h: number; rgb: Buffer }

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b: Buffer): number { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type: string, data: Buffer): Buffer {
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 8-bit RGB, non-interlaced (what the runtime and encode() write). ponytail: filter 0 only; other PNGs are rejected. */
export function decode(png: Buffer): Image {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let w = 0, h = 0;
  const idat: Buffer[] = [];
  for (let p = 8; p < png.length;) {
    const len = png.readUInt32BE(p), type = png.toString('latin1', p + 4, p + 8), data = png.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 2 || data[12] !== 0) throw new Error('only 8-bit RGB non-interlaced PNGs');
    } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), row = w * 3, rgb = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    if (raw[y * (row + 1)] !== 0) throw new Error('PNG filter not supported (only filter 0)');
    raw.copy(rgb, y * row, y * (row + 1) + 1, (y + 1) * (row + 1));
  }
  return { w, h, rgb };
}

export function encode(img: Image): Buffer {
  const row = img.w * 3, raw = Buffer.alloc((row + 1) * img.h);
  for (let y = 0; y < img.h; y++) img.rgb.copy(raw, y * (row + 1) + 1, y * row, (y + 1) * row);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Pixels that differ (count, bounding box) and a picture of them: differences in red over the expected image, faded. */
export function diff(a: Image, b: Image): { count: number; box: [number, number, number, number]; img: Image } {
  const w = Math.max(a.w, b.w), h = Math.max(a.h, b.h), rgb = Buffer.alloc(w * h * 3);
  let count = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, ia = (y * a.w + x) * 3, ib = (y * b.w + x) * 3;
    const inA = x < a.w && y < a.h, inB = x < b.w && y < b.h;
    const same = inA && inB && a.rgb[ia] === b.rgb[ib] && a.rgb[ia + 1] === b.rgb[ib + 1] && a.rgb[ia + 2] === b.rgb[ib + 2];
    if (same) { const g = 160 + ((a.rgb[ia] + a.rgb[ia + 1] + a.rgb[ia + 2]) / 3 | 0) * 95 / 255; rgb[i] = rgb[i + 1] = rgb[i + 2] = g; continue; }
    count++; rgb[i] = 255; rgb[i + 1] = rgb[i + 2] = 0;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { count, box: [x0, y0, x1 + 1, y1 + 1], img: { w, h, rgb } };
}
