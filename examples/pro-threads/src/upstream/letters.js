/*
 * The letters: each is a few sheets of threads, and pack() lays rows of
 * them out for the shader. Shapes are measured off the original, 2000 x
 * 1293, in its pixels; every letter keeps its cell, 657 x 1293.
 */

export const ASPECT = 2000 / 1293;
export const PX = 1 / 1293;
export const CELL = 657 * PX;

const SLIT = 6.5 * PX;              // half the slit's width
const S = SLIT / CELL;              // the same, as a fraction of the cell
const SWEEP_R = 32 * PX;            // a sweep's corner on its outer side
const DOME = 80 * PX;               // a dome's big outer corner
const FOOT = 56 * PX;               // a foot's wide corner by the slit
const FOOT_TIP = 44 * PX;           // how far a foot's outer side flares out
const WEDGE = 110 * PX;             // how deep a wedge cuts in from the outer side

export const MAX_LETTERS = 10;      // in a typed word
export const MAX_CELLS = 32;        // across all rows
export const MAX_ROWS = 4;
const MAX_SHEETS = 4;
const MAX_FIBRES = 4;               // coloured threads per letter
export const SHEET_TEXELS = MAX_SHEETS * 3;
export const TEXELS = SHEET_TEXELS + MAX_FIBRES * 3;
export const ALPHABET = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'];

// How an end bends a sheet: the sideways travel at its left and right
// edges, and how tall the bend is. An edge is inner when it runs along a
// slit and outer when it is the letter's own side.
//   arch   inner edges lean over the slit, outer corners round off
//   dome   the same with a much bigger outer corner
//   taper  the same again, drawn in far enough to point the letter
//   sweep  the sheet leans toward its slit, flaring into a tip there
//   wedge  a sweep whose outer side also cuts deep in toward the tip, so
//          two of them meeting make a < (K's arms)
//   foot   the sheet leans away from its slit: a wide round corner by the
//          slit, and the outer side flaring out into a thin tip that
//          runs on under the next letter (R's leg)
//   round  both corners round off
//   flat   no bend
function bend(mode, innerL, innerR, shape) {
  const R = shape.corner * PX;
  const ARCH = shape.arch * PX;
  const TIP = shape.tip * PX;
  if (mode === 'arch') return { d: [innerL ? -ARCH : R, innerR ? ARCH : -R], h: 48 * PX };
  if (mode === 'dome') return { d: [innerL ? -ARCH : DOME, innerR ? ARCH : -DOME], h: 120 * PX };
  if (mode === 'taper') return { d: [innerL ? -ARCH : 2 * DOME, innerR ? ARCH : -2 * DOME], h: 330 * PX };
  if (mode === 'sweep' && innerL && !innerR) return { d: [-TIP, -SWEEP_R], h: 46 * PX };
  if (mode === 'sweep' && innerR && !innerL) return { d: [SWEEP_R, TIP], h: 46 * PX };
  if (mode === 'wedge' && innerL && !innerR) return { d: [-TIP, -WEDGE], h: 220 * PX };
  if (mode === 'wedge' && innerR && !innerL) return { d: [WEDGE, TIP], h: 220 * PX };
  if (mode === 'foot' && innerL && !innerR) return { d: [FOOT, FOOT_TIP], h: 42 * PX };
  if (mode === 'foot' && innerR && !innerL) return { d: [-FOOT_TIP, -FOOT], h: 42 * PX };
  if (mode === 'flat') return { d: [0, 0], h: 1 };
  return { d: [R, -R], h: 36 * PX };
}

