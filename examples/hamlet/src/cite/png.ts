// A PNG writer for the atlas export (zinc:gfx saves only the screen, opaque; no module encodes pixels with their transparency yet).
// Deflate with the fixed Huffman code and a one-candidate LZ77 (3 byte hash): the sheets are mostly runs of transparent pixels, which this packs well.
let crcTable: number[] = [];
function crc(bytes: u8[], from: number, to: number): number {
  if (crcTable.length === 0) crcTable = Array.from({ length: 256 }, (_: number, n: number): number => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); return c >>> 0; });
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

let out: u8[] = [], acc = 0, nacc = 0;
function bits(v: number, n: number): void {                 // low bit first
  acc |= v << nacc; nacc += n;
  while (nacc >= 8) { out.push(acc & 255); acc >>>= 8; nacc -= 8; }
}
function code(v: number, n: number): void { let r = 0; for (let k = 0; k < n; k++) r |= ((v >> k) & 1) << (n - 1 - k); bits(r, n); }   // Huffman codes go high bit first
function lit(v: number): void { if (v < 144) code(0x30 + v, 8); else if (v < 256) code(0x190 + v - 144, 9); else if (v < 280) code(v - 256, 7); else code(0xc0 + v - 280, 8); }

function deflate(data: u8[]): u8[] {
  out = []; acc = 0; nacc = 0;
  bits(1, 1); bits(1, 2);                                    // final block, fixed codes
  const head: number[] = Array.from({ length: 65536 }, (): number => -1), n = data.length;
  let i = 0;
  while (i < n) {
    let len = 0, dist = 0;
    if (i + 2 < n) {
      const h = ((data[i] << 8) ^ (data[i + 1] << 4) ^ data[i + 2]) & 65535, c = head[h];
      head[h] = i;
      if (c >= 0 && i - c <= 32768) {
        const max = Math.min(258, n - i);
        while (len < max && data[c + len] === data[i + len]) len++;
        dist = i - c;
      }
    }
    if (len >= 3) {
      let lc = 28; while (LBASE[lc] > len) lc--;
      lit(257 + lc); if (LEXTRA[lc] > 0) bits(len - LBASE[lc], LEXTRA[lc]);
      let dc = 29; while (DBASE[dc] > dist) dc--;
      code(dc, 5); if (DEXTRA[dc] > 0) bits(dist - DBASE[dc], DEXTRA[dc]);
      for (let k = 1; k < len && i + k + 2 < n; k++) head[((data[i + k] << 8) ^ (data[i + k + 1] << 4) ^ data[i + k + 2]) & 65535] = i + k;
      i += len;
    } else { lit(data[i]); i++; }
  }
  lit(256);
  if (nacc > 0) out.push(acc & 255);
  return out;
}

function chunk(png: u8[], type: string, body: u8[]): void {
  const at = png.length + 4;
  png.push((body.length >>> 24) & 255, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255);
  for (let k = 0; k < 4; k++) png.push(type.charCodeAt(k));
  for (let k = 0; k < body.length; k++) png.push(body[k]);
  const c = crc(png, at, png.length);
  png.push((c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255);
}

/** The bytes of an RGBA PNG of `px` (one u32 a pixel, red in the low byte, rows top first: what updatePixels takes). */
export function encodePng(px: u32[], w: number, h: number): u8[] {
  const raw: u8[] = [];
  let a1 = 1, a2 = 0;
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) { const v = px[y * w + x]; raw.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
  }
  for (let k = 0; k < raw.length; k++) { a1 = (a1 + raw[k]) % 65521; a2 = (a2 + a1) % 65521; }
  const z: u8[] = [0x78, 0x01], d = deflate(raw);
  for (let k = 0; k < d.length; k++) z.push(d[k]);
  const ad = ((a2 << 16) | a1) >>> 0;
  z.push((ad >>> 24) & 255, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255);
  const png: u8[] = [137, 80, 78, 71, 13, 10, 26, 10];
  chunk(png, 'IHDR', [(w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, 8, 6, 0, 0, 0]);
  chunk(png, 'IDAT', z);
  chunk(png, 'IEND', []);
  return png;
}
