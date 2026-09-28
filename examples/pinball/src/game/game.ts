// The rules: a state machine over the physics world (attract, play, bonus count, game over, initials entry), the
// fixed-step loop (960 substeps a second whatever the frame rate; events are handled after every substep, so a drop
// target falls before the next substep can hit it again), scoring, missions and ranks, lanes and the bonus
// multiplier, the ball saver, extra balls, multiball with a ramp jackpot, bumps and the tilt, 1 to 4 players.
import { Table, S_LANE, S_SPINNER, S_INLANE_L, S_INLANE_R, S_OUTLANE_L, S_OUTLANE_R, S_SHOOTER, P_WIRE_OUT, P_RAMP_IN, SHOOTER_X, PLUNGER_Y } from '../table/layout';
import { World, E_SENSOR, E_PORTAL, E_CAPTURE, E_DRAIN, E_BALL_HIT } from '../physics/world';
import { Ball, BALL_R, K_BUMPER, K_SLING, K_TARGET, K_FLIPPER, K_POST } from '../physics/bodies';
import { Controls } from '../input';
import { Effects } from '../render/fx';
import { Store, TABLE_SIZE } from './store';
import { MISSIONS, RANKS, Mission, M_BUMPERS, M_TARGETS, M_RAMP, M_SPINNER, M_LANES, M_HOLE, M_SLINGS } from './missions';
import * as sound from '../audio/sound';

export const STEP: number = 1 / 960;
const MAX_STEPS: i32 = 48;                  // per frame: a stalled frame does not snowball
export const BALLS_PER_GAME: i32 = 3;
const BALL_SAVE: number = 10;
const HOLE_HOLD: number = 1.3;
const TARGET_RESET: number = 1.6;
const TILT_ADD: number[] = [0.6, 1.0, 1.5]; // tilt meter per bump, by sensitivity
const TILT_WARN: number = 1.8;
const TILT_LIMIT: number = 3.1;
const TILT_DECAY: number = 0.7;             // per second

export const PH_ATTRACT: i32 = 0, PH_PLAY: i32 = 1, PH_BONUS: i32 = 2, PH_OVER: i32 = 3, PH_ENTRY: i32 = 4;

// colours of popups and flashes (the scene uses them too)
export const C_GOLD: u32 = 0xffd23f, C_CYAN: u32 = 0x3fe7ff, C_PINK: u32 = 0xff4fa3, C_GREEN: u32 = 0x5cff8a, C_WHITE: u32 = 0xffffff,
  C_ORANGE: u32 = 0xff8a2a, C_RED: u32 = 0xff3b3b;

export class Player {
  score: i32 = 0;
  ball: i32 = 1;
  rank: i32 = 0;
  mission: i32 = 0;
  progress: i32 = 0;
  missionsDone: i32 = 0;
  extraBalls: i32 = 0;
  extraLit: boolean = false;
  holeSinks: i32 = 0;
  lanes: boolean[] = [false, false, false];
  bonusX: i32 = 1;
}

export class Game {
  table: Table;
  world: World;
  fx = new Effects();
  phase: i32 = PH_ATTRACT;
  players: Player[] = [new Player()];
  current: i32 = 0;
  /** Seconds since start (lights and chases animate from it). */
  time: number = 0;
  private acc: number = 0;
  /** Seconds in the current phase. */
  phaseTime: number = 0;

  // ball in play
  ballSave: number = 0;
  launched: boolean = false;
  tilted: boolean = false;
  tiltMeter: number = 0;
  danger: number = 0;          // warning flash timer
  multiball: boolean = false;
  jackpot: i32 = 25000;
  bonus: i32 = 0;
  private pendingLaunches: i32 = 0;
  private autoT: number = -1;  // auto-launch clock (-1: idle)
  private holdT: number = -1;
  private heldBall: i32 = -1;
  private targetT: number = -1;
  targetsDown: i32 = 0;
  private prevPlunger: boolean = false;

