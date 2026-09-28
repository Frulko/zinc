// The table: every wall, post, bumper, target, sensor and ramp, in table inches (x right, y towards the player).
// The playfield is 0.5 .. 19.1 wide with the shooter lane on the right (19.1 .. 20.4) and 42 long; the left and right
// halves mirror about x = 9.8 below the slingshots. buildTable() creates the physics World and keeps what the
// renderer and the rules need to know about each element (positions, tags, drawing styles).
import { World } from '../physics/world';
import { Flipper } from '../physics/flipper';
import {
  Circle, Hole, Material, Ramp, Segment, Sensor,
  METAL, RUBBER, PLASTIC, WIRE, BUMPER_SKIRT, SLING_RUBBER, TARGET_FACE,
  K_WALL, K_POST, K_BUMPER, K_SLING, K_TARGET, K_GATE,
} from '../physics/bodies';

/** Drawing styles of the walls. */
export const RAIL_METAL: i32 = 0, RAIL_RUBBER: i32 = 1, RAIL_GUIDE: i32 = 2, RAIL_RAMP: i32 = 3, RAIL_WIRE: i32 = 4,
  RAIL_FLAP: i32 = 5;

/** A drawn wall: a polyline with a style and a height (in), on a layer (ramp rails are drawn at the ramp height). */
export class Rail {
  xs: number[] = [];
  ys: number[] = [];
  constructor(public style: i32, public height: number, public layer: i32) {}
}

/** Sensor tags (World events). */
export const S_LANE: i32 = 0;         // 0, 1, 2: the three top lanes
export const S_SPINNER: i32 = 3;
export const S_INLANE_L: i32 = 4, S_INLANE_R: i32 = 5, S_OUTLANE_L: i32 = 6, S_OUTLANE_R: i32 = 7;
export const S_SHOOTER: i32 = 8;      // the ball left the shooter lane
export const P_RAMP_IN: i32 = 20, P_RAMP_BACK: i32 = 21, P_WIRE_IN: i32 = 22, P_WIRE_BACK: i32 = 23, P_WIRE_OUT: i32 = 24;

export const MIRROR: number = 19.6;   // x' = MIRROR - x maps the left half onto the right one
export const TABLE_W: number = 20.9;
export const TABLE_L: number = 42.4;
export const SHOOTER_X: number = 19.72;
export const PLUNGER_Y: number = 40.2;

export class Table {
  world: World;
  rails: Rail[] = [];
  bumpers: Circle[] = [];
  posts: Circle[] = [];
  targets: Segment[] = [];
  slings: Segment[] = [];
  lanes: Sensor[] = [];
  spinner: Sensor;
  hole: Hole;
  ramp: Ramp;
  wire: Ramp;
  left: Flipper;
  right: Flipper;
  gate: Segment;

