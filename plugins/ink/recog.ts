// zinc:ink's recogniser, the TypeScript reference (ZN-932): a point-cloud matcher of the $P/$Q family (Vatavu, Anthony, Wobbrock;
// depts.washington.edu/acelab/proj/dollar), step for step what native/ink.abi.cpp does, so a test can compare them. See there for the algorithm.
// Everything here is pure: strokes in, distances out. The templates and the choice between this and the native matcher are in index.ts.

/** Points of a cloud. */
export const N: i32 = 32;
const STEP: i32 = 5;   // floor(sqrt(N)): the start points tried

export class Cloud {
  x: number[] = [];
  y: number[] = [];
}

/** Strokes (flat x, y pairs, one array each) -> the normalised cloud: resampled by arc length, scaled to a unit box (aspect kept), centred. */
export function normalise(strokes: number[][]): Cloud {
  const px: number[] = [], py: number[] = [], id: i32[] = [];
  for (let s = 0; s < strokes.length; s++) {
    const p = strokes[s];
    for (let i = 0; i + 1 < p.length; i += 2) {
      if (px.length > 0 && id[id.length - 1] === s && px[px.length - 1] === p[i] && py[py.length - 1] === p[i + 1]) continue;
      px.push(p[i]); py.push(p[i + 1]); id.push(s);
    }
  }
  const out = new Cloud();
  if (px.length === 0) { for (let i = 0; i < N; i++) { out.x.push(0); out.y.push(0); } return out; }
  let len = 0;
  for (let i = 1; i < px.length; i++) if (id[i] === id[i - 1]) len += Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  const rx: number[] = [px[0]], ry: number[] = [py[0]];
  if (len > 0) {
    const step = len / (N - 1);
    let D = 0, qx = px[0], qy = py[0];
    for (let i = 1; i < px.length; i++) {
      if (id[i] !== id[i - 1]) { qx = px[i]; qy = py[i]; continue; }
      for (;;) {
        const d = Math.hypot(px[i] - qx, py[i] - qy);
        if (d <= 0) break;
        if (D + d >= step) {
          const t = (step - D) / d;
          qx = qx + (px[i] - qx) * t; qy = qy + (py[i] - qy) * t;
          rx.push(qx); ry.push(qy); D = 0;
        } else { D += d; qx = px[i]; qy = py[i]; break; }
      }
    }
  }
  while (rx.length < N) { rx.push(px[px.length - 1]); ry.push(py[py.length - 1]); }
  rx.length = N; ry.length = N;
  let x0 = rx[0], x1 = rx[0], y0 = ry[0], y1 = ry[0];
  for (let i = 1; i < N; i++) { x0 = Math.min(x0, rx[i]); x1 = Math.max(x1, rx[i]); y0 = Math.min(y0, ry[i]); y1 = Math.max(y1, ry[i]); }
  let s = Math.max(x1 - x0, y1 - y0);
  if (s <= 0) s = 1;
  let cx = 0, cy = 0;
  for (let i = 0; i < N; i++) {
    const a = (rx[i] - x0) / s, b = (ry[i] - y0) / s;
    out.x.push(a); out.y.push(b); cx += a; cy += b;
  }
  cx /= N; cy /= N;
  for (let i = 0; i < N; i++) { out.x[i] -= cx; out.y[i] -= cy; }
  return out;
}

function greedy(a: Cloud, b: Cloud, start: i32, bound: number): number {
  const used: boolean[] = [];
  for (let j = 0; j < N; j++) used.push(false);
  let sum = 0, i = start;
  do {
    let best = 1e300, at = -1;
    for (let j = 0; j < N; j++) {
      if (used[j]) continue;
      const dx = a.x[i] - b.x[j], dy = a.y[i] - b.y[j], d = dx * dx + dy * dy;
      if (d < best) { best = d; at = j; }
    }
    used[at] = true;
    sum += (1.0 - ((i - start + N) % N) / N) * best;
    if (sum >= bound) return sum;
    i = (i + 1) % N;
  } while (i !== start);
  return sum;
}

/** Squared-sum distance of two clouds, abandoned (a value >= bound) once it cannot beat `bound`. */
export function cloudDistance(a: Cloud, b: Cloud, bound: number): number {
  let m = bound;
  for (let i = 0; i < N; i += STEP) { m = Math.min(m, greedy(a, b, i, m)); m = Math.min(m, greedy(b, a, i, m)); }
  return m;
}

export class Template {
  label: string;
  cloud: Cloud;
  constructor(label: string, strokes: number[][]) { this.label = label; this.cloud = normalise(strokes); }
}

/** "label distance;label distance;..." best first, as native match() answers: the distance of the strokes to each class of `classes`
 *  (comma separated, '' for all), the closest template of the class counting. */
export function match(templates: Template[], strokes: number[][], classes: string): string {
  const c = normalise(strokes);
  const want: string[] = classes === '' ? [] : classes.split(',');
  const labels: string[] = [], dist: number[] = [];
  for (const t of templates) {
    if (want.length > 0 && want.indexOf(t.label) < 0) continue;
    let k = labels.indexOf(t.label);
    if (k < 0) { labels.push(t.label); dist.push(1e300); k = labels.length - 1; }
    dist[k] = Math.min(dist[k], cloudDistance(c, t.cloud, dist[k]));
  }
  const order: i32[] = [];
  for (let i = 0; i < labels.length; i++) order.push(i);
  order.sort((a: i32, b: i32): i32 => dist[a] < dist[b] ? -1 : dist[a] > dist[b] ? 1 : a - b);   // stable, like the native stable_sort
  let out = '';
  for (const k of order) out += labels[k] + ' ' + Math.sqrt(dist[k]) + ';';
  return out;
}
