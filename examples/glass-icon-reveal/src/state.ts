import { uiState } from 'zinc:stage';

export const DURATION = 3;
export class RevealState {
  time: number = 0;
  playing: boolean = true;
  dark: boolean = false;

  seek(time: number): void {
    this.time = Math.max(0, Math.min(DURATION, time));
    this.playing = false;
    uiState.dirty = true;
  }
  replay(): void {
    this.time = 0;
    this.playing = true;
    uiState.dirty = true;
  }
  toggle(): void {
    if (this.time >= DURATION) this.replay();
    else this.playing = !this.playing;
    uiState.dirty = true;
  }
  theme(): void {
    this.dark = !this.dark;
    uiState.dirty = true;
  }
  step(dt: number): void {
    if (!this.playing) return;
    this.time = Math.min(DURATION, this.time + dt);
    if (this.time >= DURATION) this.playing = false;
    uiState.dirty = true;
  }
}

// Upstream's critically damped spring, shared by the optical and fallback paths.
export function spring(time: number, response: number): number {
  const t = Math.max(0, time) * 2 * Math.PI / response;
  return 1 - Math.exp(-t) * (1 + t);
}

export function smooth(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const state = new RevealState();