  constructor(maxBalls: i32) {
    const w = new World(maxBalls);
    this.world = w;

    // ---- outer walls: left side, the top arch, the shooter lane
    const outer = this.rail(RAIL_METAL, 1.1, 0);
    this.pt(outer, 0.5, 36.0); this.pt(outer, 0.5, 10.4);
    for (let i: i32 = 1; i <= 24; i++) { const a = Math.PI + Math.PI * i / 24; this.pt(outer, 10.45 + 9.95 * Math.cos(a), 10.4 + 9.95 * Math.sin(a)); }
    this.pt(outer, 20.4, 41.9);
    this.wall(outer, METAL, 0.1, K_WALL);
    const bottomL = this.rail(RAIL_METAL, 1.1, 0);
    this.pt(bottomL, 0.5, 36.0); this.pt(bottomL, 3.3, 41.9);
    this.wall(bottomL, METAL, 0.1, K_WALL);
    const laneWall = this.rail(RAIL_METAL, 1.1, 0);
    this.pt(laneWall, 19.1, 41.9); this.pt(laneWall, 19.1, 12.6);
    this.wall(laneWall, METAL, 0.1, K_WALL);
    const bottomR = this.rail(RAIL_METAL, 1.1, 0);
    this.pt(bottomR, 19.1, 36.0); this.pt(bottomR, MIRROR - 3.3, 41.9);
    this.wall(bottomR, METAL, 0.1, K_WALL);
    // one-way gate at the top of the shooter lane, sloped so a ball never rests on it
    this.gate = new Segment(18.95, 12.5, 20.4, 11.2, 0.05, METAL, K_GATE, 0);
    this.gate.oneSided = true;
    w.addSegment(this.gate, 0);
    w.addPlunger(19.2, 20.3, PLUNGER_Y);
    w.sensors.push(new Sensor(19.15, 13.2, 20.35, 13.2, 0, S_SHOOTER));

    // ---- bottom: outlanes, inlanes, slingshots, flippers (left, then mirrored)
    for (let side: i32 = 0; side < 2; side++) {
      const m = side === 1;
      const X = (x: number): number => m ? MIRROR - x : x;
      const sep = this.rail(RAIL_GUIDE, 0.9, 0);
      this.pt(sep, X(2.0), 28.7); this.pt(sep, X(2.0), 32.6); this.pt(sep, X(5.95), 36.38);
      this.wall(sep, METAL, 0.12, K_WALL);
      this.post(X(2.0), 28.7, 0.28);
      // slingshot: a rubber triangle, the long inner edge kicks
      const p1x = X(3.75), p1y = 28.3, p2x = X(3.75), p2y = 31.8, p3x = X(5.65), p3y = 33.4;
      const band = this.rail(RAIL_RUBBER, 0.7, 0);
      this.pt(band, p1x, p1y); this.pt(band, p3x, p3y); this.pt(band, p2x, p2y); this.pt(band, p1x, p1y);
      const kick = new Segment(m ? p3x : p1x, m ? p3y : p1y, m ? p1x : p3x, m ? p1y : p3y, 0.18, SLING_RUBBER, K_SLING, side);
      w.addSegment(kick, 0);
      this.slings.push(kick);
      w.addSegment(new Segment(p3x, p3y, p2x, p2y, 0.18, RUBBER, K_WALL, 0), 0);
      w.addSegment(new Segment(p2x, p2y, p1x, p1y, 0.18, RUBBER, K_WALL, 0), 0);
      this.post(p1x, p1y, 0.25); this.post(p2x, p2y, 0.25); this.post(p3x, p3y, 0.25);
      w.sensors.push(new Sensor(X(2.15), 30.4, X(3.45), 30.4, 0, m ? S_INLANE_R : S_INLANE_L));
      w.sensors.push(new Sensor(X(0.65), 30.4, X(1.85), 30.4, 0, m ? S_OUTLANE_R : S_OUTLANE_L));
    }
    this.left = new Flipper(6.1, 37.0, 3.25, 0.5, 0.22, 0.5, -0.45, 0);
    this.right = new Flipper(MIRROR - 6.1, 37.0, 3.25, 0.5, 0.22, Math.PI - 0.5, Math.PI + 0.45, 1);
    w.flippers.push(this.left);
    w.flippers.push(this.right);

    // ---- top lanes: four guides with rubber-capped tips, a rollover in each lane
    const guides: number[] = [5.7, 7.85, 10.0, 12.15];
    for (const gx of guides) {
      const g = this.rail(RAIL_GUIDE, 0.8, 0);
      this.pt(g, gx, 3.5); this.pt(g, gx, 6.6);
      this.wall(g, METAL, 0.15, K_WALL);
      this.post(gx, 6.6, 0.22);
    }
    for (let i: i32 = 0; i < 3; i++) {
      const s = new Sensor(guides[i] + 0.2, 5.0, guides[i + 1] - 0.2, 5.0, 0, S_LANE + i);
      w.sensors.push(s);
      this.lanes.push(s);
    }

    // ---- pop bumpers
    const bx: number[] = [7.6, 11.4, 9.5], by: number[] = [10.4, 10.4, 13.7];
    for (let i: i32 = 0; i < 3; i++) this.bumpers.push(w.addCircle(new Circle(bx[i], by[i], 1.0, BUMPER_SKIRT, K_BUMPER, i), 0));

    // ---- kicker hole (upper left)
    this.hole = new Hole(3.4, 13.4, 0.45, 75, 0);
    w.holes.push(this.hole);

    // ---- drop targets: a bank of three on the left wall, facing the field
    for (let i: i32 = 0; i < 3; i++) {
      const y0 = 16.3 + i * 1.65;
      const t = new Segment(1.5, y0 + 1.35, 1.5, y0, 0.12, TARGET_FACE, K_TARGET, i);
      w.addSegment(t, 0);
      this.targets.push(t);
    }

    // ---- spinner lane on the right (under the wire ramp)
    const sg = this.rail(RAIL_GUIDE, 0.8, 0);
    this.pt(sg, 16.2, 17.6); this.pt(sg, 16.2, 12.4);
    this.wall(sg, METAL, 0.12, K_WALL);
    this.post(16.2, 17.6, 0.22);
    this.spinner = new Sensor(16.35, 15.0, 18.95, 15.0, 0, S_SPINNER);
    w.sensors.push(this.spinner);

    // ---- the ramp: a plastic climb up the middle right, a U-turn at the top, then a wire habitrail down the right
    // side (over the spinner lane) to the right inlane. Layers: 1 plastic, 2 wire.
    const rampL: number = 12.8, rampR: number = 14.6, mouthY: number = 22.6, uY: number = 9.0, ucx: number = 15.7;
    this.ramp = new Ramp('ramp', false);
    this.ramp.point(13.7, mouthY + 0.4, 0).point(13.7, 20.6, 0.5).point(13.7, uY, 2.7);
    for (let i: i32 = 1; i < 12; i++) { const a = Math.PI + Math.PI * i / 12; this.ramp.point(ucx + 2.0 * Math.cos(a), uY + 2.0 * Math.sin(a), 2.8); }
    this.ramp.point(17.7, uY, 2.8).point(17.7, uY + 1.2, 2.75);
    const rl = this.rail(RAIL_RAMP, 0.5, 1), rr = this.rail(RAIL_RAMP, 0.5, 1);
    this.pt(rl, rampL, mouthY); this.pt(rr, rampR, mouthY);
    for (let i: i32 = 0; i <= 12; i++) {
      const a = Math.PI + Math.PI * i / 12;
      this.pt(rl, ucx + 2.9 * Math.cos(a), uY + 2.9 * Math.sin(a));
      this.pt(rr, ucx + 1.1 * Math.cos(a), uY + 1.1 * Math.sin(a));
    }
    this.pt(rl, 18.6, uY + 1.4); this.pt(rr, 16.8, uY + 1.4);
    this.ramp.walls = this.segmentsOf(rl, PLASTIC, 0.08, K_WALL).concat(this.segmentsOf(rr, PLASTIC, 0.08, K_WALL));
    const rampLayer = w.addRamp(this.ramp);

    this.wire = new Ramp('wire', true);
    this.wire.point(17.7, uY, 2.8).point(17.7, 24.0, 1.5).point(16.9, 27.2, 0.8).point(16.72, 30.2, 0.12);
    const wl = this.rail(RAIL_WIRE, 0.45, 2), wr = this.rail(RAIL_WIRE, 0.45, 2);
    this.pt(wl, 16.8, uY + 0.4); this.pt(wl, 16.8, 24.0); this.pt(wl, 16.05, 27.2); this.pt(wl, 15.9, 30.4);
    this.pt(wr, 18.6, uY + 0.4); this.pt(wr, 18.6, 24.0); this.pt(wr, 17.75, 27.2); this.pt(wr, 17.55, 30.4);
    this.wire.walls = this.segmentsOf(wl, WIRE, 0.06, K_WALL).concat(this.segmentsOf(wr, WIRE, 0.06, K_WALL));
    const wireLayer = w.addRamp(this.wire);

    // portals: sensors whose normal points up the table (a -> b to the right); dir +1 = crossing upwards
    this.portal(rampL, mouthY, rampR, mouthY, 0, rampLayer, 1, P_RAMP_IN);
    this.portal(rampL, mouthY, rampR, mouthY, rampLayer, 0, -1, P_RAMP_BACK);
    this.portal(16.8, uY + 0.6, 18.6, uY + 0.6, rampLayer, wireLayer, -1, P_WIRE_IN);
    this.portal(16.8, uY + 0.6, 18.6, uY + 0.6, wireLayer, rampLayer, 1, P_WIRE_BACK);
    this.portal(15.9, 30.1, 17.55, 30.1, wireLayer, 0, -1, P_WIRE_OUT);

    // on the playfield the ramp's low end is solid: flaps along the mouth and a lip where it is too low to pass under
    const flapL = this.rail(RAIL_FLAP, 0.4, 0), flapR = this.rail(RAIL_FLAP, 0.4, 0), lip = this.rail(RAIL_FLAP, 0.4, 0);
    this.pt(flapL, rampL, mouthY); this.pt(flapL, rampL, 19.2);
    this.pt(flapR, rampR, mouthY); this.pt(flapR, rampR, 19.2);
    this.pt(lip, rampL, 19.2); this.pt(lip, rampR, 19.2);
    this.wall(flapL, PLASTIC, 0.08, K_WALL); this.wall(flapR, PLASTIC, 0.08, K_WALL); this.wall(lip, PLASTIC, 0.08, K_WALL);
  }

