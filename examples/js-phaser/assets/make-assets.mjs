// Makes the pictures and the sound of this example: `node make-assets.mjs` (written for Zinc, public domain, CC0).
// Change a drawing below and run it again. Each letter is a colour of PALETTE, a dot is transparent.
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const PALETTE = { m: 0x6b4a2b, w: 0xf2efe6, b: 0x2b2f3a, r: 0xc8372d, y: 0xffd84a, o: 0xffa726, g: 0x4c5160, G: 0x7d8496, d: 0x3a3e4b };
const SPRITES = [   // 16 x 16 each: the boat, the star, the rock
  `................ ................ .......m........ .......mw....... .......mww...... .......mwww..... .......mwwww.... .......mwwwww...
   .......mwwwwww.. .......m........ bbbbbbbbbbbbbbbb .brrrrrrrrrrrrb. ..brrrrrrrrrrb.. ...bbbbbbbbbb... ................ ................`,
  `................ .......yy....... .......yy....... ......yyyy...... ......yooy...... .yyyyyyooyyyyyy. ..yyyooooooyyy.. ...yyooooooyy...
   ....yyooooyy.... ....yyooooyy.... ...yyyoyyoyyy... ...yyyy..yyyy... ..yyy......yyy.. ..y..........y.. ................ ................`,
  `................ .....gggggg..... ...gggGGGGggg... ..ggGGGGGGGGgg.. ..gGGGGdGGGGGg.. .ggGGddGGGGGGgg. .gGGGGGGGGdGGGg. .gGGGGGGGddGGGg.
   .gGGdGGGGGGGGGg. .ggGGGGGGGGGGgg. ..gGGGGGdGGGGg.. ..ggGGGGGGGGgg.. ...gggGGGGggg... .....gggggg..... ................ ................`,
];
const DIGITS = [   // 8 x 8 each, 0 to 9
  '.www.... w...w... w..ww... w.w.w... ww..w... w...w... .www.... ........', '..w..... .ww..... ..w..... ..w..... ..w..... ..w..... .www.... ........',
  '.www.... w...w... ....w... ...w.... ..w..... .w...... wwwww... ........', '.www.... w...w... ....w... ..ww.... ....w... w...w... .www.... ........',
  '...w.... ..ww.... .w.w.... w..w.... wwwww... ...w.... ...w.... ........', 'wwwww... w....... wwww.... ....w... ....w... w...w... .www.... ........',
  '..ww.... .w...... w....... wwww.... w...w... w...w... .www.... ........', 'wwwww... ....w... ...w.... ..w..... .w...... .w...... .w...... ........',
  '.www.... w...w... w...w... .www.... w...w... w...w... .www.... ........', '.www.... w...w... w...w... .wwww... ....w... ...w.... .ww..... ........',
];

/** The drawings side by side as a PNG file: 8-bit RGBA, no filter. */
function png(file, drawings, size) {
  const cells = drawings.map(d => d.trim().split(/\s+/)), width = size * cells.length, raw = Buffer.alloc(size * (1 + width * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < width; x++) {
    const colour = PALETTE[cells[Math.floor(x / size)][y][x % size]];
    if (colour !== undefined) raw.writeUInt32BE((colour << 8 | 255) >>> 0, y * (1 + width * 4) + 1 + x * 4);
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const head = Buffer.alloc(13); head.writeUInt32BE(width, 0); head.writeUInt32BE(size, 4); head.set([8, 6, 0, 0, 0], 8);
  writeFileSync(new URL(file, import.meta.url), Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
png('sprites.png', SPRITES, 16);
png('digits.png', DIGITS, 8);

/** A short note that slides from one pitch to another and fades, as a WAV file: 16 bits, mono, 22050 Hz. */
function wav(file, from, to, seconds) {
  const RATE = 22050, n = Math.round(RATE * seconds), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1'); b.writeUInt32LE(n * 2, 40);
  for (let i = 0, phase = 0; i < n; i++) {
    phase += 2 * Math.PI * (from + (to - from) * i / n) / RATE;
    b.writeInt16LE(Math.round(12000 * Math.sin(phase) * (1 - i / n)), 44 + i * 2);
  }
  writeFileSync(new URL(file, import.meta.url), b);
}
wav('catch.wav', 660, 1320, 0.12);
wav('crash.wav', 220, 55, 0.4);
