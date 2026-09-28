// Persistence through zinc:storage (a file on hosts): the high score table and the settings, as short strings.
// ZINC_DEMO runs never write, so screenshots and the benchmark leave the player's records alone.
import { get, set } from 'zinc:storage';

export class HighScore {
  constructor(public name: string, public score: i32) {}
}

export const TABLE_SIZE: i32 = 5;
const DEFAULTS: HighScore[] = [
  new HighScore('ACE', 400000), new HighScore('ZIN', 250000), new HighScore('NOV', 150000),
  new HighScore('ORB', 80000), new HighScore('RKT', 40000),
];

export class Settings {
  sound: boolean = true;
  /** 0 low, 1 normal, 2 high: how quickly nudges add up to a tilt. */
  tilt: i32 = 1;
}

export class Store {
  scores: HighScore[] = [];
  settings = new Settings();
  constructor(public readonly persist: boolean) {
    this.load();
  }

  private load(): void {
    this.scores = [];
    const raw = this.persist ? get('pinball.scores') : '';
    for (const item of raw.split(';')) {
      const p = item.split(':');
      if (p.length === 2 && p[0].length > 0) this.scores.push(new HighScore(p[0], parseInt(p[1])));
    }
    if (this.scores.length === 0) for (const d of DEFAULTS) this.scores.push(new HighScore(d.name, d.score));
    const s = this.persist ? get('pinball.settings') : '';
    const f = s.split(',');
    if (f.length === 2) { this.settings.sound = f[0] === '1'; this.settings.tilt = Math.max(0, Math.min(2, parseInt(f[1]))); }
  }

  saveSettings(): void {
    if (this.persist) set('pinball.settings', `${this.settings.sound ? 1 : 0},${this.settings.tilt}`);
  }

  /** Rank a score would get in the table (TABLE_SIZE: not good enough). */
  placeOf(score: i32): i32 {
    let i: i32 = 0;
    while (i < this.scores.length && this.scores[i].score >= score) i++;
    return i;
  }

  insert(name: string, score: i32): void {
    const at = this.placeOf(score);
    if (at >= TABLE_SIZE) return;
    this.scores.push(new HighScore(name, score));
    for (let i: i32 = this.scores.length - 1; i > at; i--) { const t = this.scores[i]; this.scores[i] = this.scores[i - 1]; this.scores[i - 1] = t; }
    while (this.scores.length > TABLE_SIZE) this.scores.pop();
    if (this.persist) set('pinball.scores', this.scores.map((h: HighScore): string => `${h.name}:${h.score}`).join(';'));
  }
}
