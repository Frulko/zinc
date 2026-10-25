// The city: Pocket Tokyo's world (tools/city-world.py: its cells of 128 m, the far level of the whole city, the mid level a chunk per block,
// the near level a chunk per cell, the Tokyo Tower), and the heights the eye keeps above. zinc:3d's World chooses natively what a frame
// draws: the cells in view, each at the level of its distance, of their walls the sectors that face the eye, within the device's triangle
// budget. This file reads the chunks it asks for and frees the ones it no longer wants.
import { Scene, Camera, World, Defaults3D } from 'zinc:3d';
import { readText, readBytes } from 'zinc:assets';
import { CITY_INDEX, CITY_HEIGHTS, CITY_HMAP, CITY_WORLD } from './constants';

export class City {
  readonly world: World;
  view: number[] = [620, 260, 760, 0, 110, 0];
  hour = 15.5;
  tour: number[][] = [];
  credits: string[] = [];
  private heights: u8[] = [];
  private hx0 = 0;
  private hz0 = 0;
  private hstep = 8;
  private hw: i32 = 0;
  private hh: i32 = 0;
  private hy0 = 0;
  private hunit = 2;
  /** Chunks read since the start. */
  loads: i32 = 0;
  /** city.txt's `hmap` line: the pack's height map that zinc:3d's shadows are swept from (empty: none). */
  private hmap: number[] = [];

  constructor(scene: Scene, dev: Defaults3D) {
    const w = new World(CITY_WORLD, dev);
    scene.add(w);
    this.world = w;
    for (const line of readText(CITY_INDEX).split('\n')) {
      const t = line.split(' ');
      const n = (i: i32): number => parseFloat(t[i]);
      if (t[0] === 'view') this.view = [n(1), n(2), n(3), n(4), n(5), n(6)];
      else if (t[0] === 'city') this.hour = n(6);
      else if (t[0] === 'tour') this.tour.push([n(1), n(2), n(3), n(4), n(5), n(6)]);
      else if (t[0] === 'heights') {
        this.hx0 = n(1); this.hz0 = n(2); this.hstep = n(3); this.hw = parseInt(t[4], 10); this.hh = parseInt(t[5], 10); this.hy0 = n(6); this.hunit = n(7);
      } else if (t[0] === 'hmap') { this.hmap = [n(1), n(2), n(3), n(4), n(5), n(6), n(7)]; this.setShadows(true); }   // the pack's heights
      else if (t[0] === 'credit') this.credits.push(line.slice(7));
    }
    this.heights = readBytes(CITY_HEIGHTS);
  }

  /** The height of whatever stands at (x, z), metres. */
  top(x: number, z: number): number {
    const i: i32 = Math.floor((x - this.hx0) / this.hstep), j: i32 = Math.floor((z - this.hz0) / this.hstep);
    if (i < 0 || j < 0 || i >= this.hw || j >= this.hh) return 0;
    return this.hy0 + this.heights[j * this.hw + i] * this.hunit;
  }

  /** Chooses what the next render of `camera` draws, and what to read for it and for the points `ahead` (x, y, z each). */
  select(camera: Camera, aspect: number, ahead: number[], dt: number): void { this.world.select(camera, aspect, ahead, dt); }

  /** Frees the chunks the last select() no longer wants and reads the ones it asked for, coarse levels and nearest first, for up to `ms`
   *  milliseconds (at least one). Returns the chunks read. */
  serve(ms: number): i32 {
    const read = this.world.serve(ms);
    this.loads += read;
    return read;
  }

  /** The shadows on or off (drawn where the renderer can: the 3DS). */
  setShadows(on: boolean): void {
    const m = this.hmap;
    if (m.length < 7) return;
    if (on) this.world.shadows(CITY_HMAP, m[0], m[1], m[2], m[3], m[4], m[5], m[6]);
    // ponytail: zinc:3d has no switch for them; a flat field of 2 x 2 heights over the whole city (unit 0) leaves everything in the light
    else this.world.shadows(CITY_HEIGHTS, m[0], m[1], 8192, 2, 2, 0, 0);
  }

  /** The heights as a map picture, RGBA, `w` x `h` pixels of `metres` from (x0, z0): the bay in blue, the roofs lighter the higher. */
  mapPixels(x0: number, z0: number, metres: number, w: i32, h: i32): u8[] {
    const px: u8[] = [];
    for (let j: i32 = 0; j < h; j++) {
      for (let i: i32 = 0; i < w; i++) {
        const top = this.top(x0 + (i + 0.5) * metres, z0 + (j + 0.5) * metres);
        const g: i32 = Math.round(Math.min(220, 46 + Math.max(0, top - 4) * 1.1));
        if (top <= 2.5) { px.push(26); px.push(52); px.push(84); }
        else { px.push(g); px.push(g); px.push(g + 6 > 255 ? 255 : g + 6); }
        px.push(255);
      }
    }
    return px;
  }

  /** Whether the last select() found every chunk it wants loaded. */
  complete(): boolean { return this.world.missing.length === 0; }

  /** How far the night has come (0..1): the windows lit, the lamps' light on the ground, the tower floodlit. */
  setNight(night: number): void { this.world.setNight(night); }
}
