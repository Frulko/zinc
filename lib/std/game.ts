// Caller-owned game objects: no event registration, atlas loading or global scene.
import { Animation, Frame } from 'zinc:sprite';
export { load as loadTileMap, TileMap, Level, Layer, MapObject, Properties } from 'zinc:tilemap';

export enum PlaybackState { Playing, Paused, Finished }

/** Animation time is milliseconds, as in zinc:sprite. update receives seconds, as in onFrame. */
export class Playback {
  animation: Animation;
  loop: boolean;
  private elapsed = 0;
  private phase: PlaybackState = PlaybackState.Playing;
  constructor(animation: Animation, loop: boolean = true) {
    this.animation = animation; this.loop = loop;
  }
  get state(): PlaybackState { return this.phase; }
  get milliseconds(): number { return this.elapsed; }
  private transition(next: PlaybackState): void {
    if (next === PlaybackState.Paused && this.phase !== PlaybackState.Playing ||
        next === PlaybackState.Finished && this.phase !== PlaybackState.Playing)
      throw new Error('zinc:game: invalid playback transition');
    this.phase = next;
  }
  pause(): void { this.transition(PlaybackState.Paused); }
  resume(): void {
    if (this.phase !== PlaybackState.Paused) throw new Error('zinc:game: playback is not paused');
    this.transition(PlaybackState.Playing);
  }
  restart(): void { this.elapsed = 0; this.transition(PlaybackState.Playing); }
  update(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('zinc:game: seconds must be finite and nonnegative');
    if (this.phase !== PlaybackState.Playing) return;
    const duration = this.animation.duration();
    const elapsed = this.elapsed + seconds * 1000;
    if (!Number.isFinite(elapsed)) throw new Error('zinc:game: elapsed time overflow');
    this.elapsed = elapsed;
    if (!this.loop && this.elapsed >= duration) {
      this.elapsed = duration; this.transition(PlaybackState.Finished);
    } else if (this.loop && duration > 0) this.elapsed %= duration;
  }
  frame(): Frame { return this.animation.frameAt(this.elapsed, this.loop); }
}

/** Position is the untrimmed image's top-left; all drawing goes through Frame.draw and its batcher. */
export class Sprite {
  frame: Frame;
  playback: Playback | null = null;
  x = 0; y = 0; width = 0; height = 0;
  alpha: i32 = 255; flags: i32 = 0; rotation = 0; tint: u32 = 0xffffff; blend: i32 = 0;
  constructor(frame: Frame) { this.frame = frame; }
  update(seconds: number): void {
    const playback = this.playback;
    if (playback !== null) { playback.update(seconds); this.frame = playback.frame(); }
  }
  draw(): void { this.frame.draw(this.x, this.y, this.width, this.height, this.alpha, this.flags, this.rotation, this.tint, this.blend); }
}

export class Scene {
  enter(): void {}
  update(seconds: number): void {}
  draw(): void {}
  leave(): void {}
}
export enum SceneState { Idle, Entering, Active, Updating, Drawing, Leaving }

/** Hooks cannot recursively drive the controller. Failed enter/leave leaves Idle; failed update/draw leaves Active. */
export class SceneController {
  private scene: Scene;
  private phase: SceneState = SceneState.Idle;
  constructor(scene: Scene) { this.scene = scene; }
  get state(): SceneState { return this.phase; }
  private transition(next: SceneState): void {
    const from = this.phase;
    const valid = from === SceneState.Idle && next === SceneState.Entering ||
      from === SceneState.Active && (next === SceneState.Updating || next === SceneState.Drawing || next === SceneState.Leaving) ||
      from === SceneState.Entering && (next === SceneState.Active || next === SceneState.Idle) ||
      (from === SceneState.Updating || from === SceneState.Drawing) && next === SceneState.Active ||
      from === SceneState.Leaving && next === SceneState.Idle;
    if (!valid) throw new Error('zinc:game: invalid scene transition');
    this.phase = next;
  }
  start(): void {
    this.transition(SceneState.Entering);
    try { this.scene.enter(); this.transition(SceneState.Active); }
    finally { if (this.phase === SceneState.Entering) this.transition(SceneState.Idle); }
  }
  update(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('zinc:game: seconds must be finite and nonnegative');
    this.transition(SceneState.Updating);
    try { this.scene.update(seconds); } finally { this.transition(SceneState.Active); }
  }
  draw(): void {
    this.transition(SceneState.Drawing);
    try { this.scene.draw(); } finally { this.transition(SceneState.Active); }
  }
  stop(): void {
    this.transition(SceneState.Leaving);
    try { this.scene.leave(); } finally { this.transition(SceneState.Idle); }
  }
}
