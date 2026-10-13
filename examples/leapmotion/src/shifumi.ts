import { Hand, Vec3, Tracker } from 'zinc:leapmotion';
export const ROCK = 0, PAPER = 1, SCISSORS = 2, UNKNOWN = -1;
export const GESTURES = ['Pierre', 'Feuille', 'Ciseaux'];
export function gesture(h: Hand | null): number {
  if (h === null) return UNKNOWN;
  const e = h.extended;
  if (!e[1] && !e[2] && !e[3] && !e[4] && h.grab > 0.65) return ROCK;
  if (e[1] && e[2] && e[3] && e[4]) return PAPER;
  if (e[1] && e[2] && !e[3] && !e[4]) return SCISSORS;
  return UNKNOWN;
}
/** -1 draw, 0 first player, 1 second player. Only called for two valid gestures. */
export function winner(a: number, b: number): number { return a === b ? -1 : (a - b + 3) % 3 === 1 ? 0 : 1; }
export class Duel {
  devices: number[] = [-1, -1];
  hands: (Hand | null)[] = [null, null];
  revealed: Hand[] = [];
  choices: number[] = [UNKNOWN, UNKNOWN];
  scores: number[] = [0, 0];
  stable: number[] = [0, 0];
  phase: number = 0; // waiting, countdown, reveal
  remaining: number = 0;
  result: string = 'Deux capteurs, deux joueurs.';
  round: number = 0;
  private last: number[] = [UNKNOWN, UNKNOWN];
  private identities: number[] = [-1, -1];
  private simulated: boolean = false;
  reset(): void { this.scores = [0, 0]; this.round = 0; this.phase = 0; this.result = 'Prêts pour un duel ?'; }
  start(): void {
    if (this.hands[0] === null || this.hands[1] === null) { this.result = 'Une main sur chaque capteur.'; return; }
    this.phase = 1; this.remaining = 3; this.revealed = []; this.stable = [0, 0]; this.choices = [UNKNOWN, UNKNOWN];
    this.result = 'Pierre… feuille… ciseaux !';
  }
  update(tracker: Tracker, dt: number): void {
    if (tracker.simulated !== this.simulated) { this.devices = [-1, -1]; this.revealed = []; this.phase = 0; this.simulated = tracker.simulated; }
    // Keep assignments when a device leaves: player two must never silently become player one.
    for (const d of tracker.devices) {
      if (this.devices[0] === d.id || this.devices[1] === d.id) continue;
      if (this.devices[0] < 0) this.devices[0] = d.id;
      else if (this.devices[1] < 0) this.devices[1] = d.id;
    }
    this.hands = [null, null];
    for (let p = 0; p < 2; p++) {
      for (const d of tracker.devices) if (d.id === this.devices[p]) {
        for (const h of d.hands) if (h.id === this.identities[p]) this.hands[p] = h;
        if (this.hands[p] === null && d.hands.length > 0) this.hands[p] = d.hands[0];
      }
      const h = this.hands[p], id = h === null ? -1 : h.id, choice = gesture(h);
      if (id !== this.identities[p] || choice !== this.last[p] || choice === UNKNOWN) this.stable[p] = 0;
      else this.stable[p] += dt;
      this.identities[p] = id; this.last[p] = choice;
    }
    if (this.phase !== 1) return;
    if (this.hands[0] === null || this.hands[1] === null) {
      this.phase = 0; this.result = 'Suivi perdu. Replacez les mains.'; return;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining > 0) return;
    this.phase = 2;
    if (this.stable[0] < 0.18 || this.stable[1] < 0.18 || this.last[0] < 0 || this.last[1] < 0) {
      this.result = 'Geste incertain. On recommence !'; return;
    }
    this.choices = [this.last[0], this.last[1]]; this.round++;
    this.revealed = [];
    for (const h of this.hands) if (h !== null) {
      const copy = new Hand(); copy.id = h.id; copy.deviceId = h.deviceId; copy.right = h.right;
      copy.palm = new Vec3(h.palm.x, h.palm.y, h.palm.z); copy.wrist = new Vec3(h.wrist.x, h.wrist.y, h.wrist.z); copy.elbow = new Vec3(h.elbow.x, h.elbow.y, h.elbow.z);
      for (let j = 0; j < 25; j++) copy.joints[j] = new Vec3(h.joints[j].x, h.joints[j].y, h.joints[j].z);
      this.revealed.push(copy);
    }
    const w = winner(this.choices[0], this.choices[1]);
    if (w < 0) this.result = 'Égalité !';
    else { this.scores[w]++; this.result = `Joueur ${w + 1} gagne !`; }
  }
  reassign(): void { this.devices = [-1, -1]; this.revealed = []; this.phase = 0; this.result = 'Capteurs réattribués.'; }
}
