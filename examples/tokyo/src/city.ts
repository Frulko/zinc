// The city: its blocks of 512 m, each a model at up to three levels of detail (the files the asset build made from the GLBs of
// tools/city-gltf.py), the Tokyo Tower at its own three, and the heights the eye keeps above. Each frame chooses, for every block in view,
// the finest level its distance and the device's triangle budget allow, nearest blocks first, and hides the rest.
import { Node, Scene, Material, loadModel } from 'zinc:3d';
import { readText, readBytes, exists } from 'zinc:assets';
import { image } from 'zinc:gfx';
import { Device } from './devices';
import { LANDMARK_GLOW, CITY_DIR, CITY_INDEX, CITY_HEIGHTS, FACADE_DAY, FACADE_NIGHT, LOD_NEAR, LOD_MID, LOD_FAR, LOD_NAMES } from './constants';

/** A block, or the landmark: its bounds, its triangles at each level and the models loaded so far. */
export class Place {
  name = '';
  /** The block whose ground picture a tile shares (its night picture is that block's). */
  ground = '';
  min: number[] = [0, 0, 0];
  max: number[] = [0, 0, 0];
  tris: i32[] = [0, 0, 0];
  /** Whether this device's packs carry the level (the asset build may leave the near level out). */
  has: boolean[] = [false, false, false];
  models: (Node | null)[] = [null, null, null];
  /** The landmark's distances from near to mid and from mid to far (blocks use the device's). */
  reach: number[] = [0, 0];
  readonly group = new Node(null, null);
  /** The level drawn this frame, -1 none; and the seconds since the mid level was last wanted (to free it). */
  shown: i32 = -1;
  idle = 0;
  distance = 0;
}

