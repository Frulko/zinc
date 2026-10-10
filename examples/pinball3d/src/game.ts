// The game: a table played. It owns the physics (physics.ts) and the rules (rules.ts), and steps them at the table's
// rate: controls in, then one step of the physics, then what the balls did in that step (what they touched, the lines
// they crossed, the holes they fell in, the drain) told to the rules as events. It draws nothing and reads no key:
// the window (main.ts), or an editor that embeds it, gives it the controls and asks it to show() a scene.
import { Table, TableDef } from './format/table';
import { TablePhysics, JoltPhysics, BallState, Part } from './physics';
import { Rules, Source, GAME } from './rules';
import { TableScene } from './scene';
import { tessellate, rad } from './geometry';

/** What the player holds down. */
export class Controls {
  left: boolean = false;
  right: boolean = false;
  plunger: boolean = false;
  nudgeLeft: boolean = false;
  nudgeRight: boolean = false;
  nudgeUp: boolean = false;
  start: boolean = false;
}

export const enum Phase { Attract, Play, Over }
/** Seconds a player has to sign a high score. */
const SIGN_TIME = 30;
/** Seconds before the same wall, or the ball's own knock, sounds again. */
const RATTLE = 0.12;

/** A sound the game asks for: an element's event (or a rule) and the sound the table names for it. Whoever plays the
 *  sounds (audio.ts) takes them from Game.cues; nothing here makes a noise. */
export class Cue {
  /** Seconds of play when it happened. */
  at: number;
  /** What made it: the element and its event ("pop1 hit"), or "rule" for a sound a rule asked for. */
  from: string;
  /** The name of the sound, one of the table's `sounds`. */
  sound: string;
  /** How hard, 0 to 1: a ball that brushes a wall is softer than one that slams into it. */
  gain: number;
  /** Where across the table, -1 at its left edge to 1 at its right. */
  pan: number;
  constructor(at: number, from: string, sound: string, gain: number, pan: number) { this.at = at; this.from = from; this.sound = sound; this.gain = gain; this.pan = pan; }
}

/** A line seen from above that balls cross: a rollover, a spinner, a gate, the mouth or the end of a ramp. */
class Line {
  ax: number; ay: number; bx: number; by: number;
  /** The level it is on, and how far above and below it a ball still counts. */
  z: number; reach: number;
  constructor(ax: number, ay: number, bx: number, by: number, z: number, reach: number) { this.ax = ax; this.ay = ay; this.bx = bx; this.by = by; this.z = z; this.reach = reach; }
  /** 0 when the move from (x0, y0) to (x1, y1) does not cross the line; 1 when it crosses from its left to its right
   *  (as the top view shows the direction a to b), -1 the other way. */
  crossed(x0: number, y0: number, x1: number, y1: number): i32 {
    const dx = this.bx - this.ax, dy = this.by - this.ay;
    const s0 = dx * (y0 - this.ay) - dy * (x0 - this.ax), s1 = dx * (y1 - this.ay) - dy * (x1 - this.ax);
    if ((s0 < 0) === (s1 < 0)) return 0;
    const mx = x1 - x0, my = y1 - y0;
    const t0 = mx * (this.ay - y0) - my * (this.ax - x0), t1 = mx * (this.by - y0) - my * (this.bx - x0);
    if ((t0 < 0) === (t1 < 0)) return 0;
    return s0 < 0 ? 1 : -1;   // in the top view (y downwards) the left of a to b is where this product is negative
  }
  /** How far (x, y) is on the left of the line (negative: on its right), and whether it is abreast of it. */
  side(x: number, y: number): number {
    const dx = this.bx - this.ax, dy = this.by - this.ay, l = Math.sqrt(dx * dx + dy * dy);
    return -(dx * (y - this.ay) - dy * (x - this.ax)) / l;
  }
  abreast(x: number, y: number, margin: number): boolean {
    const dx = this.bx - this.ax, dy = this.by - this.ay, l2 = dx * dx + dy * dy;
    const t = ((x - this.ax) * dx + (y - this.ay) * dy) / l2, m = margin / Math.sqrt(l2);
    return t > -m && t < 1 + m;
  }
}