  private rail(style: i32, height: number, layer: i32): Rail {
    const r = new Rail(style, height, layer);
    this.rails.push(r);
    return r;
  }

  private pt(r: Rail, x: number, y: number): void { r.xs.push(x); r.ys.push(y); }

  private segmentsOf(r: Rail, mat: Material, radius: number, kind: i32): Segment[] {
    const out: Segment[] = [];
    for (let i: i32 = 0; i + 1 < r.xs.length; i++) out.push(new Segment(r.xs[i], r.ys[i], r.xs[i + 1], r.ys[i + 1], radius, mat, kind, 0));
    return out;
  }

  /** Physics segments along a playfield rail. */
  private wall(r: Rail, mat: Material, radius: number, kind: i32): void {
    for (const s of this.segmentsOf(r, mat, radius, kind)) this.world.addSegment(s, r.layer);
  }

  private post(x: number, y: number, r: number): void {
    this.posts.push(this.world.addCircle(new Circle(x, y, r, RUBBER, K_POST, 0), 0));
  }

  private portal(ax: number, ay: number, bx: number, by: number, from: i32, to: i32, dir: i32, tag: i32): void {
    const s = new Sensor(ax, ay, bx, by, from, tag);
    s.toLayer = to; s.dir = dir;
    this.world.sensors.push(s);
  }

  /** Drops or raises a drop target. */
  setTarget(i: i32, up: boolean): void { this.targets[i].enabled = up; }
}
