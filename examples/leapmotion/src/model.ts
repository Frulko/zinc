export function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }

/** Test the entire blade movement: a fast hand must not skip a fruit between two frames. */
export function cuts(ax: number, ay: number, bx: number, by: number, x: number, y: number, radius: number): boolean {
  return cutTime(ax, ay, bx, by, x, y, radius) >= 0;
}
/** First contact within this frame; -1 means no moving blade contact. */
export function cutTime(ax: number, ay: number, bx: number, by: number, x: number, y: number, radius: number): number {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  if (length < 9) return -1;
  const ex = ax - x, ey = ay - y, c = ex * ex + ey * ey - radius * radius;
  if (c <= 0) return 0;
  const b = ex * dx + ey * dy, discriminant = b * b - length * c;
  if (discriminant < 0) return -1;
  const t = (-b - Math.sqrt(discriminant)) / length;
  return t >= 0 && t <= 1 ? t : -1;
}
export class Blade {
  ax: number = 0;
  ay: number = 0;
  x: number = 0;
  y: number = 0;
  active: boolean = false;
  continuous: boolean = false;
  trail: number[] = [];
  private device: number = -1;
  private hand: number = -1;
  move(x: number, y: number, active: boolean, device: number, hand: number): void {
    this.continuous = active && this.active && device === this.device && hand === this.hand;
    this.ax = this.continuous ? this.x : x; this.ay = this.continuous ? this.y : y;
    this.x = x; this.y = y; this.active = active; this.device = device; this.hand = hand;
    if (!this.continuous) this.trail = [];
    if (active) { this.trail.push(x); this.trail.push(y + 170); if (this.trail.length > 24) this.trail.splice(0, 2); }
  }
}
export class FruitScore {
  score: number = 0;
  combo: number = 0;
  bombs: number = 0;
  comboIn: number = 0;
}

export class Fruit {
  age: number = 0;
  cut: boolean = false;
  split: number = 0;
  angle: number = 0;
  constructor(public x: number, public y: number, public vx: number, public vy: number, public kind: number, public r: number) {}
}
export class Spark {
  life: number = 1;
  constructor(public x: number, public y: number, public vx: number, public vy: number, public color: u32) {}
}
export const COLORS: u32[] = [0xff6b75, 0xffba55, 0xff6070, 0xa3d64d];
export class Game {
  fruits: Fruit[] = [];
  sparks: Spark[] = [];
  multiplayer: boolean = false;
  players: FruitScore[] = [new FruitScore(), new FruitScore()];
  best: number = 0;
  missed: number = 0;
  remaining: number = 60;
  running: boolean = false;
  flash: number = 0;
  popup: string = '';
  popupTime: number = 0;
  private seed: number = 19;
  private spawnIn: number = 0;
  private tiePlayer: number = 0;
  random(): number { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  start(): void {
    this.fruits = []; this.sparks = []; this.players = [new FruitScore(), new FruitScore()]; this.missed = 0;
    this.remaining = 60; this.running = true; this.spawnIn = 0; this.tiePlayer = 0; this.flash = 0; this.popupTime = 0;
  }
  update(dt: number, blades: Blade[]): void {
    this.flash = Math.max(0, this.flash - dt * 3); this.popupTime = Math.max(0, this.popupTime - dt);
    for (const player of this.players) { player.comboIn -= dt; if (player.comboIn <= 0) player.combo = 0; }
    if (this.running) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining === 0) this.running = false;
      this.spawnIn -= dt;
      if (this.spawnIn <= 0 && this.running) {
        this.spawnIn = 0.65 + this.random() * 0.3;
        const count = this.random() > 0.55 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const x = 180 + this.random() * 420;
          const kind = this.random() < 0.11 ? 4 : Math.floor(this.random() * 4);
          this.fruits.push(new Fruit(x, 590 + i * 20, (420 - x) * 0.25 + (this.random() - 0.5) * 130, -420 - this.random() * 130, kind, 30 + this.random() * 8));
        }
      }
    }
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i];
      f.age += dt; f.vy += 390 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.angle += dt * (f.kind % 2 === 0 ? 0.8 : -0.9);
      if (f.cut) f.split += dt;
      else if (this.running) {
        let owner = -1, first = 2;
        for (let p = 0; p < Math.min(blades.length, this.multiplayer ? 2 : 1); p++) {
          const blade = blades[p];
          if (!blade.active || !blade.continuous) continue;
          const hit = cutTime(blade.ax, blade.ay, blade.x, blade.y, f.x, f.y, f.r + 5);
          if (hit >= 0 && (hit < first || hit === first && p === this.tiePlayer)) { owner = p; first = hit; }
        }
        if (owner >= 0) {
          const player = this.players[owner]; this.tiePlayer = 1 - owner;
          f.cut = true; player.comboIn = 0.65;
          if (f.kind === 4) { player.bombs++; player.score = Math.max(0, player.score - 30); player.combo = 0; this.flash = 1; this.popup = 'OUPS !  -30'; }
          else { player.combo++; const points = 10 * Math.min(5, player.combo); player.score += points; this.popup = player.combo > 1 ? `${player.combo} FRUITS !  +${points}` : '+10'; }
          if (this.multiplayer) this.popup = `J${owner + 1}  ${this.popup}`;
          this.best = Math.max(this.best, player.score); this.popupTime = 0.8;
          for (let j = 0; j < 12; j++) {
            const a = this.random() * Math.PI * 2, v = 70 + this.random() * 180;
            this.sparks.push(new Spark(f.x, f.y, Math.cos(a) * v, Math.sin(a) * v, f.kind === 4 ? 0xffffff : COLORS[f.kind]));
          }
          if (this.sparks.length > 100) this.sparks.splice(0, this.sparks.length - 100);
        }
      }
      if (f.y > 680 || f.split > 0.85) {
        if (!f.cut && f.kind !== 4 && this.running) this.missed++;
        this.fruits.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i]; p.life -= dt * 1.6; p.vy += dt * 350; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) this.sparks.splice(i, 1);
    }
  }
}

export class InkStroke {
  points: number[] = [];
  constructor(public color: u32, public width: number) {}
}
export class Ink {
  strokes: InkStroke[] = [];
  drawing: boolean = false;
  private points: number = 0;
  update(x: number, y: number, down: boolean, color: u32, width: number): void {
    if (!down) { this.drawing = false; return; }
    if (!this.drawing) {
      this.strokes.push(new InkStroke(color, width)); this.drawing = true;
    }
    const stroke = this.strokes[this.strokes.length - 1], p = stroke.points;
    if (p.length > 0 && Math.abs(p[p.length - 2] - x) + Math.abs(p[p.length - 1] - y) < 2) return;
    p.push(x); p.push(y); this.points++;
    // Bound both a long stroke and the whole page. Lifting starts a fresh stroke after the oldest one is retired.
    if (p.length >= 1600) this.drawing = false;
    while (this.points > 6000 || this.strokes.length > 120) {
      this.points -= this.strokes[0].points.length / 2; this.strokes.shift();
    }
  }
  undo(): void {
    if (this.strokes.length > 0) { this.points -= this.strokes[this.strokes.length - 1].points.length / 2; this.strokes.pop(); }
    this.drawing = false;
  }
  clear(): void { this.strokes = []; this.points = 0; this.drawing = false; }
}
