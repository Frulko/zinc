/** Real skinned glTF animation, using ozz-animation behind native handles. Desktop Mac baseline. */
import { Node, Mesh, Material, mat4, mat4Multiply, mat4Compose } from 'zinc:3d';
import R from '../3d/native/render3d.spec';
import A from './native/animation.spec';
import { readBytes, exists } from 'zinc:assets';
import * as fs from 'zinc:fs';

export interface AnimationEvent { clip: string; time: number; name: string; }

export class SkinnedModel extends Node {
  readonly handle: i32;
  readonly clips: string[];
  readonly durations: number[] = [];
  readonly vertices: i32;
  readonly jointCount: i32;
  readonly signature: string;
  private disposed = false;
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly socketMatrix: number[] = mat4();
  constructor(file: string) {
    super(null, null);
    const h = A.open(exists(file) ? readBytes(file) : fs.readBytes(file));
    if (h < 0) throw new Error('animation: ' + file + ': ' + A.error());
    this.handle = h; this.vertices = A.vertices(h); this.jointCount = A.joints(h);
    this.signature = A.signature(h);
    this.clips = A.clips(h).split('|');
    for (let i = 0; i < this.clips.length; i++) this.durations.push(A.duration(h, i));
    for (let i = 0; i < this.vertices * 3; i++) { this.positions.push(0); this.normals.push(0); }
    try {
      if (!A.geometry(h, this.positions, this.normals)) throw new Error('animation: cannot read bind geometry');
      const colors: u32[] = [];
      for (const color of A.colors(h)) colors.push(color as u32);
      this.mesh = new Mesh(this.positions, A.indices(h), this.normals, [], colors);
      this.material = new Material(A.color(h)); this.material.doubleSided = true;
      this.material.vertexColors = colors.length > 0;
    } catch (e) { A.close(h); throw e; }
  }
  sample(a: i32, timeA: number, b: i32 = -1, timeB: number = 0, weight: number = 0): void {
    if (this.disposed) throw new Error('animation: disposed model');
    if (!A.sample(this.handle, a, timeA, b, timeB, weight, this.positions, this.normals)) throw new Error('animation: ' + A.error());
    if (this.mesh !== null && !R.meshDeform(this.mesh.handle, this.positions, this.normals)) throw new Error('animation: mesh deformation is unavailable on this renderer');
  }
  /** Joint model matrix, including bind hierarchy, for attachment sockets. Reuses the caller's buffer. */
  joint(name: string, out: number[]): boolean { return !this.disposed && A.joint(this.handle, name, out); }
  dispose(): void { if (this.disposed) return; this.disposed = true; if (this.mesh !== null) this.mesh.dispose(); this.mesh = null; A.close(this.handle); }
}

/** In-place locomotion: gameplay owns actor motion; animation never applies it twice. */
export class AnimationPlayer {
  model: SkinnedModel;
  clip: i32 = 0;
  time = 0;
  speed = 1;
  loop = true;
  paused = false;
  blend = 1;
  events: AnimationEvent[];
  onEvent: (name: string) => void = (name: string): void => {};
  private previous: i32 = -1;
  private previousTime = 0;
  private fade = 0;
  private elapsed = 0;
  constructor(model: SkinnedModel, events: AnimationEvent[] = []) {
    this.model = model; this.events = events;
    for (const e of events) {
      const clip = model.clips.indexOf(e.clip);
      if (clip < 0 || !Number.isFinite(e.time) || e.time < 0 || e.time >= model.durations[clip] || e.name.length === 0) throw new Error('animation: invalid event metadata ' + e.name);
    }
    this.events.sort((a: AnimationEvent, b: AnimationEvent) => a.time - b.time);
  }
  play(name: string, fadeSeconds: number = .2): void {
    const next = this.model.clips.indexOf(name);
    if (next < 0 || !Number.isFinite(fadeSeconds) || fadeSeconds < 0) throw new Error('animation: invalid clip/fade ' + name);
    if (next === this.clip) return;
    this.previous = this.clip; this.previousTime = this.time;
    this.clip = next; this.time = 0; this.fade = fadeSeconds; this.elapsed = 0; this.blend = fadeSeconds > 0 ? 0 : 1;
    this.pose();
  }
  /** Pose preview only: seeking never dispatches gameplay events. */
  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) throw new Error('animation: invalid seek');
    this.time = Math.max(0, Math.min(this.model.durations[this.clip], seconds));
    this.previous = -1; this.blend = 1; this.pose();
  }
  update(dt: number): void { if (!this.paused) this.step(dt); }
  /** Advance one preview interval even when paused. Events are emitted only by forward clock advancement. */
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(this.speed) || this.speed < 0) throw new Error('animation: time/speed must be finite and nonnegative');
    const duration = this.model.durations[this.clip], delta = dt * this.speed;
    if (delta > duration * 100) throw new Error('animation: step exceeds 100 loops');
    const old = this.time, end = this.loop ? old + delta : Math.min(duration, old + delta);
    const name = this.model.clips[this.clip];
    // Only the destination clip emits events during a transition. Interval (old,end] avoids duplicate boundaries.
    for (let cycle = 0; cycle <= (this.loop ? Math.floor(end / duration) : 0); cycle++) {
      for (const event of this.events) {
        const at = event.time + cycle * duration;
        if (event.clip === name && at > old && at <= end) this.onEvent(event.name);
      }
    }
    this.time = this.loop ? end % duration : end;
    if (this.previous >= 0) {
      const oldDuration = this.model.durations[this.previous];
      this.previousTime = this.loop ? (this.previousTime + delta) % oldDuration : Math.min(oldDuration, this.previousTime + delta);
      this.elapsed += dt; this.blend = this.fade === 0 ? 1 : Math.min(1, this.elapsed / this.fade);
      if (this.blend >= 1) this.previous = -1;
    }
    this.pose();
  }
  pose(): void {
    if (this.previous >= 0) this.model.sample(this.previous, this.previousTime, this.clip, this.time, this.blend);
    else this.model.sample(this.clip, this.time);
  }
  /** Caller prepares a validated replacement first. Same joint topology retains normalized clip phase. */
  replace(model: SkinnedModel): boolean {
    const name = this.model.clips[this.clip], next = model.clips.indexOf(name);
    const compatible = this.model.signature === model.signature && next >= 0;
    const phase = this.time / this.model.durations[this.clip];
    this.model = model; this.clip = compatible ? next : 0;
    this.time = compatible ? phase * model.durations[this.clip] : 0;
    this.previous = -1; this.blend = 1; this.pose();
    return compatible;
  }
}

export function animationVersion(): string { return A.version(); }

/** Attachment geometry follows the actual sampled joint matrix, including during blends and seeks. */
export class JointSocket extends Node {
  model: SkinnedModel;
  jointName: string;
  private bone = mat4();
  private local = mat4();
  private combined = mat4();
  private socketStamp: i32 = 0;
  constructor(model: SkinnedModel, jointName: string) { super(null, null); this.model = model; this.jointName = jointName; }
  override draw(parent: number[], parentStamp: i32 = 0): void {
    if (!this.visible || !this.model.joint(this.jointName, this.bone)) return;
    mat4Compose(this.local, this.position, this.rotation, this.scale);
    mat4Multiply(this.combined, this.bone, this.local); mat4Multiply(this.world, parent, this.combined);
    this.socketStamp++;
    for (const child of this.children) child.draw(this.world, this.socketStamp);
  }
}
