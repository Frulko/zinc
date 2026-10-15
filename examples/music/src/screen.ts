// The screen of a remote that never quits: after a delay without a touch it goes black and its backlight off, and the next touch wakes
// it. webOS turns the touch panel off with its own "display off" (docs/reports/hardware/webos-screen-power.md), so the system keeps
// the screen on (screenTimeout(false)) and zinc-helper switches the backlight (setBacklight). While the screen is on the CPU runs at full
// speed (setPerformance): webOS's governor would leave it at 192 MHz between touches. Elsewhere the window just goes black.
import { isWebOS, screenTimeout, serviceCall, setBacklight, setPerformance } from 'zinc:webos';

const KEEP_AWAKE_S = 600;   // com.palm.power caps an activity at 15 minutes: renewed every 10

export class Screen {
  asleep: boolean = false;
  idle: number = 0;
  /** Seconds without a touch before the screen goes off; 0 never. */
  delay: number = 120;
  private awakeFor: number = 0;

  constructor(delay: number) {
    this.delay = delay;
    if (isWebOS()) { screenTimeout(false); this.keepAwake(); }
    this.light(true);
  }
  /** A touch: true when it woke the screen (the touch is then used up). */
  touched(): boolean {
    this.idle = 0;
    if (!this.asleep) return false;
    this.asleep = false;
    this.light(true);
    return true;
  }
  /** Time passes; true when the screen just went off. Only while the program is in front: hidden, it wakes the screen and waits. */
  tick(dt: number): boolean {
    this.awakeFor += dt;
    if (this.awakeFor >= KEEP_AWAKE_S && isWebOS()) { this.awakeFor = 0; this.keepAwake(); }
    if (document.hidden) { this.idle = 0; if (this.asleep) { this.asleep = false; this.light(true); } return false; }
    if (this.asleep || this.delay <= 0) return false;
    this.idle += dt;
    if (this.idle < this.delay) return false;
    this.asleep = true;
    this.light(false);
    return true;
  }
  private keepAwake(): void {
    serviceCall('palm://com.palm.power/com/palm/power/activityStart', '{"id":"org.zinc.music.awake","duration_ms":900000}');
  }
  private light(on: boolean): void { setBacklight(on); setPerformance(on); }
}