// A letter is a list of sheets [columns, top, bottom, top end, bottom
// end, options]. Columns are L or R (the halves either side of a slit
// down the middle), F (the full width) or [from, to] as fractions of the
// cell, slits included. A sheet starting at the letter's left edge
// without spanning it is dim, like the original's left halves; the rest
// are lit (`lit` says otherwise). `restart` starts the light again at
// the sheet's top and `glow` warms it where it ends.
//
// P, R and O are measured off the original, down to its few coloured
// threads. Each is one glowing fibre, sampled along its length: blue-white
// or sky blue above, then white-hot, cream, yellow, amber, orange and red
// where it warms, fading out where it ends. An accent is [across the
// cell, top, bottom, how blue it is above, where it starts and stops
// warming (none: 2), and whether it cools back to white after warming
// instead of ending, as on R]. Other letters get a few of their own,
// picked from the letter.
const T = 2 / 1293;
const B = 1291 / 1293;
const stem = ['L', T, B, 'arch', 'sweep'];
const third = [[0, 1 / 3 - S], [1 / 3 + S, 2 / 3 - S], [2 / 3 + S, 1]];
const again = { restart: true };
const glow = { glow: true };
const both = { restart: true, glow: true };
const LETTERS = {
  A: [['L', T, 0.6, 'arch', 'sweep'], ['R', T, 0.6, 'arch', 'sweep'], [[0, 0.36], 0.6, B, 'round', 'round', again], [[0.64, 1], 0.6, B, 'round', 'round', again]],
  B: [stem, ['R', T, 0.47, 'arch', 'sweep'], ['R', 0.53, B, 'sweep', 'sweep', both]],
  C: [stem, ['R', T, 0.3, 'arch', 'sweep', glow], ['R', 0.7, B, 'sweep', 'sweep', both]],
  D: [stem, ['R', T, B, 'dome', 'dome', glow]],
  E: [stem, ['R', T, 0.28, 'arch', 'sweep', glow], ['R', 0.42, 0.58, 'sweep', 'sweep', both], ['R', 0.72, B, 'sweep', 'sweep', both]],
  F: [stem, ['R', T, 0.28, 'arch', 'sweep', glow], ['R', 0.42, 0.58, 'sweep', 'sweep', both]],
  G: [stem, ['R', T, 0.28, 'arch', 'sweep', glow], ['R', 0.48, B, 'sweep', 'sweep', both]],
  H: [['L', T, 0.5, 'round', 'sweep'], ['R', T, 0.5, 'round', 'sweep'], ['L', 0.5, B, 'sweep', 'round', again], ['R', 0.5, B, 'sweep', 'round', again]],
  I: [[[0.24, 0.76], T, B, 'round', 'round']],
  J: [['R', T, B, 'round', 'sweep', glow], ['L', 0.62, B, 'round', 'sweep', { restart: true, lit: true }]],
  K: [['L', T, B, 'round', 'sweep'], ['R', T, 0.5, 'round', 'wedge'], ['R', 0.5, B, 'wedge', 'foot', both]],
  L: [stem, ['R', 0.72, B, 'sweep', 'sweep', both]],
  M: [[third[0], T, B, 'arch', 'round'], [third[1], T, B, 'arch', 'round'], [third[2], T, B, 'arch', 'round']],
  N: [['L', T, B, 'arch', 'round'], ['R', T, B, 'arch', 'round', glow]],
  O: [stem, ['R', T, B, 'arch', 'sweep', glow]],
  P: [stem, ['R', T, 968 / 1293, 'arch', 'sweep', glow]],
  Q: [stem, ['R', T, 0.8, 'arch', 'sweep'], ['R', 0.8, B, 'sweep', 'foot', both]],
  R: [stem, ['R', T, 645 / 1293, 'arch', 'sweep'], ['R', 645 / 1293, B, 'sweep', 'foot', both]],
  S: [['L', T, 0.52, 'arch', 'sweep'], ['R', T, 0.32, 'arch', 'sweep', glow], ['R', 0.4, B, 'sweep', 'sweep', both], ['L', 0.6, B, 'sweep', 'sweep', again]],
  T: [['F', T, 0.27, 'round', 'round'], [[0.3, 0.7], 0.31, B, 'round', 'round', again]],
  U: [['L', T, B, 'round', 'arch'], ['R', T, B, 'round', 'arch', glow]],
  V: [['L', T, B, 'round', 'taper'], ['R', T, B, 'round', 'taper', glow]],
  W: [[third[0], T, B, 'round', 'arch'], [third[1], T, B, 'round', 'arch'], [third[2], T, B, 'round', 'arch', glow]],
  X: [['L', T, 0.5, 'round', 'wedge'], ['R', T, 0.5, 'round', 'wedge'], ['L', 0.5, B, 'wedge', 'round', again], ['R', 0.5, B, 'wedge', 'round', again]],
  Y: [['L', T, 0.5, 'round', 'sweep'], ['R', T, 0.5, 'round', 'sweep'], [[0.28, 0.72], 0.5, B, 'round', 'round', again]],
  Z: [['R', T, 0.52, 'arch', 'sweep'], ['L', T, 0.32, 'arch', 'sweep'], ['L', 0.4, B, 'sweep', 'sweep', again], ['R', 0.6, B, 'sweep', 'sweep', both]],
  0: [['L', T, B, 'arch', 'arch'], ['R', T, B, 'arch', 'arch', glow]],
};
const ACCENTS = {
  P: [[0.067, 0.04, 0.96, 1, 0.62, 0.93, 0], [0.941, 0.08, 0.66, 0, 0.3, 0.61, 0]],
  R: [[0.848, 0.04, 0.99, 0.2, 0.56, 0.84, 1]],
  O: [
    [0.157, 0.05, 0.97, 0.8, 0.52, 0.93, 0], [0.6, 0.05, 0.88, 0.1, 0.47, 0.83, 0],
    [0.956, 0.06, 0.99, 0.9, 0.62, 0.95, 0], [0.93, 0.12, 0.56, 1, 2, 2, 0],
  ],
};
const FALLBACK = LETTERS.O;

