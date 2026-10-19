// ============================================================================
// core/screen-power.ts — Sleep, backlight and StandBy handling
// ============================================================================
// On a wall remote that is never taken away:
// - After a delay with no touch (`delay`), the screen dims gradually
//   (`veil` from 0 to 1) then turns its backlight off (`setBacklight(false)`).
// - The next touch wakes the screen and swallows the tap to avoid
//   pressing a button blindly.
// - On the clock screen (StandBy mode inspired by iOS), the screen turns off after
//   2 minutes but quietly wakes for 10 seconds every 5 minutes.
// - When a notification arrives during sleep (`peek()`), only the
//   backlight comes on over black for the time of the StandBy animation.

import { isWebOS, screenTimeout, serviceCall, setBacklight, setPerformance } from 'zinc:webos';
import { env } from 'zinc:sys';

const KEEP_AWAKE_RENEW_SECONDS = 600; // com.palm.power limits an activity to 15 min: renewed every 10 min

const STANDBY_ENV_PARTS = (
  env('ZINC_MUSIC_STANDBY') !== '' ? env('ZINC_MUSIC_STANDBY') : '120,300,10'
).split(',');

const STANDBY_OFF_SECONDS = parseFloat(STANDBY_ENV_PARTS[0]);
const GLANCE_INTERVAL_SECONDS = parseFloat(STANDBY_ENV_PARTS[1]);
const GLANCE_DURATION_SECONDS = parseFloat(STANDBY_ENV_PARTS[2]);
const FADE_DURATION_SECONDS = STANDBY_ENV_PARTS.length > 3 ? parseFloat(STANDBY_ENV_PARTS[3]) : 0.6;

export class ScreenPowerManager {
  /** Tells whether the screen is asleep. */
  asleep: boolean = false;

  /** Seconds elapsed since the last touch. */
  idleSeconds: number = 0;

  /** Delay before turning off (in seconds; 0 = never). */
  delaySeconds: number = 120;

  /** Tells whether the carousel is on the clock face (StandBy mode active). */
  standbyMode: boolean = false;

  /** The StandBy glances (a wake every few minutes while asleep on the clock); the settings can turn them off. */
  glancesEnabled: boolean = true;

  /** Tells whether the screen is ajar only to show a notification over black. */
  peeking: boolean = false;

  /** Opacity of the black veil (0..1) during the turn-off or wake transition. */
  veilOpacity: number = 0;

  private remainingFadeOutSeconds: number = 0;
  private awakeActivityTimer: number = 0;
  private totalElapsedSeconds: number = 0;
  private nextGlanceTimestamp: number = 0;

  constructor(initialDelaySeconds: number) {
    this.delaySeconds = initialDelaySeconds;
    if (isWebOS()) {
      screenTimeout(false);
      this.renewWebOSPowerActivity();
    }
    this.setHardwareLight(true);
  }

  /**
   * Reports a user touch on the screen.
   * Returns `true` if this touch was used to wake the screen (the touch event must then be ignored).
   */
  onUserTouch(): boolean {
    this.idleSeconds = 0;
    this.nextGlanceTimestamp = 0;
    this.remainingFadeOutSeconds = 0;

    // If the screen was showing a notification in "peek" mode, wake up fully
    // but let the touch go through to the notification.
    if (this.peeking && this.asleep) {
      this.peeking = false;
      this.asleep = false;
      return false;
    }

    if (!this.asleep) return false;

    this.asleep = false;
    this.setHardwareLight(true);
    return true;
  }

  /**
   * Turns the screen on for at least `minimumSeconds` with no human touch (e.g. a notification or a StandBy glance).
   * Returns `true` if the screen was off.
   */
  wakeForDuration(minimumSeconds: number): boolean {
    this.idleSeconds = Math.min(this.idleSeconds, this.effectiveIdleLimit() - minimumSeconds);
    this.remainingFadeOutSeconds = 0;
    if (!this.asleep) return false;

    this.asleep = false;
    this.setHardwareLight(true);
    return true;
  }

  /**
   * Half-opens the backlight on a sleeping screen to let a notification play over black.
   * Returns `true` if the screen was asleep.
   */
  beginNotificationPeek(): boolean {
    if (!this.asleep) return false;
    if (!this.peeking) {
      this.peeking = true;
      this.setHardwareLight(true);
    }
    return true;
  }

  /**
   * Closes the backlight as soon as the notification queue is done if nobody touched the screen.
   */
  endNotificationPeek(): void {
    if (!this.peeking) return;
    this.peeking = false;
    if (this.asleep) {
      this.setHardwareLight(false);
    }
  }

  private effectiveIdleLimit(): number {
    return this.standbyMode ? STANDBY_OFF_SECONDS : this.delaySeconds;
  }

  /**
   * Advances the sleep clock by a step of `deltaSeconds`.
   * Returns `true` on the exact frame the screen falls asleep.
   */
  tick(deltaSeconds: number): boolean {
    this.awakeActivityTimer += deltaSeconds;
    this.totalElapsedSeconds += deltaSeconds;

    if (this.awakeActivityTimer >= KEEP_AWAKE_RENEW_SECONDS && isWebOS()) {
      this.awakeActivityTimer = 0;
      this.renewWebOSPowerActivity();
    }

    if (document.hidden) {
      this.idleSeconds = 0;
      if (this.asleep) {
        this.asleep = false;
        this.setHardwareLight(true);
      }
      return false;
    }

    if (this.delaySeconds <= 0) return false;

    if (this.asleep) {
      if (
        this.standbyMode &&
        this.glancesEnabled &&
        !this.peeking &&
        this.totalElapsedSeconds >= this.nextGlanceTimestamp
      ) {
        this.nextGlanceTimestamp += GLANCE_INTERVAL_SECONDS;
        this.wakeForDuration(GLANCE_DURATION_SECONDS);
      }
      return false;
    }

    // Fade-in after waking
    if (this.remainingFadeOutSeconds === 0 && this.veilOpacity > 0) {
      this.veilOpacity =
        FADE_DURATION_SECONDS > 0 ? Math.max(0, this.veilOpacity - deltaSeconds / FADE_DURATION_SECONDS) : 0;
    }

    this.idleSeconds += deltaSeconds;
    if (this.idleSeconds < this.effectiveIdleLimit()) return false;

    // Fade-out before the hardware turn-off
    if (FADE_DURATION_SECONDS > 0) {
      if (this.remainingFadeOutSeconds === 0) {
        this.remainingFadeOutSeconds = FADE_DURATION_SECONDS;
      }
      this.remainingFadeOutSeconds = Math.max(0, this.remainingFadeOutSeconds - deltaSeconds);
      this.veilOpacity = Math.max(
        this.veilOpacity,
        1 - this.remainingFadeOutSeconds / FADE_DURATION_SECONDS
      );
      if (this.remainingFadeOutSeconds > 0) return false;
    }

    this.veilOpacity = 1;
    this.asleep = true;
    if (this.nextGlanceTimestamp === 0) {
      this.nextGlanceTimestamp = this.totalElapsedSeconds + GLANCE_INTERVAL_SECONDS;
    }
    this.setHardwareLight(false);
    return true;
  }

  private renewWebOSPowerActivity(): void {
    serviceCall(
      'palm://com.palm.power/com/palm/power/activityStart',
      '{"id":"org.zinc.music.awake","duration_ms":900000}'
    );
  }

  private setHardwareLight(isOn: boolean): void {
    setBacklight(isOn);
    setPerformance(isOn);
  }
}
