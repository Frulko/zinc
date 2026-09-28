// zinc:lottie for the sim target: parses the metadata (size, frames, fps, layers) with JSON.parse and draws
// nothing (the sim's gfx is headless). Handles are allocated like the native side (first free slot of 64).
import { exists, readText } from 'zinc:fs';

interface A { w: number; h: number; ip: number; op: number; fr: number; layers: number }
const as: (A | null)[] = [];
const at = (a: number) => as[a] ?? null;

function parse(json: string): number {
  let j: any;
  try { j = JSON.parse(json); } catch { return -1; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.layers)) return -1;
  const num = (v: unknown, d: number) => typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : d;
  let slot = 0;
  while (slot < as.length && as[slot]) slot++;
  if (slot >= 64) return -1;
  as[slot] = { w: num(j.w, 0), h: num(j.h, 0), ip: num(j.ip, 0), op: num(j.op, 0), fr: num(j.fr, 30), layers: j.layers.length };
  return slot;
}

export default {
  parse,
  open(path: string): number { return exists(path) ? parse(readText(path)) : -1; },
  width(a: number): number { return at(a)?.w ?? 0; },
  height(a: number): number { return at(a)?.h ?? 0; },
  frames(a: number): number { const x = at(a); return x ? x.op - x.ip : 0; },
  fps(a: number): number { return at(a)?.fr ?? 0; },
  layers(a: number): number { return at(a)?.layers ?? 0; },
  draw(_a: number, _f: number, _x: number, _y: number, _w: number, _h: number, _alpha: number): void {},
  free(a: number): void { if (at(a)) as[a] = null; },
};
