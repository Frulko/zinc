// nbody: Benchmarks Game n-body kernel (sun + 4 planets), advance() loop.
// Step count tuned down from the canonical 50,000,000 so the interpreted
// engines (QuickJS) finish in reasonable time; see docs/reports/PERF.md.
const STEPS: i32 = 600000;
const SOLAR_MASS: number = 4 * Math.PI * Math.PI;
const DAYS_PER_YEAR: number = 365.24;

class Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  mass: number;
  constructor(x: number, y: number, z: number, vx: number, vy: number, vz: number, mass: number) {
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.mass = mass;
  }
}

const bodies: Body[] = [
  new Body(0, 0, 0, 0, 0, 0, SOLAR_MASS),
  new Body(
    4.84143144246472090e+00, -1.16032004402742839e+00, -1.03622044471123109e-01,
    1.66007664274403694e-03 * DAYS_PER_YEAR, 7.69901118419740425e-03 * DAYS_PER_YEAR, -6.90460016972063023e-05 * DAYS_PER_YEAR,
    9.54791938424326609e-04 * SOLAR_MASS,
  ),
  new Body(
    8.34336671824457987e+00, 4.12479856412430479e+00, -4.03523417114321381e-01,
    -2.76742510726862411e-03 * DAYS_PER_YEAR, 4.99852801234917238e-03 * DAYS_PER_YEAR, 2.30417297573763929e-05 * DAYS_PER_YEAR,
    2.85885980666130812e-04 * SOLAR_MASS,
  ),
  new Body(
    1.28943695621391310e+01, -1.51111514016986312e+01, -2.23307578892655734e-01,
    2.96460137564761618e-03 * DAYS_PER_YEAR, 2.37847173959480950e-03 * DAYS_PER_YEAR, -2.96589568540237556e-05 * DAYS_PER_YEAR,
    4.36624404335156298e-05 * SOLAR_MASS,
  ),
  new Body(
    1.53796971148509165e+01, -2.59193146099879641e+01, 1.79258772950371181e-01,
    2.68067772490389322e-03 * DAYS_PER_YEAR, 1.62824170038242295e-03 * DAYS_PER_YEAR, -9.51592254519715870e-05 * DAYS_PER_YEAR,
    5.15138902046611451e-05 * SOLAR_MASS,
  ),
];

function offsetMomentum(): void {
  let px: number = 0, py: number = 0, pz: number = 0;
  for (const b of bodies) { px += b.vx * b.mass; py += b.vy * b.mass; pz += b.vz * b.mass; }
  bodies[0].vx = -px / SOLAR_MASS;
  bodies[0].vy = -py / SOLAR_MASS;
  bodies[0].vz = -pz / SOLAR_MASS;
}

function advance(dt: number): void {
  const n: i32 = bodies.length;
  for (let i: i32 = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j: i32 = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx: number = bi.x - bj.x;
      const dy: number = bi.y - bj.y;
      const dz: number = bi.z - bj.z;
      const dSq: number = dx * dx + dy * dy + dz * dz;
      const distance: number = Math.sqrt(dSq);
      const mag: number = dt / (dSq * distance);
      bi.vx -= dx * bj.mass * mag; bi.vy -= dy * bj.mass * mag; bi.vz -= dz * bj.mass * mag;
      bj.vx += dx * bi.mass * mag; bj.vy += dy * bi.mass * mag; bj.vz += dz * bi.mass * mag;
    }
  }
  for (const b of bodies) { b.x += dt * b.vx; b.y += dt * b.vy; b.z += dt * b.vz; }
}

function energy(): number {
  let e: number = 0;
  const n: i32 = bodies.length;
  for (let i: i32 = 0; i < n; i++) {
    const bi = bodies[i];
    e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);
    for (let j: i32 = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx: number = bi.x - bj.x;
      const dy: number = bi.y - bj.y;
      const dz: number = bi.z - bj.z;
      const distance: number = Math.sqrt(dx * dx + dy * dy + dz * dz);
      e -= (bi.mass * bj.mass) / distance;
    }
  }
  return e;
}

offsetMomentum();
for (let i: i32 = 0; i < STEPS; i++) advance(0.01);
console.log(energy().toFixed(9));
