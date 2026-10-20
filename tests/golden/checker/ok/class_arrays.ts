class P {
  x: f64;
  y: f64;
  constructor(x: f64, y: f64) { this.x = x; this.y = y; }
  dist(o: P): f64 {
    const dx: f64 = this.x - o.x;
    const dy: f64 = this.y - o.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
const pts: P[] = [new P(0, 0), new P(3, 4)];
let far: f64 = 0;
for (const p of pts) far = Math.max(far, p.dist(pts[0]));
console.log(far.toFixed(2));
