// zinc:video for the sim target: a deterministic fake. Files are not decoded: every entry "lasts" 5 s, the image is
// the requested size (320x180 when 0x0), and time advances with gfx frames at 60 fps. Order is always sequential.
import { createImage, destroyImage, frame } from 'zinc:gfx';
import { exists } from 'zinc:fs';

const DUR = 5, FPS = 60;
interface P { w: number; h: number; img: number; files: string[]; repeat: number; running: boolean; paused: boolean; t0: number; held: number; first: number }
const ps: (P | null)[] = [];
const at = (p: number) => ps[p] ?? null;
const elapsed = (p: P) => !p.running ? p.held : p.paused ? p.held : p.held + (frame() - p.t0) / FPS;
const total = (p: P) => { const t = elapsed(p); return p.repeat === 1 ? t : Math.min(t, (p.repeat === 2 ? 1 : p.files.length) * DUR); };
const entry = (p: P) => p.files.length ? (p.first + Math.floor(total(p) / DUR)) % p.files.length : -1;

export default {
  create(w: number, h: number): number {
    const p: P = { w, h, img: -1, files: [], repeat: 1, running: false, paused: false, t0: 0, held: 0, first: 0 };
    if (w > 0 && h > 0) p.img = createImage(w, h);
    ps.push(p);
    return ps.length - 1;
  },
  add(id: number, path: string): boolean {
    const p = at(id);
    if (!p || !exists(path)) return false;
    if (p.img < 0) { p.w = 320; p.h = 180; p.img = createImage(p.w, p.h); }
    p.files.push(path);
    return true;
  },
  setOrder(_id: number, _order: number): void {},
  setRepeat(id: number, mode: number): void { const p = at(id); if (p) p.repeat = mode; },
  setBackground(_id: number, _c: number): void {},
  play(id: number): void { const p = at(id); if (p && p.files.length && !p.running) { p.running = true; p.paused = false; p.t0 = frame(); } else if (p) p.paused = false; },
  stop(id: number): void { const p = at(id); if (p) { p.running = false; p.held = 0; } },
  pause(id: number, on: boolean): void {
    const p = at(id);
    if (!p || !p.running || on === p.paused) return;
    if (on) p.held = elapsed(p); else p.t0 = frame();
    p.paused = on;
  },
  skip(id: number, delta: number): void { const p = at(id); if (p && p.files.length) { p.first = (entry(p) + delta + p.files.length) % p.files.length; p.held = 0; p.t0 = frame(); p.running = true; } },
  jump(id: number, index: number): void { const p = at(id); if (p && index >= 0 && index < p.files.length) { p.first = index; p.held = 0; p.t0 = frame(); p.running = true; } },
  image(id: number): number { return at(id)?.img ?? -1; },
  width(id: number): number { const p = at(id); return p && p.img >= 0 ? p.w : 0; },
  height(id: number): number { const p = at(id); return p && p.img >= 0 ? p.h : 0; },
  index(id: number): number { const p = at(id); return p ? entry(p) : -1; },
  count(id: number): number { return at(id)?.files.length ?? 0; },
  position(id: number): number { const p = at(id); return p ? total(p) % DUR : 0; },
  duration(id: number): number { const p = at(id); return p && p.files.length ? DUR : 0; },
  loops(id: number): number { const p = at(id); return p && p.files.length ? Math.floor(total(p) / (DUR * p.files.length)) : 0; },
  playing(id: number): boolean { const p = at(id); return !!p && p.running && (p.repeat === 1 || total(p) < (p.repeat === 2 ? 1 : p.files.length) * DUR); },
  paused(id: number): boolean { return at(id)?.paused ?? false; },
  decoder(_id: number): string { return 'sim'; },
  frames(id: number): number { const p = at(id); return p ? Math.floor(total(p) * FPS) : 0; },
  dropped(_id: number): number { return 0; },
  close(id: number): void { const p = at(id); if (p) { if (p.img >= 0) destroyImage(p.img); ps[id] = null; } },
};
