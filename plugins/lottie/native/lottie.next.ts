// zinc:lottie for the Zinc Next engine: the same API as lottie.sim.ts (metadata only: size, frames, fps, layers; it draws nothing), written in the subset of
// Zinc that the engine compiles (no `?.` on numbers, no nullable numbers). Handles are the first free slot of 64, like the native side.
import { exists, readText } from 'zinc:fs';

class Anim { w: number = 0; h: number = 0; ip: number = 0; op: number = 0; fr: number = 30; layers: number = 0; }
const anims: (Anim | null)[] = [];

function num(v: any, d: number): number {
  if (typeof v === 'number') return v as number;
  if (typeof v === 'boolean') return (v as boolean) ? 1 : 0;
  return d;
}

function parse(json: string): number {
  let j: any = null;
  try { j = JSON.parse(json); } catch (e) { return -1; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.layers)) return -1;
  let slot = 0;
  while (slot < anims.length && anims[slot] !== null) slot++;
  if (slot >= 64) return -1;
  const a = new Anim();
  a.w = num(j.w, 0); a.h = num(j.h, 0); a.ip = num(j.ip, 0); a.op = num(j.op, 0); a.fr = num(j.fr, 30);
  a.layers = j.layers.length;
  if (slot === anims.length) anims.push(a); else anims[slot] = a;
  return slot;
}

function at(a: number): Anim | null { return a >= 0 && a < anims.length ? anims[a] : null; }

export default {
  parse,
  open(path: string): number { return exists(path) ? parse(readText(path)) : -1; },
  width(a: number): number { const x = at(a); return x !== null ? x.w : 0; },
  height(a: number): number { const x = at(a); return x !== null ? x.h : 0; },
  frames(a: number): number { const x = at(a); return x !== null ? x.op - x.ip : 0; },
  fps(a: number): number { const x = at(a); return x !== null ? x.fr : 0; },
  layers(a: number): number { const x = at(a); return x !== null ? x.layers : 0; },
  draw(_a: number, _f: number, _x: number, _y: number, _w: number, _h: number, _alpha: number): void {},
  free(a: number): void { if (at(a) !== null) anims[a] = null; },
};
