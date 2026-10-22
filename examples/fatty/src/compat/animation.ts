import { uiState } from 'zinc:stage';
import { Sprite, Image } from './display';
import { Event } from './events';
import { Texture } from './textures';

export class MovieClip extends Image {
  loop = true;
  currentFrame = 0;
  private elapsed = 0;
  private playing = true;
  constructor(private frames: Texture[], private fps = 12) { super(frames[0]); }
  play(): void { this.playing = true; }
  stop(): void { this.playing = false; this.elapsed = 0; this.currentFrame = 0; this.texture = this.frames[0]; }
  advanceTime(dt: number): boolean {
    if (!this.playing) return false;
    this.elapsed += dt;
    while (this.elapsed + 1e-9 >= 1/this.fps && this.playing) {
      this.elapsed -= 1/this.fps;
      this.currentFrame++;
      if (this.currentFrame === this.frames.length) {
        this.currentFrame = this.loop ? 0 : this.frames.length-1;
        if (!this.loop) this.playing = false;
        this.dispatchEvent(new Event(Event.COMPLETE));
      }
      this.texture = this.frames[this.currentFrame];
    }
    return true;
  }
}
export class Tween {
  onComplete: (() => void) | null = null;
  private elapsed = 0;
  private from: number;
  private to: number;
  constructor(public target: Sprite, private duration: number) { this.from = target.alpha; this.to = target.alpha; }
  fadeTo(alpha: number): void { this.to = alpha; }
  advanceTime(dt: number): boolean {
    this.elapsed += dt;
    const progress = Math.min(1, this.elapsed/this.duration);
    this.target.alpha = this.from+(this.to-this.from)*progress;
    if (progress >= 1 && this.onComplete) this.onComplete();
    return progress < 1;
  }
}
class Animation {
  mounted = false;
  constructor(public item: MovieClip | Tween, public owner: Sprite) {}
}
class Delay {
  mounted = false;
  constructor(public call: () => void, public remaining: number, public owner: Sprite) {}
}
export class Juggler {
  private animations: Animation[] = [];
  private delays: Delay[] = [];
  add(item: MovieClip | Tween, owner?: Sprite): void {
    if (this.animations.some(a => a.item === item)) return;
    this.animations.push(new Animation(item, owner || (item instanceof Tween ? item.target : item)));
  }
  delayCall(call: () => void, seconds: number, owner: Sprite): void {
    this.delays.push(new Delay(call, seconds, owner));
  }
  advanceTime(dt: number): void {
    for (let i = this.animations.length-1; i >= 0; i--) {
      const a = this.animations[i];
      if (a.mounted && !a.owner.isOnStage) { this.animations.splice(i,1); continue; }
      if (!a.owner.isOnStage) continue;
      a.mounted = true;
      const running = a.item.advanceTime(dt);
      if (running || a.item instanceof Tween) uiState.dirty = true;
      if (a.item instanceof Tween && !running) this.animations.splice(i,1);
    }
    // Remove a call before invoking it: its callback may schedule the next second or switch pages.
    for (let i = this.delays.length-1; i >= 0; i--) {
      const delay = this.delays[i];
      if (delay.mounted && !delay.owner.isOnStage) { this.delays.splice(i,1); continue; }
      if (!delay.owner.isOnStage) continue;
      delay.mounted = true;
      delay.remaining -= dt;
      if (delay.remaining > 1e-9) continue;
      this.delays.splice(i,1);
      delay.call();
    }
  }
  get size(): number { return this.animations.length+this.delays.length; }
}
