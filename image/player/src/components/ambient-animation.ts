// ============================================================================
// components/ambient-animation.ts — The slow animation behind the welcome
// ============================================================================
// Soft glowing orbs drifting on Lissajous curves (periods of 30 to 70 s) and a constellation of points joined by thin
// lines when they come close, in the manner of a p5.js sketch. It costs about 40 shapes a frame, runs at most at
// ANIMATION_FRAMES_PER_SECOND, and only while the home page shows (the page asks for its frames in onUpdate). Positions
// live in arrays made once; a step and a drawing allocate nothing. Its time is the sum of the frames' durations, so a
// deterministic run (ZINC_DETERMINISTIC) draws the same pictures.

import { rrect, shadow, stroke } from 'zinc:gfx';
import { COLOR_WHITE } from '../constants';

export const ANIMATION_FRAMES_PER_SECOND = 30;
const ORB_COUNT: i32 = 4;
const POINT_COUNT: i32 = 34;
/** Pixels per second of a point: slow on purpose. */
const POINT_SPEED = 9;
const LINK_DISTANCE = 120;

/** A small deterministic generator (an LCG): the same constellation at every start. */
let randomSeed: i32 = 1234567;
function nextRandom(): number {
  randomSeed = (Math.imul(randomSeed, 1103515245) + 12345) & 0x7fffffff;
  return randomSeed / 0x7fffffff;
}

export class AmbientAnimation {
  /** Seconds of animation shown so far. */
  time: number = 0;
  private sinceLastFrame: number = 0;
  private pointX: number[] = [];
  private pointY: number[] = [];
  private pointVelocityX: number[] = [];
  private pointVelocityY: number[] = [];
  private fieldWidth: number = 0;
  private fieldHeight: number = 0;
  /** The two ends of the link being drawn, reused for every link. */
  private linkPoints: number[] = [0, 0, 0, 0];

  constructor() {
    for (let index: i32 = 0; index < POINT_COUNT; index++) {
      const angle = nextRandom() * Math.PI * 2;
      const speed = POINT_SPEED * (0.4 + nextRandom() * 0.6);
      this.pointX.push(nextRandom());
      this.pointY.push(nextRandom());
      this.pointVelocityX.push(Math.cos(angle) * speed);
      this.pointVelocityY.push(Math.sin(angle) * speed);
    }
  }

  /** Advances by `deltaSeconds`; true when a new picture is due (at most ANIMATION_FRAMES_PER_SECOND). */
  step(deltaSeconds: number): boolean {
    this.sinceLastFrame += deltaSeconds;
    if (this.sinceLastFrame < 1 / ANIMATION_FRAMES_PER_SECOND) return false;
    const elapsed = Math.min(this.sinceLastFrame, 0.25);
    this.sinceLastFrame = 0;
    this.time += elapsed;
    if (this.fieldWidth > 0) {
      for (let index: i32 = 0; index < POINT_COUNT; index++) {
        // the positions are kept in pixels once the size is known; they bounce off the edges
        let x = this.pointX[index] + this.pointVelocityX[index] * elapsed;
        let y = this.pointY[index] + this.pointVelocityY[index] * elapsed;
        if (x < 0 || x > this.fieldWidth) {
          this.pointVelocityX[index] = -this.pointVelocityX[index];
          x = Math.max(0, Math.min(this.fieldWidth, x));
        }
        if (y < 0 || y > this.fieldHeight) {
          this.pointVelocityY[index] = -this.pointVelocityY[index];
          y = Math.max(0, Math.min(this.fieldHeight, y));
        }
        this.pointX[index] = x;
        this.pointY[index] = y;
      }
    }
    return true;
  }

  /** Draws over the page's gradient, in (0, 0, `width`, `height`). */
  draw(width: number, height: number, tintColor: u32): void {
    if (this.fieldWidth === 0) {
      // the first size: the points start spread over it (they were made in 0..1)
      for (let index: i32 = 0; index < POINT_COUNT; index++) {
        this.pointX[index] *= width;
        this.pointY[index] *= height;
      }
    }
    this.fieldWidth = width;
    this.fieldHeight = height;

    const radius = Math.min(width, height) * 0.32;
    for (let index: i32 = 0; index < ORB_COUNT; index++) {
      const phase = index * 1.7;
      const centerX = width * (0.5 + 0.42 * Math.sin(this.time * (0.09 + index * 0.023) + phase));
      const centerY = height * (0.5 + 0.38 * Math.cos(this.time * (0.07 + index * 0.017) + phase * 1.3));
      const orbRadius = radius * (0.75 + 0.25 * Math.sin(this.time * 0.2 + phase));
      shadow(centerX - orbRadius, centerY - orbRadius, orbRadius * 2, orbRadius * 2, orbRadius, orbRadius * 0.9,
        index % 2 === 0 ? COLOR_WHITE : tintColor, 56);
    }

    for (let first: i32 = 0; first < POINT_COUNT; first++) {
      const firstX = this.pointX[first];
      const firstY = this.pointY[first];
      for (let second: i32 = first + 1; second < POINT_COUNT; second++) {
        const deltaX = this.pointX[second] - firstX;
        const deltaY = this.pointY[second] - firstY;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared < LINK_DISTANCE * LINK_DISTANCE) {
          const closeness = 1 - Math.sqrt(distanceSquared) / LINK_DISTANCE;
          this.linkPoints[0] = firstX;
          this.linkPoints[1] = firstY;
          this.linkPoints[2] = this.pointX[second];
          this.linkPoints[3] = this.pointY[second];
          stroke(this.linkPoints, 1.2, COLOR_WHITE, Math.round(closeness * 110) as i32, false);
        }
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.8 + first);
      const dotSize = 3 + pulse * 2;
      rrect(firstX - dotSize / 2, firstY - dotSize / 2, dotSize, dotSize, dotSize / 2, COLOR_WHITE, 120 + Math.round(pulse * 80) as i32);
    }
  }
}