export class Game {
  table: Table;
  private t: TableDef;
  physics: TablePhysics;
  rules: Rules;
  phase: Phase = Phase.Attract;
  /** Seconds since the table was switched on (the attract lights run on it). */
  clock: number = 0;
  /** The time the last step of the physics took to compute is the caller's to measure; this counts the steps. */
  steps: i32 = 0;
  highScores: string[] = [];
  highValues: number[] = [];
  /** While a player signs a high score: its place in the table (-1: nobody signs), and the letters chosen so far. */
  entering: i32 = -1;
  initials: string = '';
  /** How many high scores were signed since the table was switched on: who keeps the scores saves them when it grows. */
  signed: i32 = 0;
  private letter: i32 = 0;
  /** The sounds asked for and not played yet, oldest first: the player of sounds empties the list (audio.ts). */
  cues: Cue[] = [];
  /** The speed of the fastest ball that rolls on something (cm/s), 0 when none does, and where it is across the table (-1 to 1). */
  rolling: number = 0;
  rollingPan: number = 0;

  private prev: Controls = new Controls();
  /** Per flipper: whether it is up. */
  private flipped: boolean[] = [];
  /** When each wall, and anything without a sound of its own, last sounded under a ball. */
  private wallAt: number[] = [];
  private knockAt: number = -1;
  private px: number[] = [];
  private py: number[] = [];
  /** Per ball: how long it has not moved. */
  private still: number[] = [];
  private launched: boolean = false;
  private autoPull: number = 0;
  private pulled: boolean = false;
  private toServe: i32 = 0;
  private tilt: number = 0;
  private overUntil: number = 0;
  // sources of events
  private wallSrc: Source[] = [];
  private flipperSrc: Source[] = [];
  private bumperSrc: Source[] = [];
  private slingSrc: Source[] = [];
  private targetSrc: Source[] = [];
  private rolloverSrc: Source[] = [];
  private spinnerSrc: Source[] = [];
  private kickerSrc: Source[] = [];
  private rampSrc: Source[] = [];
  private gateSrc: Source[] = [];
  private modelSrc: Source[] = [];
  private plungerSrc: Source = new Source('plunger', '', -1);
  /** The walls, and the models, some rule or mission listens to: only those report their hits. */
  private wallHeard: boolean[] = [];
  private modelHeard: boolean[] = [];
  // lines
  private rolloverLine: Line[] = [];
  private spinnerLine: Line[] = [];
  private gateLine: Line[] = [];
  private rampIn: Line[] = [];
  private rampOut: Line[] = [];
  // what moves by itself
  private spin: number[] = [];
  private spinSpeed: number[] = [];
  private held: i32[] = [];        // per kicker: 1 while it holds a ball
  private ejectAt: number[] = [];
  private kickerRest: number[] = [];
  private bumperGlow: number[] = [];
  private slingGlow: number[] = [];
  private targetGlow: number[] = [];
  /** Per target: when to raise it again (a drop target the rules reset), -1 for none. */
  private raiseAt: number[] = [];
  // what show() needs of the lights: the light of each bumper and slingshot (-1: none), which lights are the general
  // illumination, and whether each light shone at the last show()
  private bumperLight: i32[] = [];
  private slingLight: i32[] = [];
  private generalLight: boolean[] = [];
  private lightLit: boolean[] = [];

