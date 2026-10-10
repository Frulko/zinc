// The rules engine: it is told what happens on the table (an element's event, or one of the game's own) and keeps the
// score, the bonus, the lights, the mission, the rank, the locks and the jackpot, by reading the table's `rules`.
// It has no rule of its own, draws nothing and moves nothing: what it wants done to the table (raise targets, serve
// balls) it leaves in lists that the game (game.ts) carries out.
import { TableDef, RulesDef, ConditionDef, ActionDef, StepDef } from './format/table';

/** Where an event comes from: an element with its group and the light that goes with it, or the game. */
export class Source {
  id: string; group: string;
  /** The index of its own light, -1 for none. */
  light: i32;
  constructor(id: string, group: string, light: i32) { this.id = id; this.group = group; this.light = light; }
}
export const GAME = new Source('game', '', -1);

const OFF = 0, ON = 1, BLINK = 2;

export class Rules {
  private t: TableDef;
  private r: RulesDef;
  /** Seconds of play, advanced by the game. */
  now: number = 0;
  score: number = 0;
  bonus: number = 0;
  multiplier: i32 = 1;
  /** The ball being played, from 1. */
  ball: i32 = 0;
  extraBalls: i32 = 0;
  rank: i32 = 0;
  mission: i32 = 0;
  step: i32 = 0;
  stepCount: i32 = 0;
  multiball: boolean = false;
  locks: i32 = 0;
  jackpot: number = 0;
  tilted: boolean = false;
  ballSaveUntil: number = 0;
  message: string = '';
  messageUntil: number = 0;
  /** One line per event, as the scripted games compare them. */
  log: string[] = [];
  // ---- what the game must carry out
  /** Drop targets to raise (indices of `targets`). */
  raise: i32[] = [];
  /** A rule or the locks asked for multiball. */
  wantMultiball: boolean = false;
  /** Sounds to play (names of `sounds`), for the game's audio. */
  sounds: string[] = [];

  private counters: Map<string, number> = new Map<string, number>();
  private lightIds: string[] = [];
  private lightGroups: string[] = [];
  private lightState: i32[] = [];
  private flashUntil: number[] = [];
  /** Which drop targets are down (by index of `targets`). */
  targetDown: boolean[] = [];
  private depth: i32 = 0;

  constructor(t: TableDef) {
    this.t = t;
    this.r = t.rules;
    for (const l of t.lights) { this.lightIds.push(l.id); this.lightGroups.push(l.group); this.lightState.push(OFF); this.flashUntil.push(0); }
    for (const g of t.targets) this.targetDown.push(false);
    this.jackpot = this.r.multiball.jackpot;
  }

  /** A new game. */
  start(): void {
    this.score = 0; this.bonus = 0; this.multiplier = 1; this.ball = 0; this.extraBalls = 0; this.rank = 0;
    this.mission = 0; this.step = 0; this.stepCount = 0; this.multiball = false; this.locks = 0; this.tilted = false;
    this.jackpot = this.r.multiball.jackpot;
    this.counters = new Map<string, number>();
    for (let i = 0; i < this.lightState.length; i++) { this.lightState[i] = OFF; this.flashUntil[i] = 0; }
    for (let i = 0; i < this.targetDown.length; i++) { if (this.targetDown[i]) this.raise.push(i); this.targetDown[i] = false; }
    this.message = ''; this.messageUntil = 0;
    this.emit(GAME, 'start');
  }

  // ---------------------------------------------------------------- names
  lightIndex(id: string): i32 { return this.lightIds.indexOf(id); }
  /** The lights a name stands for: one light, or every light of a group. */
  private lightsOf(name: string, from: Source): i32[] {
    const out: i32[] = [];
    if (name === 'self') { if (from.light >= 0) out.push(from.light); return out; }
    const one = this.lightIds.indexOf(name);
    if (one >= 0) { out.push(one); return out; }
    for (let i = 0; i < this.lightGroups.length; i++) if (this.lightGroups[i] === name) out.push(i);
    return out;
  }
  private targetsOf(name: string): i32[] {
    const out: i32[] = [];
    for (let i = 0; i < this.t.targets.length; i++) if (this.t.targets[i].id === name || this.t.targets[i].group === name) out.push(i);
    return out;
  }
  private matches(on: string, from: Source): boolean { return on === from.id || (from.group !== '' && on === from.group); }
  counter(name: string): number { const v = this.counters.get(name); return v === undefined ? 0 : v; }

