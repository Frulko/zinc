// Looking around something with a finger: two angles a drag turns, with a little inertia when the finger lets go, a third freedom a pinch
// changes (the field of view of a panorama, the distance of an object), and a glide to a given view. The panorama and the 3D object
// viewer are both this; each says what the angles mean.

export class Orbit {
  /** Degrees. */
  yaw = 0;
  pitch = 0;
  /** What a pinch changes, within [nearest, farthest]. */
  reach = 1;
  protected nearest = 0;
  protected farthest = 1;
  protected steepest = 85;
  /** Inertia after a drag, in degrees per second. */
  private vyaw = 0;
  private vpitch = 0;
  /** The view a glide goes to, where it started, and how far along it is. */
  private gliding = false;
  private toYaw = 0;
  private toPitch = 0;
  private toReach = 0;
  private fromYaw = 0;
  private fromPitch = 0;
  private fromReach = 0;
  private glided = 0;

  /** Goes to a view at once and stops. */
  place(yaw: number, pitch: number, reach: number): void {
    this.yaw = yaw; this.pitch = pitch; this.reach = reach; this.vyaw = 0; this.vpitch = 0; this.gliding = false;
    this.clamp();
  }

  /** A finger turned the view by these angles over `dt` seconds. */
  turn(dyaw: number, dpitch: number, dt: number): void {
    this.yaw += dyaw; this.pitch += dpitch;
    this.gliding = false;
    if (dt > 0) { this.vyaw = this.vyaw * 0.5 + (dyaw / dt) * 0.5; this.vpitch = this.vpitch * 0.5 + (dpitch / dt) * 0.5; }
    this.clamp();
  }
  /** The finger stayed still: no inertia when it lets go. */
  hold(): void { this.vyaw = 0; this.vpitch = 0; }

  /** A pinch or a wheel step: `k` above 1 comes closer. */
  closer(k: number): void {
    if (k > 0) this.reach = Math.min(this.farthest, Math.max(this.nearest, this.reach / k));
  }

  /** Glides to a view in `seconds`, the short way round. */
  glide(yaw: number, pitch: number, reach: number, seconds: number): void {
    this.fromYaw = this.yaw; this.fromPitch = this.pitch; this.fromReach = this.reach;
    let target = yaw;
    while (target - this.yaw > 180) target -= 360;
    while (target - this.yaw < -180) target += 360;
    this.toYaw = target; this.toPitch = pitch; this.toReach = reach;
    this.gliding = true;
    this.glided = seconds > 0 ? 0 : 1;
    this.vyaw = 0; this.vpitch = 0;
  }

  /** Whether the view still moves by itself (inertia or a glide). */
  moving(): boolean { return this.gliding || this.vyaw !== 0 || this.vpitch !== 0; }

  step(dt: number, dragging: boolean): void {
    if (this.gliding) {
      this.glided = Math.min(1, this.glided + dt / 0.6);
      const t = this.glided * this.glided * (3 - 2 * this.glided);
      this.yaw = this.fromYaw + (this.toYaw - this.fromYaw) * t;
      this.pitch = this.fromPitch + (this.toPitch - this.fromPitch) * t;
      this.reach = this.fromReach + (this.toReach - this.fromReach) * t;
      if (this.glided >= 1) this.gliding = false;
    } else if (!dragging) {
      this.yaw += this.vyaw * dt; this.pitch += this.vpitch * dt;
      const decay = Math.exp(-4 * dt);
      this.vyaw *= decay; this.vpitch *= decay;
      if (Math.abs(this.vyaw) < 0.5 && Math.abs(this.vpitch) < 0.5) { this.vyaw = 0; this.vpitch = 0; }
    }
    this.clamp();
  }

  private clamp(): void {
    while (this.yaw > 180) this.yaw -= 360;
    while (this.yaw <= -180) this.yaw += 360;
    this.pitch = Math.min(this.steepest, Math.max(-this.steepest, this.pitch));
    this.reach = Math.min(this.farthest, Math.max(this.nearest, this.reach));
  }
}
