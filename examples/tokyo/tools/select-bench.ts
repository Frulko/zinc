// The cost of zinc:3d's World.select() over Tokyo's real world, on this machine: the eye flies the tour (60 m/s at 30 frames a second,
// looking at the next stop, two points ahead), the chunks it asks for are read between the selections (not timed), and each select is timed
// alone. The hash of what every select returned proves a faster selection chooses the same.
//   zinc run --aot examples/tokyo/tools/select-bench.ts [-- frames]     ZINC_3D_PROFILE=psp: the PSP's settings (its packs have no near level)
import { Camera, World, defaults3D } from 'zinc:3d';
import { readText, readBytes } from 'zinc:assets';
import { clock, args } from 'zinc:sys';

const a = args();
const frames: i32 = a.length > 0 ? parseInt(a[0], 10) : 3000;
const d = defaults3D();
const world = new World('city/city.zworld', d);
const noNear = d.name === 'psp' || d.name === 'vita';   // the levels these consoles' packs carry (zinc.json)
const tour: number[][] = [];
for (const line of readText('city/city.txt').split('\n')) {
  const t = line.split(' ');
  if (t[0] === 'tour') tour.push([parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3]), parseFloat(t[4]), parseFloat(t[5]), parseFloat(t[6])]);
}
// the tour as a loop of segments, eye and target each moved linearly
const lens: number[] = [];
let total = 0;
for (let i = 0; i < tour.length; i++) {
  const p = tour[i], q = tour[(i + 1) % tour.length];
  const l = Math.sqrt((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2);
  lens.push(l); total += l;
}
function at(s: number, out: number[]): void {
  s = s % total;
  let i = 0;
  while (s > lens[i]) { s -= lens[i]; i++; }
  const p = tour[i], q = tour[(i + 1) % tour.length], f = lens[i] > 0 ? s / lens[i] : 0;
  for (let k = 0; k < 6; k++) out[k] = p[k] + (q[k] - p[k]) * f;
}
const camera = new Camera();
camera.fov = 55; camera.near = 4; camera.far = 6000;
const here: number[] = [0, 0, 0, 0, 0, 0], spot: number[] = [0, 0, 0, 0, 0, 0], ahead: number[] = [0, 0, 0, 0, 0, 0];
function serve(): void {
  for (const k of world.unused) world.free(k);
  for (const k of world.missing) if (!noNear || !near[k]) world.load(k);
}
// each chunk's level, from the index (include/zn/zworld.h): the near ones are left unread where the console's packs leave them out
const near: boolean[] = [];
{
  const ix = readBytes('city/city.zworld'), u = (o: i32): i32 => ix[o] | ix[o + 1] << 8 | ix[o + 2] << 16 | ix[o + 3] << 24;
  let q: i32 = 16 + u(8) * 44;
  for (let k = 0; k < u(12); k++) { near.push(u(q) === 0); q += 8 + ((u(q + 4) + 3) & ~3); }
}
let hash: i32 = 0, ms = 0, tris = 0;
const STEP = 2;   // metres a frame
for (let f = -60; f < frames; f++) {
  const s = Math.max(0, f) * STEP;
  at(s, here);
  camera.setPosition(here[0], here[1], here[2]).lookAt(here[3], here[4], here[5]);
  at(s + 120, spot); ahead[0] = spot[0]; ahead[1] = spot[1]; ahead[2] = spot[2];
  at(s + 240, spot); ahead[3] = spot[0]; ahead[4] = spot[1]; ahead[5] = spot[2];
  const t0 = clock();
  world.select(camera, 480 / 272, ahead, 1 / 30);
  const t1 = clock();
  if (f >= 0) {
    ms += t1 - t0; tris += world.triangles;
    hash = (Math.imul(hash, 31) + world.triangles) | 0;
    hash = (Math.imul(hash, 31) + world.draws) | 0;
    hash = (Math.imul(hash, 31) + Math.round(world.reachScale * 1000)) | 0;
    for (const k of world.missing) hash = (Math.imul(hash, 31) + k) | 0;
    for (const k of world.unused) hash = (Math.imul(hash, 31) + k + 7919) | 0;
  }
  serve();
}
console.log(`select-bench ${d.name}: ${(ms * 1000 / frames).toFixed(1)} us a select over ${frames} frames, ${Math.round(tris / frames)} triangles, hash ${hash}`);
