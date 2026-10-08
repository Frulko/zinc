// The rules of the game, without drawing or input: what tests/world.test.ts checks.
export const SPEED = 180;      // px per second
export const ROUND = 30;       // seconds per game
export const PLAYER = 32;      // sprite sizes in px
export const COIN = 20;

export class Coin {
  x: number; y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}

export class World {
  w: number; h: number;
  x: number; y: number;         // the player's top-left corner
  score: i32 = 0;
  time: number = ROUND;
  coins: Coin[] = [];
  seed: number;                 // a seeded generator: the same game every time for a given seed

  constructor(w: number, h: number, seed: number) {
    this.w = w; this.h = h;
    this.x = (w - PLAYER) / 2; this.y = (h - PLAYER) / 2;
    this.seed = seed;
    for (let i = 0; i < 5; i++) this.coins.push(this.spawn());
  }

  random(): number {   // Park-Miller: exact in a double
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  spawn(): Coin { return new Coin(16 + this.random() * (this.w - COIN - 32), 56 + this.random() * (this.h - COIN - 72)); }

  /** Moves the player by (dx, dy), each -1..1, for dt seconds and collects the coins it touches. False once the time is up. */
  step(dx: number, dy: number, dt: number): boolean {
    this.time = Math.max(0, this.time - dt);
    this.x = Math.max(0, Math.min(this.w - PLAYER, this.x + dx * SPEED * dt));
    this.y = Math.max(40, Math.min(this.h - PLAYER, this.y + dy * SPEED * dt));
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.x < this.x + PLAYER && c.x + COIN > this.x && c.y < this.y + PLAYER && c.y + COIN > this.y) {
        this.score++;
        this.coins[i] = this.spawn();
      }
    }
    return this.time > 0;
  }
}
