// The game's state and its actions: the title screen that looks for hosts, a hosted match (the authority: balls, hits, scores, bots),
// a joined match (the client: its own moves, the host's snapshots), or a solo match (a host with no network). No drawing here.
//
// Protocol (text datagrams, services/network.ts adds the 'PA1|' tag; positions in hundredths):
//   ?                                   who hosts?            -> !|<name>|<players>
//   J|<name>                            join                  -> W|<id>   (F when full)
//   I|<id>|<x>|<y>|<angle>|<shots>|<spawns>                   a client's state, 30 a second
//   S|<winner>|<pause>|<players>|<balls>                      the host's snapshot, 20 a second; players 'id,name,x,y,a,score,dead,spawns,by;'
//                                                             and balls 'x,y,dx,dy,owner;'
//   L|<id>                              a client leaves
import { clock } from 'zinc:sys';
import { World, Player, Ball } from './world';
import { BotMind, thinkBot, BOT_NAMES } from './bots';
import { Controls } from './input';
import { Network } from './services/network';
import {
  MOVE_SPEED, STRAFE_SPEED, TURN_SPEED, FIRE_COOLDOWN, SNAPSHOT_MS, INPUT_MS, TIMEOUT_MS, MAX_PLAYERS, BOTS_WITH_NOBODY,
} from './constants';

export const TITLE: i32 = 0, HOST: i32 = 1, CLIENT: i32 = 2, SOLO: i32 = 3;

