// The generator's hash and value noise: integer arithmetic only (no sin), so a seed gives the same village on every engine and CPU.
export function hash(x: number, y: number): number {
  let h = (Math.imul(Math.floor(x) | 0, 374761393) + Math.imul(Math.floor(y) | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = h ^ (h >>> 13);
  return (h >>> 0) / 4294967296;
}
export function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, fx = u * u * (3 - 2 * u), fy = v * v * (3 - 2 * v);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}
