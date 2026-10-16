// Sound and video without zinc:audio and zinc:video (the browser build, phones, boards): the player works (play, pause, seek, progress on the app's
// clock) and says it is silent; the video page shows its poster. media-native.ts builds the real players on these classes.

/** A music track: an 8 s loop, with a position that follows the clock while it plays. */
export class Track {
  readonly title: string = 'Zinc Lullaby (generated)';
  readonly duration: number = 8;
  protected at: number = 0;        // seconds, while paused
  protected since: number = -1;    // Date.now() when play started, -1 when paused
  available(): string { return 'Silent here: no audio on this target'; }
  get playing(): boolean { return this.since >= 0; }
  get position(): number { return this.since < 0 ? this.at : (this.at + (Date.now() - this.since) / 1000) % this.duration; }
  play(): void { if (this.since < 0) { this.since = Date.now(); this.start(this.at); } }
  pause(): void { if (this.since >= 0) { this.at = this.position; this.since = -1; this.stop(); } }
  seek(s: number): void { const was = this.playing; this.pause(); this.at = Math.max(0, Math.min(this.duration - 0.01, s)); if (was) this.play(); }
  protected start(from: number): void {}
  protected stop(): void {}
}

/** A short clip: `image` is a runtime image to draw, -1 when there is none (then the screen draws a poster). */
export class Clip {
  available(): string { return 'No video decoder on this target: the poster stands in'; }
  get image(): number { return -1; }
  get position(): number { return 0; }
  get duration(): number { return 0; }
  get playing(): boolean { return false; }
  play(): void {}
  pause(on: boolean): void {}
  close(): void {}
}
export function openClip(): Clip { return new Clip(); }
