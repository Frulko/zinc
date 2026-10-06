// zinc:video for the Zinc Next engine: the deterministic fake of video.sim.ts (files are not decoded: every entry lasts 5 s, the image has the requested size,
// 320x180 when 0x0, and time advances with gfx frames at 60 fps; order is sequential), written in the Zinc subset (no number truthiness, no `?.` on numbers).
import { createImage, destroyImage, frame } from 'zinc:gfx';
import { exists } from 'zinc:fs';

const DUR: number = 5;
const FPS: number = 60;
class P {
  w: number; h: number; img: number = -1; files: string[] = []; repeat: number = 1;
  running: boolean = false; paused: boolean = false; t0: number = 0; held: number = 0; first: number = 0;
  constructor(w: number, h: number) { this.w = w; this.h = h; }
}
const ps: (P | null)[] = [];
function at(p: number): P | null { return p >= 0 && p < ps.length ? ps[p] : null; }
function elapsed(p: P): number { return !p.running ? p.held : p.paused ? p.held : p.held + (frame() - p.t0) / FPS; }
function total(p: P): number { const t = elapsed(p); return p.repeat === 1 ? t : Math.min(t, (p.repeat === 2 ? 1 : p.files.length) * DUR); }
function entry(p: P): number { return p.files.length > 0 ? (p.first + Math.floor(total(p) / DUR)) % p.files.length : -1; }

export default {
  create(w: number, h: number): number {
    const p = new P(w, h);
    if (w > 0 && h > 0) p.img = createImage(w, h);
    ps.push(p);
    return ps.length - 1;
  },
  add(id: number, path: string): boolean {
    const p = at(id);
    if (p === null || !exists(path)) return false;
    if (p.img < 0) { p.w = 320; p.h = 180; p.img = createImage(p.w, p.h); }
    p.files.push(path);
    return true;
  },
  setOrder(_id: number, _order: number): void {},
  setRepeat(id: number, mode: number): void { const p = at(id); if (p !== null) p.repeat = mode; },
  setBackground(_id: number, _c: number): void {},
  play(id: number): void {
    const p = at(id);
    if (p === null) return;
    if (p.files.length > 0 && !p.running) { p.running = true; p.paused = false; p.t0 = frame(); } else p.paused = false;
  },
  stop(id: number): void { const p = at(id); if (p !== null) { p.running = false; p.held = 0; } },
  pause(id: number, on: boolean): void {
    const p = at(id);
    if (p === null || !p.running || on === p.paused) return;
    if (on) p.held = elapsed(p); else p.t0 = frame();
    p.paused = on;
  },
  skip(id: number, delta: number): void {
    const p = at(id);
    if (p !== null && p.files.length > 0) { p.first = (entry(p) + delta + p.files.length) % p.files.length; p.held = 0; p.t0 = frame(); p.running = true; }
  },
  jump(id: number, index: number): void {
    const p = at(id);
    if (p !== null && index >= 0 && index < p.files.length) { p.first = index; p.held = 0; p.t0 = frame(); p.running = true; }
  },
  image(id: number): number { const p = at(id); return p !== null ? p.img : -1; },
  width(id: number): number { const p = at(id); return p !== null && p.img >= 0 ? p.w : 0; },
  height(id: number): number { const p = at(id); return p !== null && p.img >= 0 ? p.h : 0; },
  index(id: number): number { const p = at(id); return p !== null ? entry(p) : -1; },
  count(id: number): number { const p = at(id); return p !== null ? p.files.length : 0; },
  position(id: number): number { const p = at(id); return p !== null ? total(p) % DUR : 0; },
  duration(id: number): number { const p = at(id); return p !== null && p.files.length > 0 ? DUR : 0; },
  loops(id: number): number { const p = at(id); return p !== null && p.files.length > 0 ? Math.floor(total(p) / (DUR * p.files.length)) : 0; },
  playing(id: number): boolean {
    const p = at(id);
    return p !== null && p.running && (p.repeat === 1 || total(p) < (p.repeat === 2 ? 1 : p.files.length) * DUR);
  },
  paused(id: number): boolean { const p = at(id); return p !== null ? p.paused : false; },
  decoder(_id: number): string { return 'sim'; },
  frames(id: number): number { const p = at(id); return p !== null ? Math.floor(total(p) * FPS) : 0; },
  dropped(_id: number): number { return 0; },
  close(id: number): void {
    const p = at(id);
    if (p !== null) { if (p.img >= 0) destroyImage(p.img); ps[id] = null; }
  },
};