  constructor(table: Table) {
    this.table = table;
    const t = table.def;
    this.t = t;
    this.rules = new Rules(t);
    const maxBalls: i32 = Math.max(1, t.rules.multiball.balls) + 1;
    this.physics = new JoltPhysics(table, maxBalls);
    for (let i = 0; i < maxBalls; i++) { this.px.push(0); this.py.push(0); this.still.push(0); }
    const r = t.physics.ball.radius;
    const light = (id: string): i32 => id === '' ? -1 : this.rules.lightIndex(id);
    for (const e of t.walls) { this.wallSrc.push(new Source(e.id, e.group, -1)); this.wallHeard.push(this.heard(e.id, e.group)); this.wallAt.push(-1); }
    for (const e of t.flippers) { this.flipperSrc.push(new Source(e.id, e.group, -1)); this.flipped.push(false); }
    for (const e of t.bumpers) { this.bumperSrc.push(new Source(e.id, e.group, -1)); this.bumperGlow.push(0); this.bumperLight.push(light(e.light)); }
    for (const e of t.slingshots) { this.slingSrc.push(new Source(e.id, e.group, -1)); this.slingGlow.push(0); this.slingLight.push(light(e.light)); }
    for (const l of t.lights) { this.generalLight.push(t.lighting.general !== '' && (l.id === t.lighting.general || l.group === t.lighting.general)); this.lightLit.push(false); }
    for (const e of t.targets) { this.targetSrc.push(new Source(e.id, e.group, light(e.light))); this.targetGlow.push(0); this.raiseAt.push(-1); }
    for (const e of t.rollovers) { this.rolloverSrc.push(new Source(e.id, e.group, light(e.light))); this.rolloverLine.push(new Line(e.a[0], e.a[1], e.b[0], e.b[1], e.z, r * 1.5)); }
    for (const e of t.spinners) {
      this.spinnerSrc.push(new Source(e.id, e.group, -1));
      this.spinnerLine.push(new Line(e.a[0], e.a[1], e.b[0], e.b[1], e.z, e.height + r));
      this.spin.push(0); this.spinSpeed.push(0);
    }
    for (const e of t.kickers) { this.kickerSrc.push(new Source(e.id, e.group, light(e.light))); this.held.push(0); this.ejectAt.push(0); this.kickerRest.push(0); }
    for (const e of t.models) { this.modelSrc.push(new Source(e.id, e.group, -1)); this.modelHeard.push(this.heard(e.id, e.group)); }
    for (const e of t.gates) { this.gateSrc.push(new Source(e.id, e.group, -1)); this.gateLine.push(new Line(e.a[0], e.a[1], e.b[0], e.b[1], e.z, e.height)); }
    for (const e of t.ramps) {
      this.rampSrc.push(new Source(e.id, e.group, -1));
      // its mouth and its end: lines across the track, drawn so that a ball going along the ramp crosses them from the left
      const line = tessellate(e.points, false), n = line.count(), h = e.width / 2 + 0.3;
      const cross = (i: i32, j: i32, at: i32, z: number): Line => {
        const dx = line.xs[j] - line.xs[i], dy = line.ys[j] - line.ys[i], l = Math.sqrt(dx * dx + dy * dy);
        const nx = dy / l * h, ny = -dx / l * h;
        return new Line(line.xs[at] - nx, line.ys[at] - ny, line.xs[at] + nx, line.ys[at] + ny, z, r);   // a ball on the track, not one that rolls under it
      };
      this.rampIn.push(cross(0, 1, 0, e.profile[0][1]));
      this.rampOut.push(cross(n - 2, n - 1, n - 1, e.profile[e.profile.length - 1][1]));
    }
    for (const h of t.rules.highScores) { this.highScores.push(h.name); this.highValues.push(h.score); }
  }

  /** Whether a rule, a mission step or the jackpot listens to this element. */
  private heard(id: string, group: string): boolean {
    const r = this.t.rules;
    const is = (on: string): boolean => on === id || (group !== '' && on === group);
    for (const w of r.when) if (is(w.on)) return true;
    for (const m of r.missions) for (const s of m.steps) if (is(s.on)) return true;
    return is(r.multiball.jackpotOn);
  }

  /** The seconds one step lasts. */
  dt(): number { return this.physics.dt; }

  // ---------------------------------------------------------------- sounds
  /** Asks for the sound `sound` (none when the table names none), made by `from` at x across the table. */
  private cue(from: string, sound: string, gain: number, x: number): void {
    if (sound === '') return;
    if (this.cues.length >= 256) this.cues = [];   // nobody plays them (a test, an editor without sound): they are not kept for ever
    this.cues.push(new Cue(this.rules.now, from, sound, Math.max(0, Math.min(1, gain)), Math.max(-1, Math.min(1, x / this.t.playfield.width * 2 - 1))));
  }
  /** How hard a ball that arrives at `speed` hits something that does not move. */
  private knock(speed: number): number { return 0.25 + 0.75 * Math.min(1, speed / (0.4 * this.t.physics.maxSpeed)); }
  /** At the end of every step: the sounds the rules asked for, and how the balls roll. */
  private heardStep(): void {
    const rules = this.rules, mid = this.t.playfield.width / 2;
    if (rules.sounds.length > 0) {
      for (const s of rules.sounds) this.cue('rule', s, 1, mid);
      rules.sounds = [];
    }
    this.rolling = 0;
    if (this.phase !== Phase.Play) return;
    for (const b of this.physics.balls) {
      if (!b.live) continue;
      // a ball that flies makes no noise: one that rolls goes up or down no faster than a ramp is steep
      const flat = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (Math.abs(b.vz) > 0.3 * flat + 10 || flat <= this.rolling) continue;
      this.rolling = flat;
      this.rollingPan = Math.max(-1, Math.min(1, b.x / mid - 1));
    }
  }