  // mechanisms and lights the scene draws
  spinnerAngle: number = 0;
  private spinnerSpeed: number = 0;    // revolutions per second
  private spinAcc: number = 0;
  bumperFlash: number[] = [0, 0, 0];
  slingFlash: number[] = [0, 0];
  laneFlash: number = 0;
  chase: number = 0;                   // all-lights chase after a mission or a rank-up
  rampFlash: number = 0;
  holeFlash: number = 0;

  // panel text
  message: string = '';
  message2: string = '';
  messageT: number = 0;

  // initials entry
  entryName: i32[] = [0, 0, 0];
  entryPos: i32 = 0;
  entryPlayer: i32 = -1;
  entryPlace: i32 = 0;

  // attract-mode / benchmark player
  autopilot: boolean = true;
  private aiT: number[] = [0, 0];

  constructor(public store: Store) {
    this.table = new Table(3);
    this.world = this.table.world;
    this.toAttract();
  }

  get player(): Player { return this.players[this.current]; }
  get mission(): Mission { return MISSIONS[this.player.mission]; }
  rankName(): string { return RANKS[this.player.rank]; }

  // ---------------------------------------------------------------- phases

  toAttract(): void {
    this.phase = PH_ATTRACT; this.phaseTime = 0;
    this.autopilot = true;
    this.players = [new Player()];
    this.current = 0;
    this.resetTable();
    this.newBallInLane(true);
  }

  startGame(players: i32): void {
    this.phase = PH_PLAY; this.phaseTime = 0;
    this.autopilot = false;
    this.players = [];
    for (let i: i32 = 0; i < players; i++) this.players.push(new Player());
    this.current = 0;
    this.resetTable();
    this.newBallInLane(false);
    this.say('PLAYER 1', 'Pull the plunger to launch', 3);
  }

  /** Start pressed again before the first ball is launched: one more player (up to 4). */
  canAddPlayer(): boolean { return this.phase === PH_PLAY && this.players.length < 4 && this.current === 0 && this.player.ball === 1 && !this.launched; }

  addPlayer(): void {
    if (!this.canAddPlayer()) return;
    this.players.push(new Player());
    this.say(`${this.players.length} PLAYERS`, 'Press start again to add one', 2);
  }

  private resetTable(): void {
    for (const b of this.world.balls) { b.active = false; b.held = false; }
    for (let i: i32 = 0; i < 3; i++) this.table.setTarget(i, true);
    this.targetsDown = 0; this.targetT = -1;
    this.multiball = false; this.pendingLaunches = 0; this.autoT = -1; this.holdT = -1; this.heldBall = -1;
    this.tilted = false; this.tiltMeter = 0; this.danger = 0; this.world.kicks = true;
    this.table.left.enabled = true; this.table.right.enabled = true;
    this.bonus = 0; this.ballSave = 0; this.launched = false;
    this.world.pulling = false; this.world.plungerPull = 0; this.world.plungerVel = 0;
  }

  /** Puts a ball on the plunger; `auto`: the machine launches it (attract mode, ball saves, multiball). */
  private newBallInLane(auto: boolean): void {
    const b = this.freeBall();
    if (b === null) return;
    this.world.place(b, SHOOTER_X, PLUNGER_Y - BALL_R - 0.02);
    if (auto) this.autoT = 0;
  }

  /** The machine pulls and releases the plunger (demo states, the benchmark). */
  autoLaunch(): void { this.autoT = 0; }

  private freeBall(): Ball | null {
    for (const b of this.world.balls) if (!b.active) return b;
    return null;
  }

