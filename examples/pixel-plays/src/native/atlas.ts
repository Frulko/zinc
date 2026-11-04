// Atlas of baked frames (format 1). A frame is a CachedModel captured from the real draw calls (lit volumes, exact depth), so a stamp looks like the live
// drawing and depth-tests against the ground; only the sub-pixel position is lost (the offset is rounded to one pixel). Frames are keyed by
// (entry name, variant, yaw8, pose), where yaw8 is the heading quantised to eight directions and pose a frame of the animation.
//
// Header (what a frame depends on, hashed for invalidation): { format, season, w, h, s, lighting, def }
//   format   ATLAS_FORMAT, bumped when the layout of a frame changes
//   season   the caller's lighting/palette setting (the atlas of another season is another atlas)
//   w, h, s  the buffer size and the pixels per world unit
//   lighting lightingHash(): the cool/warm light and the ramps of probe colours
//   def      hash of the definition: its version, entry names and axes sizes (a changed draw function bumps `version`)
// Frame (ModelArrays, see renderer.ts): parallel arrays of x, y (offsets from the bake origin), depth and packed colour, one entry per lit pixel.
// Index of a frame in its entry: ((variant * yaws + yaw8) * poses + pose). Frames are baked on first use, or all at once with bakeAll.
import { CachedModel, ModelArrays, beginModel, captureModel, inBakeView, lightingHash, W, H, S } from './renderer';

export const ATLAS_FORMAT = 1;
export interface AtlasAxes { variant: number; yaw8: number; pose: number; }
/** One thing the atlas holds. `draw` paints one frame at the world point (x, y, z): at the origin to bake it, at its place when the frame is missing. */
export interface AtlasEntry { name: string; variants: number; yaws: number; poses: number; draw: (axes: AtlasAxes, x: number, y: number, z: number) => void; }
export interface AtlasDef { version: number; season: number; entries: AtlasEntry[]; }
export interface AtlasHeader { format: number; season: number; w: number; h: number; s: number; lighting: number; def: number; }

export function hashNumbers(values: number[]): number {
  let h = 2166136261;
  for (const v of values) h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619) >>> 0;
  return h;
}
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}
export function defHash(def: AtlasDef): number {
  const parts: number[] = [def.version];
  for (const e of def.entries) { parts.push(hashText(e.name), e.variants, e.yaws, e.poses); }
  return hashNumbers(parts);
}
export function headerOf(def: AtlasDef): AtlasHeader {
  return { format: ATLAS_FORMAT, season: def.season, w: W, h: H, s: S, lighting: lightingHash(), def: defHash(def) };
}
/** The cache key of a header: equal keys mean frames can be reused. */
export function headerKey(h: AtlasHeader): number { return hashNumbers([h.format, h.season, h.w, h.h, h.s, h.lighting, h.def]); }

export class Atlas {
  header: AtlasHeader;
  private def: AtlasDef;
  private frames: (CachedModel | null)[][] = [];
  /** Frames baked so far (a counter for the tests and the logs). */
  baked = 0;
  constructor(def: AtlasDef) {
    this.def = def; this.header = headerOf(def);
    for (const e of def.entries) { const list: (CachedModel | null)[] = []; for (let k = 0; k < e.variants * e.yaws * e.poses; k++) list.push(null); this.frames.push(list); }
  }
  entryIndex(name: string): number {
    for (let k = 0; k < this.def.entries.length; k++) if (this.def.entries[k].name === name) return k;
    return -1;
  }
  /** True when light, size, zoom or definition changed since the bake: the frames are out of date and the caller makes a new atlas. */
  stale(): boolean { return headerKey(headerOf(this.def)) !== headerKey(this.header); }
  private slot(e: number, a: AtlasAxes): number {
    const entry = this.def.entries[e];
    if (a.variant < 0 || a.variant >= entry.variants || a.yaw8 < 0 || a.yaw8 >= entry.yaws || a.pose < 0 || a.pose >= entry.poses) return -1;
    return (a.variant * entry.yaws + a.yaw8) * entry.poses + a.pose;
  }
  /** Bakes one frame (a no-op when it exists) and returns it, or null for an unknown name or axes. */
  bake(name: string, a: AtlasAxes): CachedModel | null {
    const e = this.entryIndex(name);
    if (e < 0) return null;
    const k = this.slot(e, a);
    if (k < 0) return null;
    const have = this.frames[e][k];
    if (have !== null) return have;
    let frame: CachedModel | null = null;
    inBakeView((): void => { beginModel(); this.def.entries[e].draw(a, 0, 0, 0); frame = captureModel(); });
    this.frames[e][k] = frame; this.baked++;
    return frame;
  }
  /** Bakes every frame of every entry. */
  bakeAll(): void {
    for (const entry of this.def.entries) for (let v = 0; v < entry.variants; v++) for (let y = 0; y < entry.yaws; y++) for (let p = 0; p < entry.poses; p++) this.bake(entry.name, { variant: v, yaw8: y, pose: p });
  }
  /** Draws a frame at the world point; a frame that cannot exist (unknown axes) is drawn live by the entry's own function. */
  stamp(name: string, a: AtlasAxes, x: number, y: number, z: number, lazy: boolean = true): void {
    const e = this.entryIndex(name);
    if (e < 0) return;
    const k = this.slot(e, a);
    let frame = k < 0 ? null : this.frames[e][k];
    if (frame === null && lazy && k >= 0) frame = this.bake(name, a);
    if (frame === null) { this.def.entries[e].draw(a, x, y, z); return; }
    frame.drawAt(x, y, z);
  }
  /** The packed frame, for saving (null when not baked). */
  frameArrays(name: string, a: AtlasAxes): ModelArrays | null {
    const e = this.entryIndex(name);
    const k = e < 0 ? -1 : this.slot(e, a);
    const frame = k < 0 ? null : this.frames[e][k];
    return frame === null ? null : frame.toArrays();
  }
}
export function bakeAtlas(def: AtlasDef, all: boolean = false): Atlas {
  const atlas = new Atlas(def);
  if (all) atlas.bakeAll();
  return atlas;
}
