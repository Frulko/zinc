// The screen of a remote that never quits: after a delay without a touch it goes black and its backlight off, and the next touch wakes
// it. webOS turns the touch panel off with its own "display off" (docs/reports/hardware/webos-screen-power.md), so the system keeps
// the screen on (screenTimeout(false)) and zinc-helper switches the backlight (setBacklight). While the screen is on the CPU runs at full
// speed (setPerformance): webOS's governor would leave it at 192 MHz between touches. Elsewhere the window just goes black.
// On the clock slide (StandBy, iOS's manner) the screen goes off after STANDBY_OFF_S, then wakes every GLANCE_EVERY_S for GLANCE_S: the time
// shows on a wall without lighting the room all night. ZINC_MUSIC_STANDBY="off,every,glance[,fade]" (seconds) shortens it for the tests.
import { isWebOS, screenTimeout, serviceCall, setBacklight, setPerformance } from 'zinc:webos';
import { env } from 'zinc:sys';

const KEEP_AWAKE_S = 600;   // com.palm.power caps an activity at 15 minutes: renewed every 10
const STANDBY = (env('ZINC_MUSIC_STANDBY') !== '' ? env('ZINC_MUSIC_STANDBY') : '120,300,10').split(',');
const STANDBY_OFF_S = parseFloat(STANDBY[0]), GLANCE_EVERY_S = parseFloat(STANDBY[1]), GLANCE_S = parseFloat(STANDBY[2]);
// the screen fades to black before it goes off, and back in when it wakes (owner 2026-10-17: less abrupt); a 4th number of ZINC_MUSIC_STANDBY sets it
const FADE_S = STANDBY.length > 3 ? parseFloat(STANDBY[3]) : 0.6;

export class Screen {
  asleep: boolean = false;
  idle: number = 0;
  /** Seconds without a touch before the screen goes off; 0 never. */
  delay: number = 120;
  /** The clock slide is shown: off after STANDBY_OFF_S whatever the delay (unless never), and a glance every GLANCE_EVERY_S while off. */
  standby: boolean = false;
  /** Lit for notifications only (owner 2026-10-17): the backlight on over a black screen while they play, off again after; still asleep for the rest. */
  peeking: boolean = false;
  /** 0..1: the black the program draws over everything as the screen fades out before going off and in after waking. */
  veil: number = 0;
  private dimming: number = 0;   // seconds left of the fade out, 0 when none
  private awakeFor: number = 0;
  private t: number = 0;
  private nextGlance: number = 0;   // on t's clock; 0 until the screen goes off after a touch

  constructor(delay: number) {
    this.delay = delay;
    if (isWebOS()) { screenTimeout(false); this.keepAwake(); }
    this.light(true);
  }
  /** A touch: true when it woke the screen (the touch is then used up). */
  touched(): boolean {
    this.idle = 0;
    this.nextGlance = 0;
    this.dimming = 0;   // a touch during the fade out: it fades back in
    if (this.peeking && this.asleep) { this.peeking = false; this.asleep = false; return false; }   // awake for good; the touch goes on to the notification
    if (!this.asleep) return false;
    this.asleep = false;
    this.light(true);
    return true;
  }
  /** Lights the screen for at least `seconds` without a touch (a notification, a glance); true when it was off. A touch then keeps it on as usual. */
  wake(seconds: number): boolean {
    this.idle = Math.min(this.idle, this.limit() - seconds);
    this.dimming = 0;
    if (!this.asleep) return false;
    this.asleep = false;
    this.light(true);
    return true;
  }
  /** A notification on a sleeping screen: the backlight only, the program draws black and the notification; true when it was off. */
  peek(): boolean {
    if (!this.asleep) return false;
    if (!this.peeking) { this.peeking = true; this.light(true); }
    return true;
  }
  /** The notifications are over: back off at once if nobody touched. */
  endPeek(): void {
    if (!this.peeking) return;
    this.peeking = false;
    if (this.asleep) this.light(false);
  }
  private limit(): number { return this.standby ? STANDBY_OFF_S : this.delay; }
  /** Time passes; true when the screen just went off. Only while the program is in front: hidden, it wakes the screen and waits. */
  tick(dt: number): boolean {
    this.awakeFor += dt; this.t += dt;
    if (this.awakeFor >= KEEP_AWAKE_S && isWebOS()) { this.awakeFor = 0; this.keepAwake(); }
    if (document.hidden) { this.idle = 0; if (this.asleep) { this.asleep = false; this.light(true); } return false; }
    if (this.delay <= 0) return false;
    if (this.asleep) {   // a glance every GLANCE_EVERY_S from the first off, whatever the glances in between lasted
      if (this.standby && !this.peeking && this.t >= this.nextGlance) { this.nextGlance += GLANCE_EVERY_S; this.wake(GLANCE_S); }
      return false;
    }
    if (this.dimming === 0 && this.veil > 0) this.veil = FADE_S > 0 ? Math.max(0, this.veil - dt / FADE_S) : 0;   // waking: fade in
    this.idle += dt;
    if (this.idle < this.limit()) return false;
    if (FADE_S > 0) {
      if (this.dimming === 0) this.dimming = FADE_S;
      this.dimming = Math.max(0, this.dimming - dt);
      this.veil = Math.max(this.veil, 1 - this.dimming / FADE_S);
      if (this.dimming > 0) return false;
    }
    this.veil = 1;
    this.asleep = true;
    if (this.nextGlance === 0) this.nextGlance = this.t + GLANCE_EVERY_S;
    this.light(false);
    return true;
  }
  private keepAwake(): void {
    serviceCall('palm://com.palm.power/com/palm/power/activityStart', '{"id":"org.zinc.music.awake","duration_ms":900000}');
  }
  private light(on: boolean): void { setBacklight(on); setPerformance(on); }
}