  // ---------------------------------------------------------------- events
  /** Something happened. Runs every rule that listens, then the mission and the jackpot. */
  emit(from: Source, event: string): void {
    if (this.depth > 6) return;   // rules that set each other off without end
    this.depth++;
    const before = this.score, line = this.log.length;
    this.log.push('');   // its place, before the events it sets off
    for (const w of this.r.when) {
      if (w.event !== event || !this.matches(w.on, from)) continue;
      let holds = true;
      for (const c of w.if) if (!this.test(c, from)) { holds = false; break; }
      if (!holds) continue;
      for (const a of w.do) this.act(a, from);
    }
    if (this.multiball && event === this.r.multiball.jackpotEvent && this.matches(this.r.multiball.jackpotOn, from)) {
      this.score += this.jackpot;
      this.jackpot += this.r.multiball.jackpotStep;
      this.emit(GAME, 'jackpot');
    }
    this.countStep(from, event, false);
    this.depth--;
    this.log[line] = `${this.now.toFixed(3)} ${from.id} ${event}${this.score !== before ? ` +${this.score - before} = ${this.score}` : ''}`;
  }

  private test(c: ConditionDef, from: Source): boolean {
    if (c.test === 'lights') {
      const want = c.is === 'on';
      const ls = this.lightsOf(c.target, from);
      if (ls.length === 0) return false;
      for (const i of ls) if ((this.lightState[i] !== OFF) !== want) return false;
      return true;
    }
    if (c.test === 'targets') {
      const want = c.is === 'down';
      const ts = this.targetsOf(c.target);
      if (ts.length === 0) return false;
      for (const i of ts) if (this.targetDown[i] !== want) return false;
      return true;
    }
    if (c.test === 'mode') return (c.target === 'multiball') === this.multiball;
    if (c.test === 'mission') return this.r.missions.length > 0 && this.r.missions[this.mission].id === c.target;
    const v = c.test === 'counter' ? this.counter(c.target) : c.test === 'rank' ? this.rank : this.ballsInPlay;
    return c.is === 'atLeast' ? v >= c.value : c.is === 'below' ? v < c.value : v === c.value;
  }
  /** Set by the game: the balls on the table. */
  ballsInPlay: i32 = 0;

  private act(a: ActionDef, from: Source): void {
    if (a.do === 'score') this.score += a.value * (this.multiball ? this.r.multiball.scoreMultiplier : 1);
    else if (a.do === 'bonus') this.bonus += a.value;
    else if (a.do === 'multiplier') this.multiplier = Math.min(this.r.multiplierMax, this.multiplier + Math.round(a.value));
    else if (a.do === 'light') {
      for (const i of this.lightsOf(a.target, from)) {
        if (a.mode === 'flash') this.flashUntil[i] = this.now + (a.seconds > 0 ? a.seconds : 0.3);
        else this.lightState[i] = a.mode === 'on' ? ON : a.mode === 'off' ? OFF : a.mode === 'blink' ? BLINK : this.lightState[i] === OFF ? ON : OFF;
      }
    } else if (a.do === 'count') this.counters.set(a.target, a.mode === 'set' ? a.value : this.counter(a.target) + a.value);
    else if (a.do === 'reset') { for (const i of this.targetsOf(a.target)) if (this.targetDown[i]) { this.targetDown[i] = false; this.raise.push(i); } }
    else if (a.do === 'say') this.say(a.target);
    else if (a.do === 'sound') this.sounds.push(a.target);
    else if (a.do === 'rotate') {
      const ls = this.lightsOf(a.target, from), n = ls.length;
      if (n < 2) return;
      const by: i32 = ((Math.round(a.value) % n) + n) % n;
      const was: i32[] = [];
      for (const i of ls) was.push(this.lightState[i]);
      for (let k = 0; k < n; k++) this.lightState[ls[(k + by) % n]] = was[k];
    } else if (a.do === 'award') {
      if (a.mode === 'extraBall') { if (this.extraBalls < this.r.extraBalls) { this.extraBalls++; this.say('EXTRA BALL'); this.emit(GAME, 'extraBall'); } }
      else if (a.mode === 'ballSave') this.ballSaveUntil = Math.max(this.ballSaveUntil, this.now + a.seconds);
      else if (a.mode === 'lock') {
        this.locks++;
        if (this.r.multiball.locks > 0 && this.locks >= this.r.multiball.locks) this.wantMultiball = true;
        else this.say(`LOCK ${this.locks}`);
      } else if (a.mode === 'multiball') this.wantMultiball = true;
      else if (a.mode === 'mission') this.countStep(from, '', true);
    }
  }