  private laneBusy(): boolean {
    for (const b of this.world.balls) if (b.active && b.x > 19.1 && b.y > 30) return true;
    return false;
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, c: Controls): void {
    this.time += dt;
    this.phaseTime += dt;
    this.fx.update(dt);
    if (this.messageT > 0) this.messageT -= dt;
    const plungerEdge = c.plunger && !this.prevPlunger;
    this.prevPlunger = c.plunger;

    if (this.phase === PH_ATTRACT) {
      if ((c.start || c.confirm || plungerEdge) && this.phaseTime > 0.3) { this.startGame(1); return; }
    } else if (this.phase === PH_BONUS) {
      if (this.phaseTime > 2.2) this.nextBall();
    } else if (this.phase === PH_OVER) {
      if (this.phaseTime > 2.5) this.afterGameOver();
      return;
    } else if (this.phase === PH_ENTRY) {
      this.updateEntry(c, plungerEdge);
      return;
    }

    // flippers: pressed state goes to the coils before the substeps run (no added latency)
    const playing = this.phase === PH_PLAY || this.phase === PH_ATTRACT;
    let left = playing && c.left, right = playing && c.right;
    if (this.autopilot) { left = this.aiFlip(0, dt); right = this.aiFlip(1, dt); }
    this.table.left.pressed = left;
    this.table.right.pressed = right;
    if (!this.tilted && !this.autopilot && (c.leftPressed || c.rightPressed) && this.phase === PH_PLAY) this.rotateLanes(c.leftPressed ? -1 : 1);
    if ((c.leftPressed || c.rightPressed) && !this.tilted && this.phase === PH_PLAY) sound.play(sound.SFX_FLIPPER);

    // plunger: the player's hand, or the machine's
    let pull = !this.autopilot && c.plunger && this.phase === PH_PLAY;
    if (this.autoT >= 0) {
      this.autoT += dt;
      pull = this.autoT < 0.62;
      if (this.autoT > 0.7) this.autoT = -1;
    }
    if (this.world.pulling && !pull && this.laneBusy()) sound.play(sound.SFX_LAUNCH);
    this.world.pulling = pull;

    if (this.phase === PH_PLAY && !this.autopilot) {
      if (c.nudgeLeft) this.bump(1, 0);
      if (c.nudgeRight) this.bump(-1, 0);
      if (c.nudgeUp) this.bump(0, -1);
    }
    this.simulate(dt);
  }

  private simulate(dt: number): void {
    this.acc += dt;
    let n: i32 = 0;
    while (this.acc >= STEP && n < MAX_STEPS) {
      this.world.step(STEP);
      this.handleEvents();
      this.acc -= STEP;
      n++;
    }
    if (n === MAX_STEPS) this.acc = 0;
    this.timers(dt);
  }

  private timers(dt: number): void {
    if (this.ballSave > 0) this.ballSave -= dt;
    if (this.danger > 0) this.danger -= dt;
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT_DECAY * dt);
    for (let i: i32 = 0; i < 3; i++) this.bumperFlash[i] = Math.max(0, this.bumperFlash[i] - dt * 5);
    for (let i: i32 = 0; i < 2; i++) this.slingFlash[i] = Math.max(0, this.slingFlash[i] - dt * 6);
    this.laneFlash = Math.max(0, this.laneFlash - dt);
    this.chase = Math.max(0, this.chase - dt);
    this.rampFlash = Math.max(0, this.rampFlash - dt);
    this.holeFlash = Math.max(0, this.holeFlash - dt);

    // spinner: spins down, scores every half turn
    this.spinnerAngle += this.spinnerSpeed * Math.PI * 2 * dt;
    this.spinAcc += this.spinnerSpeed * 2 * dt;
    while (this.spinAcc >= 1) {
      this.spinAcc -= 1;
      this.award(100, false);
      this.progress(M_SPINNER, 1);
      sound.play(sound.SFX_SPINNER);
    }
    this.spinnerSpeed *= Math.exp(-dt * 1.4);
    if (this.spinnerSpeed < 0.4) {
      this.spinnerSpeed = 0;
      // settle flat
      const half = Math.PI;
      const a = this.spinnerAngle % half;
      if (a > 0.05) this.spinnerAngle += Math.min(half - a, dt * 3);
    }

