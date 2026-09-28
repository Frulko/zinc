// Pseudo-3D: a pinhole camera behind the lower end of the table, looking up the table and down at it, like a player
// standing at the cabinet. Straight lines stay straight, far things shrink, and heights (ramps, bumper caps, the
// ball on a ramp) rise on screen, so the whole table is ordinary 2D polygons in screen space.
export class Camera {
  /** Eye position and the view basis: right is +x, forward f and up u lie in the y/z plane. */
  ex: number = 0; ey: number = 0; ez: number = 0;
  fy: number = 0; fz: number = 0;
  uy: number = 0; uz: number = 0;
  focal: number = 1;
  ox: number = 0;
  oy: number = 0;
  /** Results of project(): screen point and pixels per inch at that depth. */
  x: number = 0;
  y: number = 0;
  k: number = 1;

  /** pitch: angle between the line of sight and the table (radians); dist: eye to target (in). */
  aim(targetX: number, targetY: number, pitch: number, dist: number): void {
    const c = Math.cos(pitch), s = Math.sin(pitch);
    this.fy = -c; this.fz = -s;
    this.uy = -s; this.uz = c;
    this.ex = targetX; this.ey = targetY + dist * c; this.ez = dist * s;
  }

  project(x: number, y: number, z: number): void {
    const qx = x - this.ex, qy = y - this.ey, qz = z - this.ez;
    const depth = qy * this.fy + qz * this.fz;
    const inv = this.focal / (depth > 0.1 ? depth : 0.1);
    this.x = this.ox + qx * inv;
    this.y = this.oy - (qy * this.uy + qz * this.uz) * inv;
    this.k = inv;
  }

  /** Scales and centres the projection so the box (x0..x1, y0..y1) of the table fits the screen rectangle. */
  fit(x0: number, y0: number, x1: number, y1: number, zTop: number, sx: number, sy: number, sw: number, sh: number): void {
    this.focal = 1; this.ox = 0; this.oy = 0;
    let minX: number = 1e9, maxX: number = -1e9, minY: number = 1e9, maxY: number = -1e9;
    for (let i: i32 = 0; i < 8; i++) {
      this.project(i % 2 === 0 ? x0 : x1, (i >> 1) % 2 === 0 ? y0 : y1, i < 4 ? 0 : zTop);
      minX = Math.min(minX, this.x); maxX = Math.max(maxX, this.x);
      minY = Math.min(minY, this.y); maxY = Math.max(maxY, this.y);
    }
    const f = Math.min(sw / (maxX - minX), sh / (maxY - minY));
    this.focal = f;
    this.ox = sx + (sw - (maxX - minX) * f) / 2 - minX * f;
    this.oy = sy + (sh - (maxY - minY) * f) / 2 - minY * f;
  }

  /** The same view drawn into an image: pixel scale `s`, the image's top-left at screen (x0, y0). */
  scaledInto(s: number, x0: number, y0: number): Camera {
    const c = new Camera();
    c.ex = this.ex; c.ey = this.ey; c.ez = this.ez; c.fy = this.fy; c.fz = this.fz; c.uy = this.uy; c.uz = this.uz;
    c.focal = this.focal * s;
    c.ox = (this.ox - x0) * s;
    c.oy = (this.oy - y0) * s;
    return c;
  }
}
