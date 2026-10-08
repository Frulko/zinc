// The level's maths, without hardware: tilts in, angles and the bubble's place out (what tests/level.test.ts checks).
export class Level {
  offsetX: number = 0;   // the tilt read when calibrated: that position reads level
  offsetY: number = 0;
  /** The current tilt (-1..1 on each axis, the sine of the angle) becomes level. */
  calibrate(tiltX: number, tiltY: number): void { this.offsetX = tiltX; this.offsetY = tiltY; }
  /** The angle in degrees around one axis, after calibration. */
  angle(tilt: number, offset: number): number {
    const s = Math.max(-1, Math.min(1, tilt - offset));
    return Math.atan2(s, Math.sqrt(1 - s * s)) * 180 / Math.PI;
  }
  angleX(tiltX: number): number { return this.angle(tiltX, this.offsetX); }
  angleY(tiltY: number): number { return this.angle(tiltY, this.offsetY); }
  /** The bubble's offset from the centre in px: it floats to the high side, `range` px at 30 degrees, never out of the ring. */
  bubble(angle: number, range: number): number { return -Math.max(-range, Math.min(range, angle / 30 * range)); }
  /** Level within half a degree on both axes. */
  isLevel(ax: number, ay: number): boolean { return Math.abs(ax) < 0.5 && Math.abs(ay) < 0.5; }
}