export class City {
  readonly scene: Scene;
  readonly blocks: Place[] = [];
  readonly landmarks: Place[] = [];
  view: number[] = [620, 260, 760, 0, 110, 0];
  hour = 15.5;
  tour: number[][] = [];
  credits: string[] = [];
  /** The parts of the loaded models whose picture changes with the night (facades, ground), with their two pictures. */
  private readonly swaps: Material[] = [];
  private readonly swapDay: i32[] = [];
  private readonly swapNight: i32[] = [];
  /** The landmark's painted parts: floodlit by night. */
  private readonly glows: Material[] = [];
  private readonly facadeDay: i32;
  private readonly facadeNight: i32;
  private heights: u8[] = [];
  private hx0 = 0;
  private hz0 = 0;
  private hstep = 8;
  private hw: i32 = 0;
  private hh: i32 = 0;
  private hy0 = 0;
  private hunit = 2;
  private order: i32[] = [];
  private nightOn = false;
  /** Triangles of the levels chosen this frame, and the models read since the start. */
  triangles: i32 = 0;
  loads: i32 = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.facadeDay = image(FACADE_DAY);
    this.facadeNight = image(FACADE_NIGHT);   // -1 where the device's packs leave it out
    for (const line of readText(CITY_INDEX).split('\n')) {
      const w = line.split(' ');
      const n = (i: i32): number => parseFloat(w[i]);
      if (w[0] === 'view') this.view = [n(1), n(2), n(3), n(4), n(5), n(6)];
      else if (w[0] === 'city') this.hour = n(6);
      else if (w[0] === 'tour') this.tour.push([n(1), n(2), n(3), n(4), n(5), n(6)]);
      else if (w[0] === 'heights') {
        this.hx0 = n(1); this.hz0 = n(2); this.hstep = n(3); this.hw = parseInt(w[4], 10); this.hh = parseInt(w[5], 10); this.hy0 = n(6); this.hunit = n(7);
      } else if (w[0] === 'tile') {
        const p = new Place();
        p.name = w[1];
        p.ground = w[10];
        p.min = [n(2), n(5), n(3)];
        p.max = [n(2) + n(4), n(6), n(3) + n(4)];
        p.tris = [parseInt(w[7], 10), parseInt(w[8], 10), parseInt(w[9], 10)];
        this.blocks.push(p);
      } else if (w[0] === 'landmark') {
        const p = new Place();
        p.name = w[1];
        p.min = [n(2), n(3), n(4)];
        p.max = [n(5), n(6), n(7)];
        p.reach = [n(8), n(9)];
        p.tris = [parseInt(w[10], 10), parseInt(w[11], 10), parseInt(w[12], 10)];
        this.landmarks.push(p);
      } else if (w[0] === 'credit') this.credits.push(line.slice(7));
    }
    this.heights = readBytes(CITY_HEIGHTS);
    for (const p of this.blocks) this.place(p);
    for (const p of this.landmarks) this.place(p);
  }

  private place(p: Place): void {
    for (let l = 0; l < 3; l++) p.has[l] = p.tris[l] > 0 && exists(CITY_DIR + p.name + '.' + LOD_NAMES[l] + '.zmesh');
    this.order.push(this.order.length);
  }

  /** The height of whatever stands at (x, z), metres. */
  top(x: number, z: number): number {
    const i: i32 = Math.floor((x - this.hx0) / this.hstep), j: i32 = Math.floor((z - this.hz0) / this.hstep);
    if (i < 0 || j < 0 || i >= this.hw || j >= this.hh) return 0;
    return this.hy0 + this.heights[j * this.hw + i] * this.hunit;
  }

  /** Chooses and loads what this frame draws, for an eye at `eye` looking along `look` (unit) with a cone of half-angle `half` (radians).
   *  At most one model is read a frame; until it is, the block shows a coarser level it has. */
  select(eye: number[], look: number[], half: number, dev: Device, dt: number): void {
    const all = this.blocks.length;
    // the distance of each place, then the places nearest first (insertion sort: the order changes little from frame to frame)
    for (let k = 0; k < this.order.length; k++) {
      const p = this.at(k);
      p.distance = boxDistance(p, eye);
    }
    for (let k = 1; k < this.order.length; k++) {
      const v = this.order[k];
      const d = this.at(v).distance;
      let j = k - 1;
      while (j >= 0 && this.at(this.order[j]).distance > d) { this.order[j + 1] = this.order[j]; j--; }
      this.order[j + 1] = v;
    }
    let spent: i32 = 0, readThisFrame = false;
    for (let k = 0; k < this.order.length; k++) {
      const idx = this.order[k];
      const p = this.at(idx);
      const landmark = idx >= all;
      let want: i32 = -1;
      if (p.distance < dev.farReach && inView(p, eye, look, half)) {
        const near = landmark ? p.reach[0] : dev.nearReach, mid = landmark ? p.reach[1] : dev.midReach;
        want = p.distance < near && p.has[LOD_NEAR] ? LOD_NEAR : p.distance < mid && p.has[LOD_MID] ? LOD_MID : LOD_FAR;
        // the budget, the far level included: a level only while the frame can afford it, else nothing (the haze)
        while (want <= LOD_FAR && (!p.has[want] || spent + p.tris[want] > dev.budget)) want++;
        if (want > LOD_FAR) want = -1;
      }
      // a level that is not loaded yet: read it if this frame has not read one, else show a coarser one that is
      let show = want;
      if (show >= 0 && p.models[show] === null) {
        if (!readThisFrame) { this.load(p, show); readThisFrame = true; }
        while (show >= 0 && show <= LOD_FAR && p.models[show] === null) show++;
        if (show > LOD_FAR) show = -1;
      }
      for (let l = 0; l < 3; l++) { const m = p.models[l]; if (m !== null) m.visible = l === show; }
      // only what is drawn is in the scene: the matrices of every node of the scene are made again each frame (costly in a console's interpreter)
      if ((show >= 0) !== (p.shown >= 0)) {
        if (show >= 0) this.scene.add(p.group);
        else this.scene.children.splice(this.scene.children.indexOf(p.group), 1);
      }
      p.shown = show;
      if (show >= 0) spent += p.tris[show];
      // a device short of memory frees the finer levels a place has not used for a while
      p.idle = want === LOD_NEAR || want === LOD_MID ? 0 : p.idle + dt;
      if (!dev.keepModels && p.idle > 4) { this.unload(p, LOD_NEAR); this.unload(p, LOD_MID); }
    }
    this.triangles = spent;
  }

  /** The night's pictures on or off: the windows lit, the lamps' light on the ground. Lit by themselves: their light is in the picture. */
  setNight(on: boolean): void {
    if (on === this.nightOn) return;
    this.nightOn = on;
    for (let i = 0; i < this.swaps.length; i++) this.dress(this.swaps[i], i);
    for (const m of this.glows) m.emissive = on ? LANDMARK_GLOW : 0;
  }

  private dress(m: Material, i: i32): void {
    m.texture = this.nightOn ? this.swapNight[i] : this.swapDay[i];
    m.emissive = this.nightOn ? 0xffffff : 0;
  }

  private at(k: i32): Place { return k < this.blocks.length ? this.blocks[k] : this.landmarks[k - this.blocks.length]; }

  private load(p: Place, lod: i32): void {
    const node = loadModel(CITY_DIR + p.name + '.' + LOD_NAMES[lod] + '.zmesh');
    for (const part of node.children) {
      const m = part.material;
      if (m === null) continue;
      if (m.texture < 0 && this.blocks.indexOf(p) < 0) { this.glows.push(m); m.emissive = this.nightOn ? LANDMARK_GLOW : 0; continue; }
      if (m.texture < 0) continue;
      let night = -1;
      if (m.texture === this.facadeDay) night = this.facadeNight;
      else night = image(CITY_DIR + p.ground + '.night.png');   // a block's ground, near or mid; -1: not on this device
      if (night < 0) continue;
      this.swaps.push(m); this.swapDay.push(m.texture); this.swapNight.push(night);
      this.dress(m, this.swaps.length - 1);
    }
    node.visible = false;
    p.group.add(node);
    p.models[lod] = node;
    this.loads++;
  }

  private unload(p: Place, lod: i32): void {
    const node = p.models[lod];
    if (node === null) return;
    for (const part of node.children) {
      const mesh = part.mesh, m = part.material;
      if (mesh !== null) mesh.dispose();
      const i = m !== null ? this.swaps.indexOf(m) : -1;
      if (i >= 0) { this.swaps.splice(i, 1); this.swapDay.splice(i, 1); this.swapNight.splice(i, 1); }
    }
    const i = p.group.children.indexOf(node);
    if (i >= 0) p.group.children.splice(i, 1);
    p.models[lod] = null;
  }
}

/** Metres from the eye to the nearest point of a place's box. */
function boxDistance(p: Place, eye: number[]): number {
  let s = 0;
  for (let a = 0; a < 3; a++) {
    const d = eye[a] < p.min[a] ? p.min[a] - eye[a] : eye[a] > p.max[a] ? eye[a] - p.max[a] : 0;
    s += d * d;
  }
  return Math.sqrt(s);
}

/** Whether a place's bounding sphere meets the cone of view. */
function inView(p: Place, eye: number[], look: number[], half: number): boolean {
  const cx = (p.min[0] + p.max[0]) / 2 - eye[0], cy = (p.min[1] + p.max[1]) / 2 - eye[1], cz = (p.min[2] + p.max[2]) / 2 - eye[2];
  const ex = (p.max[0] - p.min[0]) / 2, ey = (p.max[1] - p.min[1]) / 2, ez = (p.max[2] - p.min[2]) / 2;
  const r = Math.sqrt(ex * ex + ey * ey + ez * ez), d = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (d <= r) return true;
  const cosToCentre = (cx * look[0] + cy * look[1] + cz * look[2]) / d;
  return Math.acos(Math.max(-1, Math.min(1, cosToCentre))) <= half + Math.asin(r / d);
}
