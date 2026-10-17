// The demo player (`--autopilot`): holds the d-pad as a player would to follow a route down the course, riding the left
// shuttle, and prints what it holds as ZINC_INPUT lines, so a run of the game can be replayed (tests/data/marble/win.input
// was made so). It reads the course, never changes it.
import { Course, Phase } from './course';

/** A point to roll to; `ride` >= 0: wait for that shuttle, ride it from its first end to its second, then go on. */
class Waypoint {
  x: number; z: number; ride: i32;
  constructor(x: number, z: number, ride: i32) { this.x = x; this.z = z; this.ride = ride; }
}

const ROUTE: Waypoint[] = [
  new Waypoint(11.5, 19.5, -1), new Waypoint(11.0, 17.5, -1), new Waypoint(11.0, 16.2, -1), new Waypoint(7.2, 15.0, -1),
  new Waypoint(6.5, 13.4, -1), new Waypoint(6.5, 10.6, -1), new Waypoint(4.6, 9.5, -1), new Waypoint(5.0, 8.5, -1),
  new Waypoint(5.0, 7.0, 0), new Waypoint(5.0, 3.2, -1), new Waypoint(8.0, 1.6, -1), new Waypoint(11.5, 1.5, -1),
];
const NAMES = ['Up', 'Down', 'Left', 'Right'];

export class Autopilot {
  held: boolean[] = [false, false, false, false];   // up, down, left, right
  start = false;
  private next: i32 = 0;
  private riding = false;
  private lives: i32 = -1;
  private print: boolean;
  constructor(print: boolean = true) { this.print = print; }

  /** The buttons to hold this frame; `frame` numbers the ZINC_INPUT lines it prints. */
  drive(course: Course, frame: i32): void {
    const was = this.held.slice(0), wasStart = this.start;
    if (course.lives !== this.lives) { this.lives = course.lives; this.next = 0; this.riding = false; }   // back at the start
    this.start = course.phase === Phase.Title && frame === 20;
    if (course.phase === Phase.Play && this.next < ROUTE.length) this.steer(course);
    else for (let k = 0; k < 4; k++) this.held[k] = false;
    if (!this.print) return;
    for (let k = 0; k < 4; k++) if (this.held[k] !== was[k]) console.log(`${frame} ${this.held[k] ? 'pad' : 'padup'} ${NAMES[k]}`);
    if (this.start !== wasStart) console.log(`${frame} ${this.start ? 'pad' : 'padup'} Start`);
  }

  private steer(course: Course): void {
    const b = course.ball, w = ROUTE[this.next];
    let tx = w.x, tz = w.z, vx = 0, vz = 0;
    if (w.ride >= 0) {
      const p = course.platforms[w.ride];
      // board while the shuttle is at its first end or coming back to it; wait half a cell back from the edge before that
      const atA = Math.abs(p.x - p.ax) + Math.abs(p.z - p.az) < 0.2 && p.dx * (p.ax - p.bx) + p.dz * (p.az - p.bz) >= 0;
      const nearB = Math.abs(p.x - p.bx) + Math.abs(p.z - p.bz) < 0.3;
      if (!this.riding && !atA) { tx = w.x; tz = w.z + 1.6; }
      else {
        this.riding = true;
        tx = p.x; tz = p.z; vx = p.dx * 120; vz = p.dz * 120;
        if (nearB) { this.next++; this.riding = false; }   // the far end: roll off
      }
    } else if (Math.abs(b.x - w.x) < 0.45 && Math.abs(b.z - w.z) < 0.45) this.next++;
    // the speed wanted: towards the target, at most 2 cells a second, plus the shuttle's; the d-pad leans towards it
    let dx = (tx - b.x) * 1.6, dz = (tz - b.z) * 1.6;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 2) { dx *= 2 / d; dz *= 2 / d; }
    const ex = dx + vx - b.vx, ez = dz + vz - b.vz;
    this.held[0] = ez < -0.25; this.held[1] = ez > 0.25;
    this.held[2] = ex < -0.25; this.held[3] = ex > 0.25;
  }
}