function clean(s: string): string {   // a name travels between '|', ',' and ';'
  let r = '';
  for (let i = 0; i < s.length && r.length < 10; i++) { const c = s.charAt(i); if (c !== '|' && c !== ',' && c !== ';') r += c; }
  return r.length > 0 ? r : 'player';
}
function hundredths(v: number): string { return `${Math.round(v * 100)}`; }
function unit(s: string): number { return parseInt(s) / 100; }
function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export class Game {
  mode: i32 = TITLE;
  world = new World();
  me: Player | null = null;
  net: Network;
  name: string;
  botTarget: i32 = -1;          // -1: fill up to BOTS_WITH_NOBODY players
  minds: BotMind[] = [];
  selected: i32 = 0;            // the host chosen on the title screen
  message = '';                 // a line for the title screen (why a join failed...)
  log = false;                  // --log: what happens, one line each
  autoJoin = false;             // --auto: joins the first host found (the tests, an unattended console)
  autoFire = false;             // --autofire: shoots and turns by itself (the tests)
  // a client
  hostAddress = '';
  hostPort: i32 = 0;
  joinSentAt = -1e9;
  joinStartedAt = 0;
  heardAt = 0;
  inputAt = -1e9;
  joined = false;
  seenCount: i32 = 0;           // the players of the last snapshot
  // a host
  snapshotAt = -1e9;
  splats: i32 = 0;              // the local player's splats seen (the screen flashes)
  flash = 0;

  autoName = false;             // the name is the machine's kind and the last number of its address: 'PSP-220'
  base: string;

  constructor(port: i32, name: string) { this.net = new Network(port); this.name = clean(name); this.base = this.name; }

  /** The automatic name, once the address is known. */
  nameMe(): void {
    const a = this.net.address(), dot = a.lastIndexOf('.');
    if (this.autoName && dot > 0) this.name = clean(`${this.base}-${a.slice(dot + 1)}`);
  }

  say(line: string): void { if (this.log) console.log(line); }

  // ------------------------------------------------------------------ starting and leaving
  reset(): void {
    this.world = new World();
    this.me = null;
    this.minds = [];
    this.joined = false;
  }
  /** Hosts a match here: the authority, on the match's port, answering searches; plays too. */
  startHost(): boolean {
    this.reset();
    if (!this.net.up() || !this.net.open(true)) {
      this.message = `cannot host: ${this.net.why.length > 0 ? this.net.why : 'the network is not up yet'}`;
      this.mode = TITLE;
      this.say(this.message);
      return false;
    }
    this.mode = HOST;
    this.nameMe();
    const me = this.world.add(this.name);
    this.me = me;
    this.fillBots();
    this.say(`host ${this.net.address()}:${this.net.port} as ${me.id}`);
    return true;
  }
  /** A match with bots and no network. */
  startSolo(): void {
    this.reset();
    this.net.close();
    this.mode = SOLO;
    this.me = this.world.add(this.name);
    this.fillBots();
    this.say('solo');
  }
  /** Joins the host at address:port (its answer gives this player's id). */
  join(address: string, port: i32): void {
    this.reset();
    this.nameMe();
    this.net.open(false);
    this.message = `joining ${address}...`;
    this.mode = CLIENT;
    this.hostAddress = address;
    this.hostPort = port;
    this.joinSentAt = -1e9;
    this.joinStartedAt = clock();
    this.heardAt = clock();
    this.say(`join ${address}:${port}`);
  }
  /** Back to the title screen (a client tells its host). */
  leave(why: string): void {
    const me = this.me;
    if (this.mode === CLIENT && me !== null && this.joined) this.net.send(this.hostAddress, this.hostPort, `L|${me.id}`);
    this.reset();
    this.net.close();
    this.mode = TITLE;
    this.message = why;
    this.say(`title ${why}`);
  }

  fillBots(): void {
    let humans = 0, bots = 0;
    for (const p of this.world.players) { if (p.bot) bots++; else humans++; }
    const want = this.botTarget >= 0 ? this.botTarget : Math.max(0, BOTS_WITH_NOBODY - humans);
    while (bots < want && this.world.players.length < MAX_PLAYERS) {
      const b = this.world.add(BOT_NAMES[bots % BOT_NAMES.length]);
      b.bot = true;
      bots++;
    }
    while (bots > want) {   // the last bot goes
      let last: Player | null = null;
      for (const p of this.world.players) if (p.bot) last = p;
      if (last === null) break;
      this.world.remove(last.id);
      bots--;
    }
  }

  // ------------------------------------------------------------------ a frame
  update(dt: number, c: Controls): void {
    const now = clock();
    if (this.flash > 0) this.flash -= dt;
    if (this.mode === TITLE) { this.title(c, now); return; }
    if (c.start) { this.leave(''); return; }
    this.world.events = [];   // this frame's: shots, hits, a win (the log and the sounds)
    if (this.autoFire) { c.fire = true; c.turn = 0.4; c.forward = 0; }
    this.moveMe(dt, c);
    if (this.mode === CLIENT) { this.client(dt, now); return; }
    // the authority: bots, the step, the network
    let mind = 0;
    for (const p of this.world.players) {
      if (!p.bot) continue;
      if (mind >= this.minds.length) this.minds.push(new BotMind());
      thinkBot(this.world, p, this.minds[mind], dt);
      mind++;
    }
    if (this.mode === HOST) this.host(now);   // the clients' moves and shots, then the step
    this.world.step(dt);
    for (const e of this.world.events) this.say(`${e}`);
    this.watchMe();
  }

  title(c: Controls, now: number): void {
    if (!this.net.up()) return;
    if (this.net.sock === null) this.net.open(false);
    this.net.search(now);
    for (;;) {
      const m = this.net.receive();
      if (m === null) break;
      const f = m.split('|');
      if (f[0] === '!' && f.length >= 3) {
        const before = this.net.hosts.length;
        this.net.heard(f[1], parseInt(f[2]));
        if (this.net.hosts.length > before) this.say(`found ${f[1]} at ${this.net.from}:${this.net.fromPort}`);
      }
    }
    const n = this.net.hosts.length;
    if (c.up && n > 0) this.selected = (this.selected + n - 1) % n;
    if (c.down && n > 0) this.selected = (this.selected + 1) % n;
    if (this.selected >= n) this.selected = 0;
    if ((c.confirm || this.autoJoin) && n > 0) { const h = this.net.hosts[this.selected]; this.join(h.address, h.port); return; }
    if (c.host) { this.startHost(); return; }
    if (c.start) this.startSolo();
  }

  /** The local player's moves (every mode): turning, walking, strafing, the paint gun. */
  moveMe(dt: number, c: Controls): void {
    const me = this.me;
    if (me === null || me.dead || this.world.pause > 0) return;
    me.angle = wrapAngle(me.angle + c.turn * TURN_SPEED * dt);
    const ca = Math.cos(me.angle), sa = Math.sin(me.angle);
    const f = c.forward * MOVE_SPEED * dt, s = c.strafe * STRAFE_SPEED * dt;
    this.world.slide(me, ca * f - sa * s, sa * f + ca * s);
    if (!c.fire) return;
    if (this.mode === CLIENT) {
      if (me.cooldown > 0) return;
      me.cooldown = FIRE_COOLDOWN;
      me.shots++;
      this.world.events.push(`fire ${me.id}`);
    } else this.world.fire(me);
  }
  /** The screen flashes in the shooter's paint when the local player is splatted. */
  watchMe(): void {
    const me = this.me;
    if (me !== null && me.dead && this.splats !== me.spawns) { this.splats = me.spawns; this.flash = 0.5; }
  }

  // ------------------------------------------------------------------ the host's side
  host(now: number): void {
    for (;;) {
      const m = this.net.receive();
      if (m === null) break;
      const f = m.split('|');
      const k = f[0];
      if (k === '?') this.net.send(this.net.from, this.net.fromPort, `!|${this.name}|${this.world.players.length}`);
      else if (k === 'J' && f.length >= 2) this.admit(clean(f[1]), now);
      else if (k === 'I' && f.length >= 7) this.input(f, now);
      else if (k === 'L' && f.length >= 2) {
        const p = this.world.player(parseInt(f[1]));
        if (p !== null && p.address === this.net.from) { this.say(`left ${p.id}`); this.world.remove(p.id); this.fillBots(); }
      }
    }
    const dropped: i32[] = [];
    for (const p of this.world.players) if (p.port > 0 && now - p.heardAt > TIMEOUT_MS) dropped.push(p.id);
    for (const id of dropped) { this.say(`timeout ${id}`); this.world.remove(id); }
    if (dropped.length > 0) this.fillBots();
    if (now - this.snapshotAt < SNAPSHOT_MS) return;
    this.snapshotAt = now;
    const snap = this.snapshot();
    for (const p of this.world.players) if (p.port > 0) this.net.send(p.address, p.port, snap);
  }
  admit(name: string, now: number): void {
    for (const p of this.world.players) {   // a join sent twice: the same player
      if (p.address === this.net.from && p.port === this.net.fromPort) { this.net.send(p.address, p.port, `W|${p.id}`); return; }
    }
    let humans = 0;
    for (const p of this.world.players) if (!p.bot) humans++;
    if (humans >= MAX_PLAYERS) { this.net.send(this.net.from, this.net.fromPort, 'F'); return; }
    const p = this.world.add(name);
    p.address = this.net.from;
    p.port = this.net.fromPort;
    p.heardAt = now;
    this.fillBots();
    this.net.send(p.address, p.port, `W|${p.id}`);
    this.say(`joined ${p.id} ${name} from ${p.address}`);
  }
  input(f: string[], now: number): void {
    const p = this.world.player(parseInt(f[1]));
    if (p === null || p.address !== this.net.from || p.port !== this.net.fromPort) return;
    p.heardAt = now;
    // a position from before the last respawn is stale: the client has not seen its new place yet
    if (!p.dead && parseInt(f[6]) === p.spawns) {
      const x = unit(f[2]), y = unit(f[3]);
      if (!this.world.blocked(x, y)) { p.x = x; p.y = y; }
      p.angle = unit(f[4]);
    }
    const shots = parseInt(f[5]);
    let fresh = Math.min(2, shots - p.shots);
    p.shots = shots;
    for (; fresh > 0; fresh--) { p.cooldown = 0; this.world.fire(p); }   // the client keeps the gun's pace: none is dropped here
  }
  snapshot(): string {
    let ps = '', bs = '';
    for (const p of this.world.players) {
      ps += `${p.id},${p.name},${hundredths(p.x)},${hundredths(p.y)},${hundredths(p.angle)},${p.score},${p.dead ? 1 : 0},${p.spawns},${p.splatBy};`;
    }
    for (const b of this.world.balls) bs += `${hundredths(b.x)},${hundredths(b.y)},${hundredths(b.dx)},${hundredths(b.dy)},${b.owner};`;
    return `S|${this.world.winner}|${Math.round(this.world.pause * 10)}|${ps}|${bs}`;
  }

  // ------------------------------------------------------------------ the client's side
  client(dt: number, now: number): void {
    for (;;) {
      const m = this.net.receive();
      if (m === null) break;
      if (this.net.fromPort !== this.hostPort) continue;   // the host's port (its address may read as loopback or the LAN one)
      const f = m.split('|');
      if (f[0] === 'W' && f.length >= 2 && !this.joined) {
        this.joined = true;
        this.heardAt = now;
        const p = new Player(parseInt(f[1]), this.name);
        this.world.players.push(p);
        this.me = p;
        this.say(`welcome ${p.id}`);
      } else if (f[0] === 'S' && f.length >= 5 && this.joined) {
        this.heardAt = now;
        this.apply(f);
      } else if (f[0] === 'F') { this.leave('the match is full'); return; }
    }
    if (!this.joined) {
      if (now - this.joinStartedAt > 6000) { this.leave(`no answer from ${this.hostAddress}`); return; }
      if (now - this.joinSentAt > 500) { this.joinSentAt = now; this.net.send(this.hostAddress, this.hostPort, `J|${this.name}`); }
      return;
    }
    if (now - this.heardAt > TIMEOUT_MS) { this.leave('the host went away'); return; }
    const me = this.me;
    if (me !== null && me.cooldown > 0) me.cooldown -= dt;
    // the others move towards where the host saw them; the balls fly on between snapshots
    const k = Math.min(1, dt * 12);
    for (const p of this.world.players) {
      if (p === me) continue;
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.angle = wrapAngle(p.angle + wrapAngle(p.ta - p.angle) * k);
    }
    for (const b of this.world.balls) { b.x += b.dx * dt; b.y += b.dy * dt; }
    if (me !== null && now - this.inputAt >= INPUT_MS) {
      this.inputAt = now;
      this.net.send(this.hostAddress, this.hostPort, `I|${me.id}|${hundredths(me.x)}|${hundredths(me.y)}|${hundredths(me.angle)}|${me.shots}|${me.spawns}`);
    }
    this.watchMe();
  }
  apply(f: string[]): void {
    const w = this.world;
    const winner = parseInt(f[1]);
    if (winner >= 0 && w.winner < 0) { w.events.push(`win ${winner}`); this.say(`win ${winner}`); }
    w.winner = winner;
    w.pause = parseInt(f[2]) / 10;
    const seen: i32[] = [];
    for (const rec of f[3].split(';')) {
      if (rec.length === 0) continue;
      const v = rec.split(',');
      if (v.length < 9) continue;
      const id = parseInt(v[0]);
      seen.push(id);
      let p = w.player(id);
      const fresh = p === null;
      if (p === null) { p = new Player(id, v[1]); w.players.push(p); }
      const x = unit(v[2]), y = unit(v[3]), a = unit(v[4]);
      const wasDead = p.dead;
      p.name = v[1];
      p.score = parseInt(v[5]);
      p.dead = v[6] === '1';
      p.splatBy = parseInt(v[8]);
      const spawns = parseInt(v[7]);
      if (p === this.me) {
        if (spawns !== p.spawns) { p.x = x; p.y = y; p.angle = a; p.spawns = spawns; this.say(`spawn ${id}`); }
      } else {
        p.tx = x; p.ty = y; p.ta = a;
        if (fresh || spawns !== p.spawns) { p.x = x; p.y = y; p.angle = a; }
        p.spawns = spawns;
      }
      if (p.dead && !wasDead) { this.world.events.push(`hit ${p.splatBy} ${id}`); this.say(`hit ${p.splatBy} ${id}`); }
    }
    const kept: Player[] = [];
    for (const p of w.players) if (seen.indexOf(p.id) >= 0) kept.push(p);
    if (kept.length !== w.players.length || seen.length !== this.seenCount) this.say(`players ${seen.length}`);
    this.seenCount = seen.length;
    w.players = kept;
    const balls: Ball[] = [];
    for (const rec of f[4].split(';')) {
      if (rec.length === 0) continue;
      const v = rec.split(',');
      if (v.length >= 5) balls.push(new Ball(unit(v[0]), unit(v[1]), unit(v[2]), unit(v[3]), parseInt(v[4])));
    }
    w.balls = balls;
  }
}