  // ---------------------------------------------------------------- balls
  private live(): i32 { let n = 0; for (const b of this.physics.balls) if (b.live) n++; return n; }
  private holding(): i32 { let n = 0; for (const h of this.held) n += h; return n; }
  /** Where a ball waits for the plunger: just in front of its tip. */
  private laneX(): number { const p = this.t.plunger; return p.at[0] + Math.cos(rad(p.angle)) * (0.55 + this.t.physics.ball.radius); }
  private laneY(): number { const p = this.t.plunger; return p.at[1] + Math.sin(rad(p.angle)) * (0.55 + this.t.physics.ball.radius); }
  private inLane(b: BallState): boolean {
    const dx = b.x - this.laneX(), dy = b.y - this.laneY(), reach = this.t.plunger.travel + 4 * this.t.physics.ball.radius;
    return b.live && dx * dx + dy * dy < reach * reach;
  }
  private laneBusy(): boolean { for (const b of this.physics.balls) if (this.inLane(b)) return true; return false; }
  /** Puts a ball in front of the plunger; `auto`: the game shoots it itself (a saved ball, multiball). */
  private serve(auto: boolean): void {
    for (let i = 0; i < this.physics.balls.length; i++) {
      if (this.physics.balls[i].live) continue;
      this.physics.putBall(i, this.laneX(), this.laneY(), this.t.plunger.z + this.t.physics.ball.radius + 0.02, 0, 0, 0);
      this.px[i] = this.laneX(); this.py[i] = this.laneY();
      if (auto) this.autoPull = this.t.plunger.pullTime + 0.05;
      return;
    }
  }

  // ---------------------------------------------------------------- the course of a game
  start(): void {
    for (let i = 0; i < this.physics.balls.length; i++) this.physics.removeBall(i);
    for (let i = 0; i < this.held.length; i++) this.held[i] = 0;
    for (let i = 0; i < this.wallAt.length; i++) this.wallAt[i] = -1;
    this.knockAt = -1;
    this.entering = -1;
    this.rules.now = 0;
    this.rules.log = [];
    this.rules.start();
    for (let i = 0; i < this.raiseAt.length; i++) { this.physics.setTarget(i, true); this.raiseAt[i] = -1; }
    this.rules.raise = [];
    this.carryOut();
    this.phase = Phase.Play;
    this.toServe = 0; this.autoPull = 0; this.tilt = 0;
    this.nextBall(1);
  }
  private nextBall(n: i32): void {
    this.rules.ball = n;
    this.rules.ballStart();
    this.rules.note(`ball ${n}`);
    this.launched = false;
    this.tilt = 0;
    this.serve(false);
  }
  private endBall(): void {
    const rules = this.rules, bonus = rules.collectBonus();
    rules.note(`end of ball ${rules.ball}: bonus ${bonus}, score ${rules.score}`);
    if (rules.multiball) rules.endMultiball();
    if (rules.extraBalls > 0) {
      rules.extraBalls--;
      rules.say('SHOOT AGAIN');
      this.nextBall(rules.ball);
    } else if (rules.ball < this.t.rules.balls) this.nextBall(rules.ball + 1);
    else {
      this.phase = Phase.Over;
      this.overUntil = this.clock + 6;
      rules.emit(GAME, 'gameOver');
      rules.note(`game over: score ${rules.score}`);
      rules.say('GAME OVER');
      this.enter(rules.score);
    }
  }
  /** A score enters the table of high scores when it beats one. */
  private enter(score: number): void {
    for (let i = 0; i < this.highValues.length; i++) {
      if (score <= this.highValues[i]) continue;
      for (let k = this.highValues.length - 1; k > i; k--) { this.highValues[k] = this.highValues[k - 1]; this.highScores[k] = this.highScores[k - 1]; }
      this.highValues[i] = score;
      // the player signs it: three letters, chosen with the flippers
      this.entering = i; this.initials = ''; this.letter = 0;
      this.overUntil = this.clock + SIGN_TIME;
      this.showInitials();
      return;
    }
  }
  /** The name being signed, as the table of high scores and the panel show it: the letters chosen, the one in hand, blanks. */
  private showInitials(): void {
    let name = this.initials;
    if (name.length < 3) name += String.fromCharCode(65 + this.letter);
    while (name.length < 3) name += '_';
    this.highScores[this.entering] = name;
    this.rules.message = `YOUR INITIALS: ${name}`;
  }
  /** Signing a high score: the flippers go down and up the alphabet, the plunger or start takes the letter (the rules
   *  hear each one: the game's event "letter"); after the third, or when the time is up (the letter in hand then fills
   *  what is left), the name is in the table. */
  private sign(c: Controls): void {
    const p = this.prev;
    if (c.left && !p.left) this.letter = (this.letter + 25) % 26;
    if (c.right && !p.right) this.letter = (this.letter + 1) % 26;
    if ((c.plunger && !p.plunger) || (c.start && !p.start)) { this.initials += String.fromCharCode(65 + this.letter); this.letter = 0; this.rules.emit(GAME, 'letter'); }
    const late = this.clock > this.overUntil;
    while (late && this.initials.length < 3) this.initials += String.fromCharCode(65 + this.letter);
    if (this.initials.length < 3) { this.showInitials(); return; }
    this.highScores[this.entering] = this.initials;
    this.rules.note(`high score: ${this.initials} ${this.highValues[this.entering]}`);
    this.rules.message = `WELL PLAYED, ${this.initials}`;
    this.entering = -1;
    this.signed++;
    this.overUntil = this.clock + 3;
  }