  say(text: string): void { this.message = text; this.messageUntil = this.now + 2.5; }
  /** A line of the log that is no event (a ball served, a bonus counted). */
  note(text: string): void { this.log.push(`${this.now.toFixed(3)} ${text}`); }

  // ---------------------------------------------------------------- missions and ranks
  currentStep(): StepDef | null {
    const ms = this.r.missions;
    return ms.length === 0 ? null : ms[this.mission].steps[this.step];
  }
  missionName(): string { return this.r.missions.length === 0 ? '' : this.r.missions[this.mission].name; }
  rankName(): string { return this.r.ranks.length === 0 ? '' : this.r.ranks[Math.min(this.rank, this.r.ranks.length - 1)]; }

  private countStep(from: Source, event: string, forced: boolean): void {
    const s = this.currentStep();
    if (s === null) return;
    if (!forced && (s.event !== event || !this.matches(s.on, from))) return;
    this.stepCount++;
    if (this.stepCount < s.count) return;
    const m = this.r.missions[this.mission];
    this.stepCount = 0;
    this.step++;
    if (this.step < m.steps.length) return;
    // the mission is done: its award times the rank, a promotion, the next mission
    this.step = 0;
    this.score += m.award * (this.rank + 1);
    this.say(`${m.name.toUpperCase()} DONE`);
    this.mission = (this.mission + 1) % this.r.missions.length;
    this.emit(GAME, 'missionDone');
    if (this.rank < this.r.ranks.length - 1) { this.rank++; this.emit(GAME, 'rankUp'); }
  }

  // ---------------------------------------------------------------- the ball
  /** A ball starts: the bonus of the last one is gone. */
  ballStart(): void {
    this.bonus = 0; this.multiplier = 1; this.tilted = false;
    this.emit(GAME, 'ballStart');
  }
  /** The end of a ball: its bonus, unless the table was tilted. Returns what was added. */
  collectBonus(): number {
    const add = this.tilted ? 0 : this.bonus * this.multiplier;
    this.score += add;
    this.bonus = 0;
    return add;
  }
  ballSaved(): boolean { return this.now < this.ballSaveUntil; }
  startMultiball(): void {
    this.multiball = true;
    this.locks = 0;
    this.jackpot = this.r.multiball.jackpot;
    this.ballSaveUntil = Math.max(this.ballSaveUntil, this.now + this.r.multiball.ballSave);
    this.emit(GAME, 'multiballStart');
  }
  endMultiball(): void { this.multiball = false; this.emit(GAME, 'multiballEnd'); }

  // ---------------------------------------------------------------- what shows
  /** Whether light `i` shines now: what the rules set, a flash, and what the game's own state shows through the
   *  lights the table gives it (the step to do, the rank, the locks, the ball save). */
  lit(i: i32): boolean {
    const blink = Math.floor(this.now * 5) % 2 === 0;
    const s = this.currentStep();
    if (s !== null && s.light !== '' && (this.lightIds[i] === s.light || this.lightGroups[i] === s.light)) return this.lightState[i] === ON ? true : blink;
    if (this.r.ballSaveLight !== '' && this.lightIds[i] === this.r.ballSaveLight) return this.ballSaved() ? blink : this.extraBalls > 0;
    if (this.r.rankLights !== '' && this.lightGroups[i] === this.r.rankLights) return this.place(i, this.r.rankLights) < this.rank;
    if (this.r.multiball.lockLights !== '' && this.lightGroups[i] === this.r.multiball.lockLights) return this.multiball ? blink : this.place(i, this.r.multiball.lockLights) < this.locks;
    if (this.now < this.flashUntil[i]) return true;
    return this.lightState[i] === ON || (this.lightState[i] === BLINK && blink);
  }
  /** The place of light `i` in its group, from 0. */
  private place(i: i32, group: string): i32 {
    let n = 0;
    for (let k = 0; k < i; k++) if (this.lightGroups[k] === group) n++;
    return n;
  }
}
