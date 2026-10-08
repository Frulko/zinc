// Where the moving things are at time t (seconds): plain numbers, so the tests can check them without a renderer.
export class Orbit {
  radius: number; speed: number; phase: number; height: number;
  constructor(radius: number, speed: number, phase: number, height: number) { this.radius = radius; this.speed = speed; this.phase = phase; this.height = height; }
  x(t: number): number { return Math.cos(this.phase + t * this.speed) * this.radius; }
  z(t: number): number { return Math.sin(this.phase + t * this.speed) * this.radius; }
  /** A gentle bob up and down around the orbit's height. */
  y(t: number): number { return this.height + Math.sin(t * 2 + this.phase) * 0.15; }
}

export const ORBITS: Orbit[] = [new Orbit(2.4, 0.9, 0, 0.6), new Orbit(3.2, 0.6, 2.1, 0.9), new Orbit(4.0, 0.4, 4.2, 0.4)];

/** The ring's spin around y: one turn every `period` seconds. */
export function spin(t: number, period: number): number { return (t / period) * Math.PI * 2; }
