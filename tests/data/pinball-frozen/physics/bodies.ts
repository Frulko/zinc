// The things a ball meets. Units are table inches (x to the right, y down the table towards the player, z up from
// the playfield); a real table is about 20 x 42 in. Small units keep every product inside the Q20.12 range of the
// fixed-point profile (a squared distance on this table is < 2100).

/** Surface response: restitution (bounciness), Coulomb friction, and an active kick in in/s along the normal,
 *  fired when the ball arrives faster than `kickMin` (a slingshot's switch needs a real hit, a bumper's skirt not). */
export class Material {
  constructor(public restitution: number, public friction: number, public kick: number, public kickMin: number) {}
}

export const METAL = new Material(0.45, 0.12, 0, 0);
export const RUBBER = new Material(0.78, 0.45, 0, 0);
export const PLASTIC = new Material(0.35, 0.2, 0, 0);
export const WIRE = new Material(0.25, 0.08, 0, 0);
export const FLIPPER_RUBBER = new Material(0.58, 0.55, 0, 0);
export const BUMPER_SKIRT = new Material(0.6, 0.2, 52, 1);
export const SLING_RUBBER = new Material(0.7, 0.4, 38, 7);
export const PLUNGER_TIP = new Material(0.05, 0.3, 0, 0);
export const TARGET_FACE = new Material(0.35, 0.25, 0, 0);

/** Collider kinds; the game reacts to hits through World.events with the collider's kind and tag. */
export const K_WALL: i32 = 0, K_POST: i32 = 1, K_BUMPER: i32 = 2, K_SLING: i32 = 3, K_TARGET: i32 = 4, K_GATE: i32 = 5,
  K_FLIPPER: i32 = 6, K_PLUNGER: i32 = 7;

/** A wall segment a -> b (a capsule of radius `r` around it). The normal (ty, -tx) is on the left of a -> b as seen
 *  on screen (y down): for a -> b pointing right it points up the table. One-sided segments collide on that side. */
export class Segment {
  ax: number; ay: number; bx: number; by: number;
  tx: number; ty: number; nx: number; ny: number; len: number;
  enabled: boolean = true;
  oneSided: boolean = false;
  /** Surface velocity (the plunger), in/s. */
  svx: number = 0;
  svy: number = 0;
  constructor(ax: number, ay: number, bx: number, by: number, public r: number, public mat: Material, public kind: i32, public tag: i32) {
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    this.tx = 0; this.ty = 0; this.nx = 0; this.ny = 0; this.len = 0;
    this.place(ax, ay, bx, by);
  }
  /** Moves the segment (drop targets reset, the plunger slides). */
  place(ax: number, ay: number, bx: number, by: number): void {
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    this.len = len;
    if (len > 1e-6) { this.tx = dx / len; this.ty = dy / len; }
    this.nx = this.ty; this.ny = -this.tx;
  }
}

export class Circle {
  enabled: boolean = true;
  constructor(public x: number, public y: number, public r: number, public mat: Material, public kind: i32, public tag: i32) {}
}

/** A line the ball crosses: rollover switches, the spinner, ramp entrances (portals change the ball's layer). */
export class Sensor {
  ax: number; ay: number; tx: number; ty: number; nx: number; ny: number; len: number;
  /** Portal: a ball on `layer` crossing towards `dir` (+1 normal side, -1 the other, 0 either) moves to `toLayer`
   *  (-1: not a portal). Switches have toLayer -1 and report every crossing. */
  toLayer: i32 = -1;
  dir: i32 = 0;
  constructor(ax: number, ay: number, bx: number, by: number, public layer: i32, public tag: i32) {
    this.ax = ax; this.ay = ay;
    const dx = bx - ax, dy = by - ay;
    this.len = Math.sqrt(dx * dx + dy * dy);
    this.tx = dx / this.len; this.ty = dy / this.len;
    this.nx = this.ty; this.ny = -this.tx;
  }
}

/** Kicker hole: a slow enough ball whose centre comes within `r` falls in and is held until the game ejects it. */
export class Hole {
  constructor(public x: number, public y: number, public r: number, public captureSpeed: number, public tag: i32) {}
}

export const BALL_R: number = 0.53;

export class Ball {
  x: number = 0; y: number = 0; z: number = 0;
  vx: number = 0; vy: number = 0;
  /** Spin about the vertical axis (rad/s, counter-clockwise on screen): friction at contacts trades it with the
   *  tangential velocity, so a ball rolling along a flipper leaves it with side spin. */
  w: number = 0;
  /** 0: playfield; n > 0: ramp n - 1 of the world. */
  layer: i32 = 0;
  active: boolean = false;
  /** In a kicker hole: not simulated until ejected. */
  held: boolean = false;
  /** Hint for the ramp height lookup: the centreline segment found last. */
  rampSeg: i32 = 0;
  constructor(public id: i32) {}
}

/** An elevated path (plastic ramp or wire habitrail) with its own walls: a separate collision layer. Its height
 *  along a centreline sets the ball's z, and the slope adds a pull downhill. */
export class Ramp {
  xs: number[] = [];
  ys: number[] = [];
  zs: number[] = [];
  walls: Segment[] = [];
  constructor(public name: string, public wire: boolean) {}
  point(x: number, y: number, z: number): Ramp { this.xs.push(x); this.ys.push(y); this.zs.push(z); return this; }
}