// A small seeded generator, so a letter's own accents stay put between visits.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function accentsFor(ch) {
  if (ACCENTS[ch]) return ACCENTS[ch];
  const rand = seeded(ch.codePointAt(0) * 2654435761);
  return Array.from({ length: 2 }, () => {
    const top = 0.03 + rand() * 0.25;
    const bottom = Math.min(0.98, top + 0.5 + rand() * 0.4);
    const from = top + (bottom - top) * (0.35 + rand() * 0.3);
    return [0.05 + rand() * 0.9, top, bottom, rand(), from, from + (bottom - from) * (0.75 + rand() * 0.25), rand() < 0.2 ? 1 : 0];
  });
}

// Packs rows of letters for the shader, each row centred under the
// widest. Everything goes in one texture, a row of texels per letter, in
// the letter row's own frame (a letter tall). Three texels per sheet:
//   0: left edge, right edge, top, bottom
//   1: sideways travel at the top (left edge, right edge), then at the bottom
//   2: how tall the bend is at the top and bottom, flags (1 lit, 2 light
//      starts again, 4 glows warm where it ends)
// then three per coloured thread: [x, top, bottom, how blue], [warms
// from, to, cools again] and [the letter's left and right edges, a seed].
// An unused sheet or thread starts at x = 1000. Rows are [shift across,
// first letter, letter count]. `shape` sizes the corners, arches and tips
// and the gaps between letters and rows, in the original's pixels.
export function pack(lines, shape) {
  const gap = shape.gap * PX;
  const rowsOf = lines.slice(0, MAX_ROWS).map((line) => [...line.toUpperCase()]);
  const data = new Float32Array(MAX_CELLS * TEXELS * 4).fill(0);
  const rows = new Float32Array(MAX_ROWS * 4);
  const widthOf = (n) => n * CELL + Math.max(0, n - 1) * gap;
  const width = Math.max(...rowsOf.map((r) => widthOf(r.length)));
  const columns = { L: [0, 0.5 - S], R: [0.5 + S, 1], F: [0, 1] };
  let cell = 0;
  rowsOf.forEach((chars, row) => {
    rows.set([(width - widthOf(chars.length)) / 2, cell, chars.length, 0], row * 4);
    chars.forEach((ch, i) => {
      if (cell >= MAX_CELLS) return;
      const x0 = i * (CELL + gap);
      const at = cell++;
      const texel = (k) => (at * TEXELS + k) * 4;
      for (let k = 0; k < MAX_SHEETS; k++) data[texel(k * 3)] = 1e3;
      for (let k = 0; k < MAX_FIBRES; k++) data[texel(SHEET_TEXELS + k * 3)] = 1e3;
      if (ch === ' ') return;
      (LETTERS[ch] || FALLBACK).slice(0, MAX_SHEETS).forEach(([cols, top, bottom, topEnd, bottomEnd, opt = {}], k) => {
        const [a, b] = typeof cols === 'string' ? columns[cols] : cols;
        const innerL = a > 0.001;
        const innerR = b < 0.999;
        const t = bend(topEnd, innerL, innerR, shape);
        const e = bend(bottomEnd, innerL, innerR, shape);
        const lit = opt.lit ?? (innerL || !innerR);
        const flags = (lit ? 1 : 0) + (opt.restart ? 2 : 0) + (opt.glow ? 4 : 0);
        data.set([
          x0 + a * CELL, x0 + b * CELL, top, bottom,
          ...t.d, ...e.d,
          t.h, e.h, flags, 0,
        ], texel(k * 3));
      });
      accentsFor(ch).slice(0, MAX_FIBRES).forEach(([ax, top, bottom, blue, from, to, cools], k) => {
        data.set([
          x0 + ax * CELL, top, bottom, blue,
          from, to, cools, 0,
          x0, x0 + CELL, at * 7.3 + k * 1.91, 0,
        ], texel(SHEET_TEXELS + k * 3));
      });
    });
  });
  const rowPitch = 1 + shape.rowGap;
  const height = rowsOf.length + (rowsOf.length - 1) * shape.rowGap;
  return { data, rows, nRows: rowsOf.length, width, height, rowPitch };
}
