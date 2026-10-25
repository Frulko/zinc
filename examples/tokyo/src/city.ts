// The city: its tiles of 256 m, each a model at up to three levels of detail (the files the asset build made from the GLBs of
// tools/city-gltf.py), the Tokyo Tower at its own three, and the heights the eye keeps above. zinc:3d's Cells does the rest natively: what
// is in view, the coarsest level whose error is under a pixel or so, the device's triangle budget, the fades; this file reads the models
// it asks for and frees the ones it no longer wants.
import { Node, Scene, Material, Cells, CellView, loadModel } from 'zinc:3d';
import { readText, readBytes, exists } from 'zinc:assets';
import { image } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Device } from './devices';
import { LANDMARK_GLOW, CITY_DIR, CITY_INDEX, CITY_HEIGHTS, FACADE_DAY, FACADE_NIGHT, LOD_NAMES, ERROR_MID, ERROR_FAR, REFERENCE_FOCAL } from './constants';

/** A tile, or the landmark: its files and the models of its levels loaded so far (their meshes are the cells' parts). */
export class Place {
  name = '';
  /** The block whose ground picture a tile shares (its night picture is that block's); '' for the landmark. */
  ground = '';
  cell: i32 = -1;
  models: (Node | null)[] = [null, null, null];
}

export class City {
  readonly cells = new Cells();
  /** The view and the device's limits the cells are chosen with (main.ts sets the view each frame). */
  readonly sight = new CellView();
  readonly places: Place[] = [];
  view: number[] = [620, 260, 760, 0, 110, 0];
  hour = 15.5;
  tour: number[][] = [];
  credits: string[] = [];
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
  /** Models read since the start. */
  loads: i32 = 0;

  constructor(scene: Scene, dev: Device) {
    const s = this.sight;
    s.tau = dev.tau; s.budget = dev.budget; s.reach = dev.reach; s.fogStart = dev.fogStart; s.fade = dev.fade; s.idle = dev.idle;
    scene.add(this.cells);
    this.facadeDay = image(FACADE_DAY);
    this.facadeNight = image(FACADE_NIGHT);   // -1 where the device's packs leave it out
    for (const line of readText(CITY_INDEX).split('\n')) {
      const w = line.split(' ');
      const n = (i: i32): number => parseFloat(w[i]);
      const t = (i: i32): i32 => parseInt(w[i], 10);
      if (w[0] === 'view') this.view = [n(1), n(2), n(3), n(4), n(5), n(6)];
      else if (w[0] === 'city') this.hour = n(6);
      else if (w[0] === 'tour') this.tour.push([n(1), n(2), n(3), n(4), n(5), n(6)]);
      else if (w[0] === 'heights') {
        this.hx0 = n(1); this.hz0 = n(2); this.hstep = n(3); this.hw = t(4); this.hh = t(5); this.hy0 = n(6); this.hunit = n(7);
      } else if (w[0] === 'tile') {
        // a mid level as fine as the near one has no error of its own: the near level is then never read
        const tris = [t(7), t(8), t(9)];
        this.place(w[1], w[10], [n(2), n(5), n(3)], [n(2) + n(4), n(6), n(3) + n(4)], [0, tris[1] === tris[0] ? 0 : ERROR_MID, ERROR_FAR], tris);
      } else if (w[0] === 'landmark') {
        // its own distances from near to mid and from mid to far, as errors seen by the reference camera at a pixel
        this.place(w[1], '', [n(2), n(3), n(4)], [n(5), n(6), n(7)], [0, n(8) / REFERENCE_FOCAL, n(9) / REFERENCE_FOCAL], [t(10), t(11), t(12)]);
      } else if (w[0] === 'credit') this.credits.push(line.slice(7));
    }
    this.heights = readBytes(CITY_HEIGHTS);
  }

  private place(name: string, ground: string, min: number[], max: number[], errors: number[], tris: i32[]): void {
    const p = new Place();
    p.name = name; p.ground = ground;
    // a level this device's packs leave out (the asset build's per-target rules) is not one the cells may ask for
    for (let l = 0; l < 3; l++) if (tris[l] > 0 && !exists(CITY_DIR + name + '.' + LOD_NAMES[l] + '.zmesh')) tris[l] = 0;
    p.cell = this.cells.addCell(min, max, errors, tris);
    this.places.push(p);
  }

  /** The height of whatever stands at (x, z), metres. */
  top(x: number, z: number): number {
    const i: i32 = Math.floor((x - this.hx0) / this.hstep), j: i32 = Math.floor((z - this.hz0) / this.hstep);
    if (i < 0 || j < 0 || i >= this.hw || j >= this.hh) return 0;
    return this.hy0 + this.heights[j * this.hw + i] * this.hunit;
  }

  /** Chooses what the next frame draws, seen from `points[0..2]`, and what to read for it and for the points after it (x, y, z each). */
  select(points: number[], dt: number): void { this.cells.select(points, this.sight, dt); }

  /** Reads the models the last select() asked for, coarse levels and nearest first, for up to `ms` milliseconds (at least one), and frees
   *  the ones it no longer wants. Returns the models read. */
  serve(ms: number): i32 {
    const u = this.cells.unused;
    for (let k = 0; k + 1 < u.length; k += 2) this.unload(this.places[u[k]], u[k + 1]);
    const want = this.cells.missing, started = clock();
    let read: i32 = 0;
    for (let k = 0; k + 1 < want.length && (read === 0 || clock() - started < ms); k += 2) { this.load(this.places[want[k]], want[k + 1]); read++; }
    return read;
  }

  /** Whether the last select() found every level it wants loaded. */
  complete(): boolean { return this.cells.missing.length === 0; }

  /** The night's pictures on or off: the windows lit, the lamps' light on the ground, the tower floodlit. */
  setNight(on: boolean): void { this.cells.setNight(on); }

  private load(p: Place, lod: i32): void {
    if (p.models[lod] !== null) return;
    const node = loadModel(CITY_DIR + p.name + '.' + LOD_NAMES[lod] + '.zmesh');
    for (const part of node.children) {
      const m = part.material, mesh = part.mesh;
      if (m === null || mesh === null) continue;
      // by night: the facades' lit windows and the ground's lamps, lit by themselves (their light is in the picture); the tower floodlit
      let night = m.texture, glow = m.emissive;
      if (m.texture < 0 && p.ground === '') glow = LANDMARK_GLOW;
      else if (m.texture >= 0) {
        const lit = m.texture === this.facadeDay ? this.facadeNight : image(CITY_DIR + p.ground + '.night.png');   // -1: not on this device
        if (lit >= 0) { night = lit; glow = 0xffffff; }
      }
      this.cells.addPart(p.cell, lod, mesh, m, night, glow);
    }
    p.models[lod] = node;
    this.loads++;
  }

  private unload(p: Place, lod: i32): void {
    const node = p.models[lod];
    if (node === null) return;
    this.cells.clearLevel(p.cell, lod);
    for (const part of node.children) { const mesh = part.mesh; if (mesh !== null) mesh.dispose(); }
    p.models[lod] = null;
  }
}