  /** Puts the ball in play at a place of the table with a velocity, instead of in front of the plunger: an editor's
   *  test play from where the pointer is, a probe of one shot. Starts a game when none runs. */
  placeBall(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    if (this.phase !== Phase.Play) this.start();
    this.physics.putBall(0, x, y, z, vx, vy, vz);
    this.px[0] = x; this.py[0] = y;
    this.launched = true;
  }

  /** What the rules asked for. */
  private carryOut(): void {
    const rules = this.rules;
    // a bank that is cleared comes back up a moment later, and never under a ball
    for (const i of rules.raise) this.raiseAt[i] = rules.now + 0.6;
    rules.raise = [];
    for (let i = 0; i < this.raiseAt.length; i++) {
      if (this.raiseAt[i] < 0 || rules.now < this.raiseAt[i]) continue;
      const g = this.t.targets[i], clear = g.width + 2 * this.t.physics.ball.radius;
      let free = true;
      for (const b of this.physics.balls) if (b.live && (b.x - g.at[0]) * (b.x - g.at[0]) + (b.y - g.at[1]) * (b.y - g.at[1]) < clear * clear) free = false;
      if (!free) continue;
      this.physics.setTarget(i, true);
      this.raiseAt[i] = -1;
      this.cue(`${g.id} reset`, g.sounds.reset, 1, g.at[0]);
    }
    if (rules.wantMultiball) {
      rules.wantMultiball = false;
      if (!rules.multiball && this.phase === Phase.Play) {
        rules.startMultiball();
        this.toServe += Math.max(0, this.t.rules.multiball.balls - this.live() - this.holding());
      }
    }
  }

