// Playfield inserts: the translucent lamps set into the playfield. The unlit ones are baked into the table art; the
// lit ones are drawn over it every frame from the game state (lanes, targets, rank ladder, missions, bonus
// multiplier, shoot again, extra ball, wormhole progress, arrows), plus the light chases.
import { polygon } from 'zinc:gfx';
import { Camera } from './camera';
import { pts, arrowPts, chevronPts, circlePts, keepPts } from './draw';
import { Table } from '../table/layout';

export const SH_CIRCLE: i32 = 0, SH_ARROW: i32 = 1, SH_CHEVRON: i32 = 2;

export class Insert {
  /** Outline projected with the screen camera (set by project()). */
  screen: number[] = [];
  glow: number[] = [];
  constructor(public shape: i32, public x: number, public y: number, public size: number, public angle: number, public color: u32) {}

  /** Outline into draw.pts; `grow` scales it (glow halos). */
  outline(cam: Camera, grow: number): void {
    if (this.shape === SH_ARROW) arrowPts(cam, this.x, this.y, this.angle, this.size * grow);
    else if (this.shape === SH_CHEVRON) chevronPts(cam, this.x, this.y, this.size * 1.6 * grow, this.size * grow);
    else circlePts(cam, this.x, this.y, 0, this.size / 2 * grow);
  }
}

export class Inserts {
  lanes: Insert[] = [];
  targets: Insert[] = [];
  ranks: Insert[] = [];
  missions: Insert[] = [];
  bonusX: Insert[] = [];
  holeProgress: Insert[] = [];
  shootAgain: Insert;
  extra: Insert;
  rampArrow: Insert;
  jackpot: Insert;
  spinnerArrow: Insert;
  holeArrow: Insert;
  all: Insert[] = [];

  constructor(t: Table) {
    const up = -Math.PI / 2;
    for (const s of t.lanes) this.lanes.push(this.add(new Insert(SH_CIRCLE, s.ax + s.len / 2, 3.95, 0.8, 0, 0x5cff8a)));
    for (const g of t.targets) this.targets.push(this.add(new Insert(SH_CIRCLE, 2.55, (g.ay + g.by) / 2, 0.55, 0, 0xffd23f)));
    for (let i: i32 = 0; i < 8; i++) this.ranks.push(this.add(new Insert(SH_CHEVRON, 9.8, 29.6 - i * 1.02, 0.62, 0, 0x3fe7ff)));
    for (let i: i32 = 0; i < 7; i++) {
      const u = (i - 3) / 3;
      this.missions.push(this.add(new Insert(SH_CIRCLE, 9.6 + u * 3.0, 18.9 + u * u * 1.1, 0.62, 0, 0xff8a2a)));
    }
    for (let i: i32 = 0; i < 4; i++) this.bonusX.push(this.add(new Insert(SH_CIRCLE, 7.95 + i * 1.23, 32.4 + Math.abs(i - 1.5) * 0.35, 0.9, 0, 0x5cff8a)));
    for (let i: i32 = 0; i < 3; i++) this.holeProgress.push(this.add(new Insert(SH_CIRCLE, 3.2 + i * 0.8, 16.0 + i * 0.45, 0.45, 0, 0xff4fa3)));
    this.shootAgain = this.add(new Insert(SH_CIRCLE, 9.8, 35.4, 1.0, 0, 0xff3b3b));
    this.extra = this.add(new Insert(SH_CIRCLE, 5.35, 14.4, 0.7, 0, 0xffd23f));
    this.rampArrow = this.add(new Insert(SH_ARROW, 13.7, 25.0, 1.9, up, 0x3fe7ff));
    this.jackpot = this.add(new Insert(SH_ARROW, 13.7, 27.3, 1.4, up, 0xff4fa3));
    this.spinnerArrow = this.add(new Insert(SH_ARROW, 17.55, 20.0, 1.6, up - 0.12, 0xffd23f));
    this.holeArrow = this.add(new Insert(SH_ARROW, 4.6, 18.3, 1.5, up - 0.55, 0xff4fa3));
  }

  private add(i: Insert): Insert { this.all.push(i); return i; }

  /** Projects every outline for the screen (after the camera is set up). */
  project(cam: Camera): void {
    for (const i of this.all) {
      i.outline(cam, 1); i.screen = keepPts();
      i.outline(cam, 1.9); i.glow = keepPts();
    }
  }

  /** A lit insert: the bright lamp, a hot centre, and a halo when `glow`. */
  static drawLit(i: Insert, cam: Camera, glow: boolean, level: number): void {
    const a: i32 = Math.round(255 * level);
    if (glow) polygon(i.glow, i.color, Math.round(55 * level));
    polygon(i.screen, i.color, a);
    i.outline(cam, 0.45);
    polygon(pts, 0xffffff, Math.round(170 * level));
  }
}
