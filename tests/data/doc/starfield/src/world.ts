// The world of the game: stars that drift and a ship that collects them.
// Everything here runs the same on the interpreter, the AOT and QuickJS.

/** A point on the screen, in pixels. */
export interface Point { x: f64; y: f64 }

/** What a star is worth when the ship takes it. */
export type Reward = 'small' | 'big';

/** The number of stars a new world starts with. */
export const STARS = 64;

/**
 * The game world.
 *
 * @example
 * const w = new World(320, 240);
 * w.step(1 / 60);
 */
export class World {
  /** The width of the playfield. */
  readonly width: f64;
  readonly height: f64;
  /** Where the ship is. */
  ship: Point = { x: 0, y: 0 };
  private stars: Point[] = [];

  constructor(width: f64, height: f64) { this.width = width; this.height = height; }

  /**
   * Moves everything by one time step.
   * @param dt the time step, in seconds
   * @returns the number of stars taken during the step
   */
  step(dt: f64): i32 { return dt > 0 ? this.stars.length : 1; }

  /** The score so far. */
  get score(): i32 { return 0; }
}

/** The distance between two points. */
export function distance(a: Point, b: Point): f64 {
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

function hidden(): void {}
hidden();
