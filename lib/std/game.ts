// Caller-owned game objects: no event registration, atlas loading or global scene.
import { Animation, Frame } from 'zinc:sprite';
import { keyCount, keyKind, keyName, KeyKind, pointerButtons, gamepadConnected, gamepadButtonValue, gamepadAxis, GamepadButton, GamepadAxis } from 'zinc:gfx';
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


function finite(value: number): void {
  if (!Number.isFinite(value)) throw new Error('zinc:game: expected finite number');
}
export enum ShakeState { Idle, Shaking }

/** Top-left world coordinates; shake is applied only to viewX/viewY. */
export class Camera {
  private px = 0; private py = 0;
  private vw = 1; private vh = 1;
  private bw = 0; private bh = 0;
  private bounded = false;
  private phase: ShakeState = ShakeState.Idle;
  private remaining = 0; private amplitude = 0;
  private sx = 0; private sy = 0;
  constructor(width: number, height: number) { this.viewport(width, height); }
  viewport(width: number, height: number): void {
    finite(width); finite(height);
    if (width <= 0 || height <= 0) throw new Error('zinc:game: positive viewport required');
    this.vw = width; this.vh = height; this.move(this.px, this.py);
  }
  get x(): number { return this.px; }
  get y(): number { return this.py; }
  get viewX(): number { const x = this.px + this.sx; finite(x); return x; }
  get viewY(): number { const y = this.py + this.sy; finite(y); return y; }
  get shakeState(): ShakeState { return this.phase; }
  bounds(width: number, height: number): void {
    finite(width); finite(height);
    if (width < 0 || height < 0) throw new Error('zinc:game: nonnegative bounds required');
    this.bw = width; this.bh = height; this.bounded = true;
    this.move(this.px, this.py);
  }
  move(x: number, y: number): void {
    finite(x); finite(y);
    this.px = this.bounded ? (this.bw < this.vw ? (this.bw - this.vw) / 2 : Math.max(0, Math.min(this.bw - this.vw, x))) : x;
    this.py = this.bounded ? (this.bh < this.vh ? (this.bh - this.vh) / 2 : Math.max(0, Math.min(this.bh - this.vh, y))) : y;
  }
  follow(x: number, y: number): void { this.move(x - this.vw / 2, y - this.vh / 2); }
  private transition(next: ShakeState): void {
    if (next !== ShakeState.Idle && !(next === ShakeState.Shaking && this.phase === ShakeState.Idle && this.remaining > 0 && this.amplitude > 0))
      throw new Error('zinc:game: invalid shake transition');
    this.phase = next;
    if (next === ShakeState.Idle) { this.remaining = 0; this.amplitude = 0; this.sx = 0; this.sy = 0; }
  }
  shake(seconds: number, amplitude: number): void {
    finite(seconds); finite(amplitude);
    if (seconds < 0 || amplitude < 0) throw new Error('zinc:game: nonnegative shake required');
    this.transition(ShakeState.Idle);
    if (seconds === 0 || amplitude === 0) return;
    this.remaining = seconds; this.amplitude = amplitude; this.transition(ShakeState.Shaking);
  }
  reset(): void { this.transition(ShakeState.Idle); }
  update(seconds: number): void {
    finite(seconds);
    if (seconds < 0) throw new Error('zinc:game: nonnegative time required');
    if (this.phase === ShakeState.Idle) return;
    this.remaining -= seconds;
    if (this.remaining <= 0) { this.transition(ShakeState.Idle); return; }
    this.sx = (Math.random() * 2 - 1) * this.amplitude;
    this.sy = (Math.random() * 2 - 1) * this.amplitude;
  }
}

class ActionBinding {
  kind: i32; key: string; pad: i32; code: i32; direction: number; deadzone: number;
  constructor(kind: i32, key: string, pad: i32, code: i32, direction: number, deadzone: number) {
    this.kind = kind; this.key = key; this.pad = pad; this.code = code; this.direction = direction; this.deadzone = deadzone;
  }
}
export class InputAction {
  private bindings: ActionBinding[] = [];
  private strength = 0; private press = false; private release = false;
  get value(): number { return this.strength; }
  get down(): boolean { return this.strength > 0; }
  get pressed(): boolean { return this.press; }
  get released(): boolean { return this.release; }
  key(name: string): InputAction {
    if (name.length === 0) throw new Error('zinc:game: key name required');
    this.bindings.push(new ActionBinding(0, name, 0, 0, 1, 0)); return this;
  }
  pointer(button: i32 = 0): InputAction {
    if (button < 0 || button > 4) throw new Error('zinc:game: pointer button must be 0..4');
    this.bindings.push(new ActionBinding(1, '', 0, button, 1, 0)); return this;
  }
  button(pad: i32, button: GamepadButton): InputAction {
    if (pad < 0 || button < 0 || button > 16) throw new Error('zinc:game: invalid gamepad button');
    this.bindings.push(new ActionBinding(2, '', pad, button as i32, 1, 0)); return this;
  }
  axis(pad: i32, axis: GamepadAxis, direction: number, deadzone: number = 0.2): InputAction {
    finite(direction); finite(deadzone);
    if (pad < 0 || axis < 0 || axis > 3 || (direction !== -1 && direction !== 1) || deadzone < 0 || deadzone >= 1)
      throw new Error('zinc:game: invalid gamepad axis binding');
    this.bindings.push(new ActionBinding(3, '', pad, axis as i32, direction, deadzone)); return this;
  }
  /** Used by InputActions once per frame, then after each key transition. */
  sample(keys: string[]): void {
    let value = 0;
    for (const b of this.bindings) {
      let v = 0;
      if (b.kind === 0) v = keys.indexOf(b.key) >= 0 ? 1 : 0;
      else if (b.kind === 1) v = (pointerButtons() & (1 << b.code)) !== 0 ? 1 : 0;
      else if (gamepadConnected(b.pad)) {
        if (b.kind === 2) v = gamepadButtonValue(b.pad, b.code as GamepadButton);
        else v = (gamepadAxis(b.pad, b.code as GamepadAxis) * b.direction - b.deadzone) / (1 - b.deadzone);
      }
      value = Math.max(value, Math.min(1, Math.max(0, v)));
    }
    if (value > 0 && this.strength === 0) this.press = true;
    if (value === 0 && this.strength > 0) this.release = true;
    this.strength = value;
  }
  clearEdges(): void { this.press = false; this.release = false; }
  reset(): void { this.strength = 0; this.clearEdges(); }
}

/** Call update once per frame before queries; reset on restart or caller-handled focus loss. */
export class InputActions {
  private keys: string[] = [];
  private actions: InputAction[] = [];
  add(): InputAction { const action = new InputAction(); this.actions.push(action); return action; }
  update(): void {
    for (const a of this.actions) { a.clearEdges(); a.sample(this.keys); }
    for (let i: i32 = 0; i < keyCount(); i++) {
      const kind = keyKind(i), name = keyName(i), at = this.keys.indexOf(name);
      if (kind === KeyKind.Down && at < 0) this.keys.push(name);
      else if (kind === KeyKind.Up && at >= 0) this.keys.splice(at, 1);
      else continue;
      for (const a of this.actions) a.sample(this.keys);
    }
  }
  reset(): void { this.keys = []; for (const a of this.actions) a.reset(); }
}
