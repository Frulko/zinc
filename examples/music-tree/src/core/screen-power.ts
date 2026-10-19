// ============================================================================
// core/screen-power.ts — Gestion de la veille, du rétroéclairage et de StandBy
// ============================================================================
// Sur une télécommande murale qui ne quitte jamais :
// - Après un délai sans contact (`delay`), l'écran s'assombrit progressivement
//   (`veil` de 0 à 1) puis coupe son rétroéclairage (`setBacklight(false)`).
// - Le prochain contact rallume l'écran et consomme le toucher pour éviter de
//   déclencher un bouton à l'aveugle.
// - Sur l'écran d'horloge (mode StandBy inspiré d'iOS), l'écran s'éteint après
//   2 minutes mais se rallume discrètement pendant 10 secondes toutes les 5 minutes.
// - Lorsqu'une notification arrive pendant le sommeil (`peek()`), seul le
//   rétroéclairage s'allume sur fond noir le temps de jouer l'animation StandBy.

import { isWebOS, screenTimeout, serviceCall, setBacklight, setPerformance } from 'zinc:webos';
import { env } from 'zinc:sys';

const KEEP_AWAKE_RENEW_SECONDS = 600; // com.palm.power limite une activité à 15 min : renouvelée toutes les 10 min

const STANDBY_ENV_PARTS = (
  env('ZINC_MUSIC_STANDBY') !== '' ? env('ZINC_MUSIC_STANDBY') : '120,300,10'
).split(',');

const STANDBY_OFF_SECONDS = parseFloat(STANDBY_ENV_PARTS[0]);
const GLANCE_INTERVAL_SECONDS = parseFloat(STANDBY_ENV_PARTS[1]);
const GLANCE_DURATION_SECONDS = parseFloat(STANDBY_ENV_PARTS[2]);
const FADE_DURATION_SECONDS = STANDBY_ENV_PARTS.length > 3 ? parseFloat(STANDBY_ENV_PARTS[3]) : 0.6;

export class ScreenPowerManager {
  /** Indique si l'écran est actuellement en sommeil. */
  asleep: boolean = false;

  /** Secondes écoulées depuis le dernier contact. */
  idleSeconds: number = 0;

  /** Délai avant extinction (en secondes ; 0 = jamais). */
  delaySeconds: number = 120;

  /** Indique si le carrousel est sur le cadran d'horloge (mode StandBy actif). */
  standbyMode: boolean = false;

  /** Indique si l'écran est entrouvert uniquement pour afficher une notification sur fond noir. */
  peeking: boolean = false;

  /** Opacité du voile noir (0..1) pendant la transition d'extinction ou de réveil. */
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
   * Signale un contact de l'utilisateur sur l'écran.
   * Retourne `true` si ce contact a servi à réveiller l'écran (l'événement tactile doit alors être ignoré).
   */
  onUserTouch(): boolean {
    this.idleSeconds = 0;
    this.nextGlanceTimestamp = 0;
    this.remainingFadeOutSeconds = 0;

    // Si l'écran affichait une notification en mode "peek", on se réveille complètement
    // mais on laisse le toucher se propager jusqu'à la notification.
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
   * Allume l'écran pendant au moins `minimumSeconds` sans contact humain (ex: notification ou coup d'œil StandBy).
   * Retourne `true` si l'écran était éteint.
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
   * Entrouvre le rétroéclairage sur un écran endormi pour laisser jouer une notification sur fond noir.
   * Retourne `true` si l'écran était endormi.
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
   * Referme le rétroéclairage dès que la file de notifications est terminée si personne n'a touché l'écran.
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
   * Fait avancer l'horloge de veille d'un pas `deltaSeconds`.
   * Retourne `true` à la frame exacte où l'écran bascule en sommeil.
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
      if (this.standbyMode && !this.peeking && this.totalElapsedSeconds >= this.nextGlanceTimestamp) {
        this.nextGlanceTimestamp += GLANCE_INTERVAL_SECONDS;
        this.wakeForDuration(GLANCE_DURATION_SECONDS);
      }
      return false;
    }

    // Fondu d'ouverture après le réveil
    if (this.remainingFadeOutSeconds === 0 && this.veilOpacity > 0) {
      this.veilOpacity =
        FADE_DURATION_SECONDS > 0 ? Math.max(0, this.veilOpacity - deltaSeconds / FADE_DURATION_SECONDS) : 0;
    }

    this.idleSeconds += deltaSeconds;
    if (this.idleSeconds < this.effectiveIdleLimit()) return false;

    // Fondu de fermeture avant l'extinction matérielle
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
