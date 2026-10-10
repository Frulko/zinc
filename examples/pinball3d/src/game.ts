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

  private prev: Controls = new Controls();
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
  private plungerSrc: Source = new Source('plunger', '', -1);
  /** The walls some rule or mission listens to: only those report their hits. */
  private wallHeard: boolean[] = [];
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
    for (const e of t.walls) { this.wallSrc.push(new Source(e.id, e.group, -1)); this.wallHeard.push(this.heard(e.id, e.group)); }
    for (const e of t.flippers) this.flipperSrc.push(new Source(e.id, e.group, -1));
    for (const e of t.bumpers) { this.bumperSrc.push(new Source(e.id, e.group, -1)); this.bumperGlow.push(0); }
    for (const e of t.slingshots) { this.slingSrc.push(new Source(e.id, e.group, -1)); this.slingGlow.push(0); }
    for (const e of t.targets) { this.targetSrc.push(new Source(e.id, e.group, light(e.light))); this.targetGlow.push(0); this.raiseAt.push(-1); }
    for (const e of t.rollovers) { this.rolloverSrc.push(new Source(e.id, e.group, light(e.light))); this.rolloverLine.push(new Line(e.a[0], e.a[1], e.b[0], e.b[1], e.z, r * 1.5)); }
    for (const e of t.spinners) {
      this.spinnerSrc.push(new Source(e.id, e.group, -1));
      this.spinnerLine.push(new Line(e.a[0], e.a[1], e.b[0], e.b[1], e.z, e.height + r));
      this.spin.push(0); this.spinSpeed.push(0);
    }
    for (const e of t.kickers) { this.kickerSrc.push(new Source(e.id, e.group, light(e.light))); this.held.push(0); this.ejectAt.push(0); this.kickerRest.push(0); }
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
      this.highValues[i] = score; this.highScores[i] = 'YOU';
      return;
    }
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
      if (this.phase === Phase.Over && this.clock > this.overUntil) this.phase = Phase.Attract;
      if ((c.start && !p.start) || (this.phase === Phase.Attract && c.plunger && !p.plunger)) this.start();
      this.remember(c);
      return;
    }
    rules.now += dt;
    rules.ballsInPlay = this.live();

    // ---- the controls
    const dead = rules.tilted;
    for (let i = 0; i < t.flippers.length; i++) {
      const on = !dead && (t.flippers[i].button === 'left' ? c.left : c.right), was = t.flippers[i].button === 'left' ? p.left : p.right;
      ph.pressFlipper(i, on);
      if (on && !was) rules.emit(this.flipperSrc[i], 'flip');
    }
    if (this.autoPull > 0) this.autoPull -= dt;
    const pull = c.plunger || this.autoPull > 0, wasPull = this.pulled;
    this.pulled = pull;
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
      if (Math.floor(this.spin[i]) !== before) rules.emit(this.spinnerSrc[i], 'spin');
    }
    this.carryOut();

    // ---- the end of multiball, of the ball, of the game
    const inPlay = this.live() + this.holding() + this.toServe;
    if (rules.multiball && inPlay <= 1) rules.endMultiball();
    if (inPlay === 0) this.endBall();
  }

  private remember(c: Controls): void {
    const p = this.prev;
    p.left = c.left; p.right = c.right; p.plunger = c.plunger; p.nudgeLeft = c.nudgeLeft; p.nudgeRight = c.nudgeRight; p.nudgeUp = c.nudgeUp; p.start = c.start;
  }

  /** A bump of the table: every ball gets a push, and the tilt meter fills. */
  private bump(vx: number, vy: number): void {
    const rules = this.rules, tilt = this.t.rules.tilt;
    if (rules.tilted) return;
    for (let i = 0; i < this.physics.balls.length; i++) this.physics.kickBall(i, vx, vy, 0);
    this.tilt += 1;
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
    } else if (part === Part.Slingshot) {
      const e = t.slingshots[i];
      if (speed < e.threshold || rules.tilted) return;
      // away from the band, on the left of a to b as the top view shows it
      const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], l = Math.sqrt(dx * dx + dy * dy);
      this.physics.kickBall(b, dy / l * e.kick, -dx / l * e.kick, 0);
      this.slingGlow[i] = rules.now + 0.12;
      rules.emit(this.slingSrc[i], 'hit');
    } else if (part === Part.Target) {
      if (speed < 8) return;
      this.targetGlow[i] = rules.now + 0.15;
      rules.emit(this.targetSrc[i], 'hit');
      if (t.targets[i].kind === 'drop' && !rules.targetDown[i]) {
        rules.targetDown[i] = true;
        this.physics.setTarget(i, false);
        rules.emit(this.targetSrc[i], 'down');
      }
    } else if (part === Part.Wall && this.wallHeard[i] && speed > 20) rules.emit(this.wallSrc[i], 'hit');
  }

  /** Ball `b` moved from where it was before the step: the lines it crossed, the hole it fell in, the drain. */
  private moved(b: i32): void {
    const t = this.t, ball = this.physics.balls[b], rules = this.rules, r = t.physics.ball.radius;
    const x0 = this.px[b], y0 = this.py[b], x1 = ball.x, y1 = ball.y, foot = ball.z - r;
    const on = (l: Line): boolean => Math.abs(foot - l.z) < l.reach;
    for (let i = 0; i < this.rolloverLine.length; i++) {
      if (on(this.rolloverLine[i]) && this.rolloverLine[i].crossed(x0, y0, x1, y1) !== 0) rules.emit(this.rolloverSrc[i], 'roll');
    }
    for (let i = 0; i < this.spinnerLine.length; i++) {
      const way = on(this.spinnerLine[i]) ? this.spinnerLine[i].crossed(x0, y0, x1, y1) : 0;
      if (way !== 0) this.spinSpeed[i] += way * ball.speed() * t.spinners[i].turns;
    }
    for (let i = 0; i < this.gateLine.length; i++) {
      if (on(this.gateLine[i]) && this.gateLine[i].crossed(x0, y0, x1, y1) === 1) rules.emit(this.gateSrc[i], 'pass');
    }
    for (let i = 0; i < this.rampIn.length; i++) {
      if (on(this.rampIn[i]) && this.rampIn[i].crossed(x0, y0, x1, y1) === 1) rules.emit(this.rampSrc[i], 'enter');
      if (on(this.rampOut[i]) && this.rampOut[i].crossed(x0, y0, x1, y1) === 1) rules.emit(this.rampSrc[i], 'exit');
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
    for (let i = 0; i < t.targets.length; i++) scene.setTarget(i, !rules.targetDown[i] && this.raiseAt[i] < 0, play && rules.now < this.targetGlow[i]);
    for (let i = 0; i < t.bumpers.length; i++) scene.setBumper(i, play && rules.now < this.bumperGlow[i]);
    for (let i = 0; i < t.slingshots.length; i++) scene.setSlingshot(i, play && rules.now < this.slingGlow[i]);
    for (let i = 0; i < t.spinners.length; i++) scene.setSpinner(i, this.spin[i]);
    // waiting for a player, the lights run in a chase
    const chase: i32 = Math.floor(this.clock * 6);
    for (let i = 0; i < t.lights.length; i++) scene.setLight(i, play ? rules.lit(i) : (i + chase) % 5 === 0);
  }
}
