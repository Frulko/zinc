// ============================================================================
// core/screen-power.ts — Sleep: the screen goes dark after a delay with no input, a touch wakes it
// ============================================================================
// The manner of examples/music-tree/src/core/screen-power.ts: a black veil fades in, then the light goes off (device('backlight'):
// the panel stays on and its touch answers, see plugins/display-fbdev). zinc:shell drops the input while it sleeps, so the touch that
// wakes the screen presses nothing, in the player or in the shown app. The frame loop (main.ts) draws nothing while it sleeps.

import { device } from 'zinc:sys';
import * as shell from 'zinc:shell';

function setLight(isOn: boolean): void {
  device('backlight', isOn ? '1' : '0');
}

export class ScreenPower {
  asleep: boolean = false;
  /** The black veil over the screen, 0 to 1, during a transition. */
  veil: number = 0;
  private idleSeconds: number = 0;
  private isSleepAsked: boolean = false;

  constructor() {
    setLight(true);   // a player that died in the dark, restarted by the session
  }

  /** Someone is there (an input, an app that shows up) or the screen must stay on. */
  stayAwake(): void {
    this.idleSeconds = 0;
    this.isSleepAsked = false;
    if (!this.asleep) return;
    this.asleep = false;
    shell.setAsleep(false);
    setLight(true);
  }

  /** The "Sleep now" button: whatever the delay, even "Never". */
  sleepNow(): void {
    this.isSleepAsked = true;
  }

  /** Advances the clock; true when the veil changed (a frame is due). `delaySeconds` 0: never, `fadeSeconds` 0: no transition. */
  tick(deltaSeconds: number, delaySeconds: number, fadeSeconds: number): boolean {
    if (this.asleep) return false;
    this.idleSeconds += deltaSeconds;
    const before = this.veil;
    const step = fadeSeconds > 0 ? deltaSeconds / fadeSeconds : 1;
    if (this.isSleepAsked || (delaySeconds > 0 && this.idleSeconds >= delaySeconds)) {
      // the light goes off the frame after the veil is whole: that frame is drawn, and the screen wakes on black
      if (before >= 1) {
        this.asleep = true;
        this.isSleepAsked = false;
        shell.setAsleep(true);
        setLight(false);
        return false;
      }
      this.veil = Math.min(1, before + step);
    } else {
      this.veil = Math.max(0, before - step);
    }
    return this.veil !== before;
  }
}

export const screenPower = new ScreenPower();
