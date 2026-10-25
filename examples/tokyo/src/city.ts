// The city: Pocket Tokyo's world (tools/city-world.py: its cells of 128 m, the far level of the whole city, the mid level a chunk per block,
// the near level a chunk per cell, the Tokyo Tower), and the heights the eye keeps above. zinc:3d's World chooses natively what a frame
// draws: the cells in view, each at the level of its distance, of their walls the sectors that face the eye, within the device's triangle
// budget. This file reads the chunks it asks for and frees the ones it no longer wants.
import { Scene, Camera, World } from 'zinc:3d';
import { readText, readBytes } from 'zinc:assets';
import { clock } from 'zinc:sys';
import { Device } from './devices';
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

  constructor(scene: Scene, dev: Device) {
    const w = new World(CITY_WORLD);
    w.nearReach = dev.nearReach; w.midReach = dev.midReach; w.budget = dev.budget; w.sectors = dev.sectors; w.idle = dev.idle;
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
      } else if (t[0] === 'hmap') w.shadows(CITY_HMAP, n(1), n(2), n(3), parseInt(t[4], 10), parseInt(t[5], 10), n(6), n(7));   // the pack's heights
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
    const w = this.world;
    for (const k of w.unused) w.free(k);
    const started = clock();
    let read: i32 = 0;
    for (const k of w.missing) {
      if (read > 0 && clock() - started >= ms) break;
      w.load(k);   // -1: a level this device's packs leave out (its cells keep another)
      read++;
    }
    this.loads += read;
    return read;
  }

  /** Whether the last select() found every chunk it wants loaded. */
  complete(): boolean { return this.world.missing.length === 0; }

  /** How far the night has come (0..1): the windows lit, the lamps' light on the ground, the tower floodlit. */
  setNight(night: number): void { this.world.setNight(night); }
}