  // ---------------------------------------------------------------- one step
  /** One step of the table's rate (dt() seconds) with what the player holds. */
  step(c: Controls): void {
    const t = this.t, ph = this.physics, rules = this.rules, dt = ph.dt, p = this.prev;
    this.clock += dt;
    this.steps++;
    if (this.phase !== Phase.Play) {
      if (this.entering >= 0) this.sign(c);
      else if (this.phase === Phase.Over && this.clock > this.overUntil) this.phase = Phase.Attract;
      else if ((c.start && !p.start) || (this.phase === Phase.Attract && c.plunger && !p.plunger)) this.start();
      this.remember(c);
      this.heardStep();
      return;
    }
    rules.now += dt;
    rules.ballsInPlay = this.live();

    // ---- the controls
    const dead = rules.tilted;
    for (let i = 0; i < t.flippers.length; i++) {
      const f = t.flippers[i], on = !dead && (f.button === 'left' ? c.left : c.right), was = f.button === 'left' ? p.left : p.right;
      ph.pressFlipper(i, on);
      if (on && !was) rules.emit(this.flipperSrc[i], 'flip');
      if (on !== this.flipped[i]) {
        this.flipped[i] = on;
        this.cue(`${f.id} ${on ? 'up' : 'down'}`, on ? f.sounds.up : f.sounds.down, 1, f.pivot[0]);
      }
    }
    if (this.autoPull > 0) this.autoPull -= dt;
    const pull = c.plunger || this.autoPull > 0, wasPull = this.pulled;
    this.pulled = pull;
    if (pull && !wasPull) this.cue('plunger pull', t.plunger.sounds.pull, 1, t.plunger.at[0]);
    // let go, it strikes as hard as it was pulled back
    if (!pull && wasPull) this.cue('plunger release', t.plunger.sounds.release, 0.3 + 0.7 * ph.plungerPull / t.plunger.travel, t.plunger.at[0]);
    ph.pullPlunger(pull);
    if (!pull && wasPull && this.laneBusy()) {
      rules.emit(this.plungerSrc, 'launch');
      if (!this.launched) { this.launched = true; rules.ballSaveUntil = Math.max(rules.ballSaveUntil, rules.now + t.rules.ballSave); }
    }
    if (c.nudgeLeft && !p.nudgeLeft) this.bump(t.physics.nudge, 0);
    if (c.nudgeRight && !p.nudgeRight) this.bump(-t.physics.nudge, 0);
    if (c.nudgeUp && !p.nudgeUp) this.bump(0, -t.physics.nudge);
    this.tilt = Math.max(0, this.tilt - dt / t.rules.tilt.recovery);
    this.remember(c);

    // ---- what moves by itself: kickers that throw their ball, gates that let a ball through, balls to serve
    for (let i = 0; i < t.kickers.length; i++) {
      if (this.held[i] === 0 || rules.now < this.ejectAt[i]) continue;
      const k = t.kickers[i], flat = Math.cos(rad(k.elevation)) * k.speed;
      this.held[i] = 0;
      this.kickerRest[i] = rules.now + 0.6;
      for (let b = 0; b < ph.balls.length; b++) {
        if (ph.balls[b].live) continue;
        const x = k.at[0] + k.exit[0], y = k.at[1] + k.exit[1];
        ph.putBall(b, x, y, k.z + k.exit[2] + t.physics.ball.radius + 0.05, Math.cos(rad(k.angle)) * flat, Math.sin(rad(k.angle)) * flat, Math.sin(rad(k.elevation)) * k.speed);
        this.px[b] = x; this.py[b] = y;
        break;
      }
      rules.emit(this.kickerSrc[i], 'eject');
      this.cue(`${k.id} eject`, k.sounds.eject, 1, k.at[0]);
    }
    for (let i = 0; i < t.gates.length; i++) {
      // open while a ball is close on the side it may come from
      const g = this.gateLine[i];
      let open = false;
      for (const b of ph.balls) {
        if (!b.live || Math.abs(b.z - g.z) > g.reach) continue;
        const s = g.side(b.x, b.y);
        if (s > -0.5 && s < 4 * t.physics.ball.radius && g.abreast(b.x, b.y, t.physics.ball.radius)) open = true;
      }
      ph.setGate(i, !open);
    }
    if (this.toServe > 0 && this.autoPull <= 0 && ph.plungerPull === 0 && !this.laneBusy()) { this.toServe--; this.serve(true); }

    // ---- the physics, then what each ball did
    for (let i = 0; i < ph.balls.length; i++) { this.px[i] = ph.balls[i].x; this.py[i] = ph.balls[i].y; }
    ph.step();
    for (const touch of ph.touches) this.touched(touch.ball, touch.part, touch.index, touch.speed);
    for (let i = 0; i < ph.balls.length; i++) if (ph.balls[i].live) this.moved(i);
    for (let i = 0; i < t.spinners.length; i++) {
      if (this.spinSpeed[i] === 0) continue;
      const before = Math.floor(this.spin[i]);
      this.spin[i] += this.spinSpeed[i] * dt;
      this.spinSpeed[i] *= Math.max(0, 1 - t.spinners[i].damping * dt);
      if (Math.abs(this.spinSpeed[i]) < 0.4) this.spinSpeed[i] = 0;
      if (Math.floor(this.spin[i]) === before) continue;
      rules.emit(this.spinnerSrc[i], 'spin');
      this.cue(`${t.spinners[i].id} spin`, t.spinners[i].sounds.spin, 1, (t.spinners[i].a[0] + t.spinners[i].b[0]) / 2);
    }
    this.carryOut();

    // ---- the end of multiball, of the ball, of the game
    const inPlay = this.live() + this.holding() + this.toServe;
    if (rules.multiball && inPlay <= 1) rules.endMultiball();
    if (inPlay === 0) this.endBall();
    this.heardStep();
  }

  private remember(c: Controls): void {
    const p = this.prev;
    p.left = c.left; p.right = c.right; p.plunger = c.plunger; p.nudgeLeft = c.nudgeLeft; p.nudgeRight = c.nudgeRight; p.nudgeUp = c.nudgeUp; p.start = c.start;
  }

  /** A bump of the table: every ball gets a push, the rules hear it (the game's event "bump"), and the tilt meter fills. */
  private bump(vx: number, vy: number): void {
    const rules = this.rules, tilt = this.t.rules.tilt;
    if (rules.tilted) return;
    for (let i = 0; i < this.physics.balls.length; i++) this.physics.kickBall(i, vx, vy, 0);
    this.tilt += 1;
    rules.emit(GAME, 'bump');
    if (this.tilt > tilt.warnings + 0.5) {
      if (tilt.penalty === 'none') { rules.say('DANGER'); return; }
      rules.tilted = true;
      if (tilt.penalty === 'ball') rules.ballSaveUntil = 0;
      rules.emit(GAME, 'tilt');
    } else rules.say(this.tilt > tilt.warnings - 0.5 ? 'DANGER' : 'CAREFUL');
  }

