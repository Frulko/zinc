// Where the numbers come from. MockSource makes believable ones (a seeded random walk), so the dashboard runs anywhere; a real source implements Source.
export class Sample {
  t: number;          // seconds since the start
  cpu: number;        // percent
  memory: number;     // percent
  requests: number;   // per second
  errors: i32;        // in this sample
  constructor(t: number, cpu: number, memory: number, requests: number, errors: i32) { this.t = t; this.cpu = cpu; this.memory = memory; this.requests = requests; this.errors = errors; }
}

export interface Source {
  /** The samples that arrived during the last dt seconds (often none, sometimes several). */
  poll(dt: number): Sample[];
}

export const RATE = 4;   // samples per second

export class MockSource implements Source {
  t: number = 0;
  acc: number = 0;
  seed: number;
  cpu: number = 35; memory: number = 52; requests: number = 120;
  constructor(seed: number) { this.seed = seed; }
  random(): number { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  walk(v: number, spread: number, mid: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v + (this.random() - 0.5) * spread + (mid - v) * 0.05)); }
  poll(dt: number): Sample[] {
    const out: Sample[] = [];
    this.acc += dt * RATE;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.t += 1 / RATE;
      this.cpu = this.walk(this.cpu, 18, 40, 2, 99);
      this.memory = this.walk(this.memory, 3, 55, 20, 95);
      this.requests = this.walk(this.requests, 40, 130, 0, 400);
      out.push(new Sample(this.t, this.cpu, this.memory, this.requests, this.random() < 0.08 ? 1 + Math.floor(this.random() * 3) : 0));
    }
    return out;
  }
}