    // kicker hole: hold, then kick the ball out towards the bumpers
    if (this.holdT >= 0) {
      this.holdT -= dt;
      if (this.holdT < 0) {
        const b = this.world.balls[this.heldBall];
        this.world.eject(b, 22 + Math.random() * 8, 30 + Math.random() * 6);
        this.fx.burst(b.x, b.y, 0.3, 10, 12, C_PINK);
        this.holdT = -1; this.heldBall = -1;
        if (this.multiball && this.pendingLaunches > 0) this.launchNext();
      }
    }
    // drop targets come back up
    if (this.targetT >= 0) {
      this.targetT -= dt;
      if (this.targetT < 0) { for (let i: i32 = 0; i < 3; i++) this.table.setTarget(i, true); this.targetsDown = 0; this.targetT = -1; }
    }
    // multiball: more balls from the plunger
    if (this.pendingLaunches > 0 && this.autoT < 0 && !this.laneBusy() && this.holdT < 0) this.launchNext();
  }

  private launchNext(): void {
    if (this.pendingLaunches <= 0 || this.laneBusy()) return;
    this.pendingLaunches--;
    this.newBallInLane(true);
  }

  // ---------------------------------------------------------------- events

  private handleEvents(): void {
    const w = this.world;
    for (let i: i32 = 0; i < w.nevents; i++) {
      const e = w.events[i];
      const k = e.kind;
      if (k === K_BUMPER) this.onBumper(e.tag);
      else if (k === K_SLING) this.onSling(e.tag);
      else if (k === K_TARGET) this.onTarget(e.tag);
      else if (k === E_SENSOR) this.onSensor(e.tag, e.dir, e.speed);
      else if (k === E_PORTAL) this.onPortal(e.tag);
      else if (k === E_CAPTURE) this.onCapture(e.ball);
      else if (k === E_DRAIN) this.onDrain();
      else if (k === K_POST && e.speed > 20) sound.play(sound.SFX_SLING);
      else if ((k === K_FLIPPER || k === E_BALL_HIT) && e.speed > 30) this.fx.bump(0.6);
    }
    w.nevents = 0;
  }

  private award(points: i32, bonus: boolean): void {
    if (this.tilted) return;
    this.player.score += points;
    if (bonus) this.bonus += Math.floor(points / 10);
  }

  private onBumper(i: i32): void {
    if (this.tilted) return;
    const b = this.table.bumpers[i];
    this.award(100 + 50 * this.player.rank, true);
    this.bumperFlash[i] = 1;
    this.fx.ring(b.x, b.y, 0.9, 1.1, C_CYAN);
    this.fx.burst(b.x, b.y, 1.0, 6, 10, C_CYAN);
    this.fx.popup(`${100 + 50 * this.player.rank}`, b.x, b.y, C_CYAN, false);
    this.progress(M_BUMPERS, 1);
    sound.play(sound.SFX_BUMPER);
  }

  private onSling(i: i32): void {
    if (this.tilted) return;
    const s = this.table.slings[i];
    this.award(50, true);
    this.slingFlash[i] = 1;
    this.fx.burst((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 0.6, 5, 9, C_ORANGE);
    this.progress(M_SLINGS, 1);
    sound.play(sound.SFX_SLING);
  }

  private onTarget(i: i32): void {
    this.table.setTarget(i, false);
    this.targetsDown++;
    const t = this.table.targets[i];
    sound.play(sound.SFX_TARGET);
    if (this.tilted) return;
    this.award(750, true);
    this.fx.popup('750', t.ax + 1, (t.ay + t.by) / 2, C_GOLD, false);
    this.fx.burst(t.ax, (t.ay + t.by) / 2, 0.5, 8, 10, C_GOLD);
    if (this.targetsDown >= 3) {
      this.award(5000, true);
      this.fx.popup('BANK 5000', 4.5, 19, C_GOLD, true);
      this.targetT = TARGET_RESET;
      this.progress(M_TARGETS, 1);
    }
  }

  private onSensor(tag: i32, dir: i32, speed: number): void {
    if (tag === S_SHOOTER) {
      // the ball left the shooter lane going up: the ball saver starts with the first launch of a ball
      if (dir > 0 && !this.launched && this.phase === PH_PLAY) { this.launched = true; this.ballSave = BALL_SAVE; }
      return;
    }
    if (this.tilted) return;
    if (tag >= S_LANE && tag < S_LANE + 3) {
      const p = this.player, i = tag - S_LANE;
      const x = (this.table.lanes[i].ax + this.table.lanes[i].ax + this.table.lanes[i].len) / 2;
      sound.play(sound.SFX_ROLLOVER);
      if (!p.lanes[i]) { p.lanes[i] = true; this.award(1000, true); this.fx.popup('1000', x, 5, C_GREEN, false); }
      else this.award(250, false);
      if (p.lanes[0] && p.lanes[1] && p.lanes[2]) {
        if (p.bonusX < 5) p.bonusX++;
        this.say(`BONUS ${p.bonusX}X`, 'Top lanes complete', 2);
        this.fx.popup(`${p.bonusX}X`, 9.4, 7, C_GREEN, true);
        this.laneFlash = 1.2;
        p.lanes[0] = false; p.lanes[1] = false; p.lanes[2] = false;
        this.progress(M_LANES, 1);
      }
    } else if (tag === S_SPINNER) {
      this.spinnerSpeed = Math.min(12, Math.max(this.spinnerSpeed, speed * 0.09));
    } else if (tag === S_INLANE_L || tag === S_INLANE_R) {
      if (dir < 0) { this.award(1000, true); sound.play(sound.SFX_ROLLOVER); }
    } else if (tag === S_OUTLANE_L || tag === S_OUTLANE_R) {
      if (dir < 0) { this.award(2500, false); sound.play(sound.SFX_ROLLOVER); }
    }
  }

  private onPortal(tag: i32): void {
    if (tag === P_RAMP_IN) { if (!this.tilted) this.award(500, false); return; }
    if (tag !== P_WIRE_OUT || this.tilted) return;
    this.rampFlash = 1.5;
    sound.play(sound.SFX_RAMP);
    if (this.multiball) {
      this.award(this.jackpot, true);
      this.say('JACKPOT', `${this.jackpot}`, 2.5);
      this.fx.popup('JACKPOT', 15, 20, C_PINK, true);
      this.jackpot += 10000;
      this.chase = 1.5;
    } else {
      this.award(5000, true);
      this.fx.popup('RAMP 5000', 15, 22, C_CYAN, true);
    }
    this.progress(M_RAMP, 1);
  }

  private onCapture(ball: i32): void {
    const h = this.table.hole;
    this.holdT = HOLE_HOLD; this.heldBall = ball;
    this.holeFlash = HOLE_HOLD;
    sound.play(sound.SFX_HOLE);
    this.fx.ring(h.x, h.y, 0.05, 1.2, C_PINK);
    if (this.tilted) return;
    const p = this.player;
    p.holeSinks++;
    this.award(2500, true);
    this.fx.popup('WORMHOLE', h.x + 1.5, h.y, C_PINK, true);
    if (p.extraLit) {
      p.extraLit = false; p.extraBalls++;
      this.say('EXTRA BALL', 'Shoot again after this ball', 3);
      sound.play(sound.SFX_EXTRA);
    }
    this.progress(M_HOLE, 1);
    if (!this.multiball && p.holeSinks % 3 === 0) this.startMultiball();
    else if (!this.multiball) this.say('WORMHOLE', `${3 - p.holeSinks % 3} more for multiball`, 2);
  }

  startMultiball(): void {
    this.multiball = true;
    this.pendingLaunches = 2;
    this.ballSave = Math.max(this.ballSave, 12);
    this.jackpot = 25000;
    this.chase = 2;
    this.say('MULTIBALL', 'Ramp scores the jackpot', 3);
    sound.play(sound.SFX_MULTIBALL);
  }

  private onDrain(): void {
    sound.play(sound.SFX_DRAIN);
    const left = this.world.activeBalls();
    if (this.phase === PH_ATTRACT) { if (left === 0) this.newBallInLane(true); return; }
    if (this.phase !== PH_PLAY) return;
    if (this.ballSave > 0 && !this.tilted) {
      this.say('BALL SAVED', '', 2);
      this.pendingLaunches++;
      return;
    }
    if (this.multiball && left + this.pendingLaunches <= 1) { this.multiball = false; this.say('MULTIBALL OVER', '', 2); }
    if (left > 0 || this.pendingLaunches > 0) return;
    this.endOfBall();
  }

  // ---------------------------------------------------------------- ball / game end

  private endOfBall(): void {
    const p = this.player;
    this.phase = PH_BONUS; this.phaseTime = 0;
    const total = this.tilted ? 0 : this.bonus * p.bonusX;
    this.message = this.tilted ? 'TILT' : `BONUS ${total}`;
    this.message2 = this.tilted ? 'Bonus lost' : `${this.bonus} x ${p.bonusX}`;
    this.messageT = 2.2;
    p.score += total;
  }

  private nextBall(): void {
    const p = this.player;
    p.bonusX = 1;
    if (p.extraBalls > 0) {
      p.extraBalls--;
      this.say('SHOOT AGAIN', `Player ${this.current + 1}`, 2.5);
    } else {
      p.ball++;
      // the next player that still has balls
      let next = this.current;
      for (let i: i32 = 1; i <= this.players.length; i++) {
        const j = (this.current + i) % this.players.length;
        if (this.players[j].ball <= BALLS_PER_GAME) { next = j; break; }
      }
      if (this.players[next].ball > BALLS_PER_GAME) { this.gameOver(); return; }
      this.current = next;
      this.say(`PLAYER ${next + 1}`, `Ball ${this.player.ball}`, 2.5);
    }
    this.phase = PH_PLAY; this.phaseTime = 0;
    this.resetTable();
    this.newBallInLane(this.autopilot);
  }

  private gameOver(): void {
    this.phase = PH_OVER; this.phaseTime = 0;
    this.say('GAME OVER', '', 3);
    for (const b of this.world.balls) b.active = false;
  }

  private afterGameOver(): void {
    // initials for each player whose score makes the table, best first
    for (let i: i32 = 0; i < this.players.length; i++) {
      const s = this.players[i].score;
      if (this.players[i].ball > BALLS_PER_GAME + 1) continue;   // already entered
      if (this.store.placeOf(s) < TABLE_SIZE) { this.beginEntry(i); return; }
    }
    this.toAttract();
  }

  beginEntry(player: i32): void {
    this.phase = PH_ENTRY; this.phaseTime = 0;
    this.entryPlayer = player;
    this.entryPlace = this.store.placeOf(this.players[player].score);
    this.entryName = [0, 0, 0]; this.entryPos = 0;
  }

  private updateEntry(c: Controls, plungerEdge: boolean): void {
    this.fx.update(0);
    if (c.leftPressed || c.up) this.entryName[this.entryPos] = (this.entryName[this.entryPos] + 25) % 26;
    if (c.rightPressed || c.down) this.entryName[this.entryPos] = (this.entryName[this.entryPos] + 1) % 26;
    if (plungerEdge || c.confirm) {
      this.entryPos++;
      if (this.entryPos === 3) {
        const p = this.players[this.entryPlayer];
        this.store.insert(this.entryNameText(), p.score);
        p.ball = BALLS_PER_GAME + 2;   // marks the entry as done
        this.phase = PH_OVER; this.phaseTime = 2.5;
      }
    }
  }

  entryNameText(): string {
    let s = '';
    for (const l of this.entryName) s += String.fromCharCode(65 + l);
    return s;
  }

  // ---------------------------------------------------------------- missions, lanes, bumps

  private progress(kind: i32, n: i32): void {
    if (this.tilted || this.phase !== PH_PLAY) return;
    const p = this.player;
    const m = MISSIONS[p.mission];
    if (m.kind !== kind) return;
    p.progress += n;
    if (p.progress < m.count) return;
    // mission complete: award, promotion, next mission
    const award = m.award * (1 + p.rank);
    this.award(award, true);
    p.missionsDone++;
    p.mission = (p.mission + 1) % MISSIONS.length;
    p.progress = 0;
    this.chase = 2.5;
    if (p.rank < RANKS.length - 1) {
      p.rank++;
      this.say(`PROMOTED: ${RANKS[p.rank]}`, `${m.name} complete +${award}`, 3.5);
      sound.play(sound.SFX_RANK);
      if (p.rank === 3 || p.rank === 6) { p.extraLit = true; this.message2 = 'Extra ball lit at the wormhole'; }
    } else {
      this.say('MISSION COMPLETE', `${m.name} +${award}`, 3);
      sound.play(sound.SFX_MISSION);
    }
    this.fx.popup(`+${award}`, 9.8, 20, C_GOLD, true);
  }

  /** Flipper buttons move the lit top lanes (lane change). */
  private rotateLanes(dir: i32): void {
    const l = this.player.lanes;
    if (dir < 0) { const a = l[0]; l[0] = l[1]; l[1] = l[2]; l[2] = a; }
    else { const a = l[2]; l[2] = l[1]; l[1] = l[0]; l[0] = a; }
  }

  /** A bump of the table: dx > 0 shoves from the left (the balls lag to the right... relative to the table). */
  bump(dx: number, dy: number): void {
    if (this.tilted) return;
    this.world.nudge(dx * 16, dy * 22);
    this.fx.bump(5);
    sound.play(sound.SFX_NUDGE);
    this.tiltMeter += TILT_ADD[this.store.settings.tilt];
    if (this.tiltMeter >= TILT_LIMIT) this.tilt();
    else if (this.tiltMeter >= TILT_WARN) { this.danger = 1.5; this.say('DANGER', 'One more bump will tilt', 1.5); }
  }

  tilt(): void {
    this.tilted = true;
    this.table.left.enabled = false; this.table.right.enabled = false;
    this.world.kicks = false;
    this.ballSave = 0;
    this.fx.bump(12);
    this.say('TILT', 'Flippers are dead for this ball', 4);
    sound.play(sound.SFX_TILT);
  }

  say(a: string, b: string, secs: number): void { this.message = a; this.message2 = b; this.messageT = secs; }

  // ---------------------------------------------------------------- attract / bench player

  /** A simple player: flips when a ball comes down into the flipper's sweet spot. */
  private aiFlip(side: i32, dt: number): boolean {
    const f = side === 0 ? this.table.left : this.table.right;
    if (this.aiT[side] > 0) { this.aiT[side] -= dt; return this.aiT[side] > 0.05; }
    for (const b of this.world.balls) {
      if (!b.active || b.held || b.layer !== 0) continue;
      const dx = (b.x - f.px) * (side === 0 ? 1 : -1), dy = b.y - f.py;
      if (dx > 0.6 && dx < f.len + 0.3 && dy > -2.6 && dy < 1.4 && b.vy > -10) {
        // aim a little: a random delay spreads the shots over the table
        if (Math.random() < 0.35) { this.aiT[side] = 0.3 + Math.random() * 0.12; return true; }
      }
    }
    return false;
  }
}