  /** Ball `b` met something. */
  private touched(b: i32, part: Part, i: i32, speed: number): void {
    const t = this.t, ball = this.physics.balls[b], rules = this.rules;
    if (!ball.live) return;
    if (part === Part.Bumper) {
      const e = t.bumpers[i];
      if (speed < e.threshold || rules.tilted) return;
      const dx = ball.x - e.at[0], dy = ball.y - e.at[1], l = Math.sqrt(dx * dx + dy * dy);
      if (l > 0) this.physics.kickBall(b, dx / l * e.kick, dy / l * e.kick, 0);
      this.bumperGlow[i] = rules.now + 0.12;
      rules.emit(this.bumperSrc[i], 'hit');
      this.cue(`${e.id} hit`, e.sounds.hit, 1, e.at[0]);
    } else if (part === Part.Slingshot) {
      const e = t.slingshots[i];
      if (speed < e.threshold || rules.tilted) return;
      // away from the band, on the left of a to b as the top view shows it
      const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], l = Math.sqrt(dx * dx + dy * dy);
      this.physics.kickBall(b, dy / l * e.kick, -dx / l * e.kick, 0);
      this.slingGlow[i] = rules.now + 0.12;
      rules.emit(this.slingSrc[i], 'hit');
      this.cue(`${e.id} hit`, e.sounds.hit, 1, (e.a[0] + e.b[0]) / 2);
    } else if (part === Part.Target) {
      if (speed < 8) return;
      this.targetGlow[i] = rules.now + 0.15;
      rules.emit(this.targetSrc[i], 'hit');
      this.cue(`${t.targets[i].id} hit`, t.targets[i].sounds.hit, this.knock(speed), t.targets[i].at[0]);
      if (t.targets[i].kind === 'drop' && !rules.targetDown[i]) {
        rules.targetDown[i] = true;
        this.physics.setTarget(i, false);
        rules.emit(this.targetSrc[i], 'down');
      }
    } else if (speed <= 20) return;   // a ball that leans on something makes no noise
    else if (part === Part.Wall) {
      if (this.wallHeard[i]) rules.emit(this.wallSrc[i], 'hit');
      // a ball that rides a curved wall meets a new stretch of it every few milliseconds: one sound, not a rattle
      if (speed <= 30 || rules.now - this.wallAt[i] < RATTLE) return;
      this.wallAt[i] = rules.now;
      this.cue(`${t.walls[i].id} hit`, t.walls[i].sounds.hit, this.knock(speed), ball.x);
    } else {
      // what names no sound of its own makes the ball's
      const s = t.physics.ball.sounds;
      if (part === Part.Ball) this.cue('ball hit', s.hit, this.knock(speed), ball.x);
      else if (part === Part.Board || part === Part.Floor) { if (speed > 60) this.cue('ball land', s.land, this.knock(speed), ball.x); }   // rolling on is no landing
      else if (speed > 30 && rules.now - this.knockAt >= RATTLE) {
        this.knockAt = rules.now;
        // a modelled piece that collides is an element like another: rules hear its hits, and it may name its sound
        const own = part === Part.Model ? t.models[i].sounds.hit : '';
        if (part === Part.Model && this.modelHeard[i]) rules.emit(this.modelSrc[i], 'hit');
        if (own !== '') this.cue(`${t.models[i].id} hit`, own, this.knock(speed), ball.x);
        else this.cue('ball knock', s.knock, this.knock(speed), ball.x);
      }
    }
  }

  /** Ball `b` moved from where it was before the step: the lines it crossed, the hole it fell in, the drain. */
  private moved(b: i32): void {
    const t = this.t, ball = this.physics.balls[b], rules = this.rules, r = t.physics.ball.radius;
    const x0 = this.px[b], y0 = this.py[b], x1 = ball.x, y1 = ball.y, foot = ball.z - r;
    const on = (l: Line): boolean => Math.abs(foot - l.z) < l.reach;
    for (let i = 0; i < this.rolloverLine.length; i++) {
      if (!on(this.rolloverLine[i]) || this.rolloverLine[i].crossed(x0, y0, x1, y1) === 0) continue;
      rules.emit(this.rolloverSrc[i], 'roll');
      this.cue(`${t.rollovers[i].id} roll`, t.rollovers[i].sounds.roll, 1, x1);
    }
    for (let i = 0; i < this.spinnerLine.length; i++) {
      const way = on(this.spinnerLine[i]) ? this.spinnerLine[i].crossed(x0, y0, x1, y1) : 0;
      if (way !== 0) this.spinSpeed[i] += way * ball.speed() * t.spinners[i].turns;
    }
    for (let i = 0; i < this.gateLine.length; i++) {
      if (!on(this.gateLine[i]) || this.gateLine[i].crossed(x0, y0, x1, y1) !== 1) continue;
      rules.emit(this.gateSrc[i], 'pass');
      this.cue(`${t.gates[i].id} pass`, t.gates[i].sounds.pass, 1, x1);
    }
    for (let i = 0; i < this.rampIn.length; i++) {
      const e = t.ramps[i];
      if (on(this.rampIn[i]) && this.rampIn[i].crossed(x0, y0, x1, y1) === 1) { rules.emit(this.rampSrc[i], 'enter'); this.cue(`${e.id} enter`, e.sounds.enter, 1, x1); }
      if (on(this.rampOut[i]) && this.rampOut[i].crossed(x0, y0, x1, y1) === 1) { rules.emit(this.rampSrc[i], 'exit'); this.cue(`${e.id} exit`, e.sounds.exit, 1, x1); }
    }
    for (let i = 0; i < t.kickers.length; i++) {
      const k = t.kickers[i];
      if (this.held[i] !== 0 || rules.now < this.kickerRest[i] || Math.abs(foot - k.z) > r) continue;
      const dx = x1 - k.at[0], dy = y1 - k.at[1];
      if (dx * dx + dy * dy > k.radius * k.radius || ball.speed() > k.captureSpeed) continue;
      this.physics.removeBall(b);
      this.held[i] = 1;
      this.ejectAt[i] = rules.now + k.hold;
      rules.emit(this.kickerSrc[i], 'capture');
      this.cue(`${k.id} capture`, k.sounds.capture, 1, k.at[0]);
      return;
    }
    // a ball that lies still where no flipper reaches it (behind a wall after a jump, in a corner) is found and served again
    if (ball.speed() > 4 || this.inLane(ball)) this.still[b] = 0;
    else {
      this.still[b] += this.physics.dt;
      if (this.still[b] > 5) {
        this.still[b] = 0;
        this.physics.removeBall(b);
        rules.note('ball search: a ball lay still, it is served again');
        this.toServe++;
        return;
      }
    }
    if (y1 > t.playfield.length + r || ball.z < -3 * r) {
      this.physics.removeBall(b);
      rules.emit(GAME, 'drain');
      if (rules.ballSaved() && !rules.tilted) {
        rules.say('BALL SAVED');
        rules.emit(GAME, 'ballSaved');
        this.toServe++;
      }
    }
  }

  // ---------------------------------------------------------------- showing it
  /** Puts the scene in the state of the game. */
  show(scene: TableScene): void {
    const t = this.t, ph = this.physics, rules = this.rules, play = this.phase === Phase.Play;
    for (let i = 0; i < ph.balls.length; i++) {
      const b = ph.balls[i];
      if (b.live) scene.setBall(i, b.x, b.y, b.z, b.qx, b.qy, b.qz, b.qw); else scene.hideBall(i);
    }
    for (let i = 0; i < t.flippers.length; i++) scene.setFlipper(i, ph.flipperAngle[i]);
    scene.setPlunger(ph.plungerPull);
    // waiting for a player, the lights run in a chase under the general illumination; a game that is over leaves them as they were
    const chase: i32 = Math.floor(this.clock * 6), attract = this.phase === Phase.Attract;
    let general = 0, generals = 0;
    for (let i = 0; i < t.lights.length; i++) {
      const isGeneral = this.generalLight[i];
      const on = attract ? (isGeneral || (i + chase) % 5 === 0) : rules.lit(i);
      this.lightLit[i] = on;
      scene.setLight(i, on);
      if (isGeneral) { generals++; if (on) general++; }
    }
    scene.setGeneral(generals === 0 ? 1 : general / generals);
    // an element glows when it is hit, and while the light the table gives it is lit
    const lit = (light: i32): boolean => light >= 0 && this.lightLit[light];
    for (let i = 0; i < t.targets.length; i++) scene.setTarget(i, !rules.targetDown[i] && this.raiseAt[i] < 0, (play && rules.now < this.targetGlow[i]) || lit(this.targetSrc[i].light));
    for (let i = 0; i < t.bumpers.length; i++) scene.setBumper(i, (play && rules.now < this.bumperGlow[i]) || lit(this.bumperLight[i]));
    for (let i = 0; i < t.slingshots.length; i++) scene.setSlingshot(i, (play && rules.now < this.slingGlow[i]) || lit(this.slingLight[i]));
    for (let i = 0; i < t.spinners.length; i++) scene.setSpinner(i, this.spin[i]);
  }
}
