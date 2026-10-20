import { rrect } from 'zinc:gfx';
import * as sys from 'zinc:sys';
/** A ball that bounces. */
class Ball {
  /** Position, in pixels. */
  x: number = 0;
  /**
   * Moves the ball.
   * @param dt seconds since the last frame
   * @param w the width of the field
   */
  step(dt: number, w: number): void { this.x += dt * w; }
}
// Twice a number.
function twice(n: number): number { return n * 2; }
const b = new Ball();
b.step(1, 2);
console.log(twice(3));
rrect(0, 0, 1, 1, 0, 0, 255);
console.log(sys.clock());
