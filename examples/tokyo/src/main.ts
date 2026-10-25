// tokyo: Pocket Tokyo's flight over the Shiba district around Tokyo Tower (pocket-nexus/pocket-tokyo, MIT), drawn by zinc:3d. The city is
// the original's cooked pack turned into glTF (tools/city-gltf.py) and imported by the asset build; the tour, the clock and the sun are
// ported from its tokyo-sim crate. The same program runs on a desktop, the PS Vita, the PSP and the 3DS; src/devices.ts holds what differs.
import { onFrame, width, height, clear, drawText, font, textWidth } from 'zinc:gfx';
import { clock, env } from 'zinc:sys';
import { Scene, Camera, Fog, gpu } from 'zinc:3d';
import { City } from './city';
import { Sky } from './sky';
import { Flight } from './flight';
import { Pad } from './input';
import { Hud } from './hud';
import { currentDevice } from './devices';
import { DAY_OF_YEAR, NEAR_PLANE, FAR_PLANE } from './constants';

const dev = currentDevice();
const scene = new Scene();
const city = new City(scene);
const sky = new Sky(scene, dev.dome);
const flight = new Flight(city);
if (env('ZINC_TOKYO_HOUR') !== '') flight.hour = parseFloat(env('ZINC_TOKYO_HOUR'));   // to look at an hour without waiting for it
const pad = new Pad();
const hud = new Hud();
const camera = new Camera();
camera.near = NEAR_PLANE;
camera.far = FAR_PLANE;
const credit = city.credits.length > 0 ? 'PLATEAU (MLIT), GSI, (c) OpenStreetMap contributors' : '';
// the haze: the sky's colour at the horizon (set again each frame), thickening until just before the device's reach
scene.fog = new Fog(0, dev.fogStart, dev.farReach * 0.95);
const LOADING = font('sans-bold', 14);
const ahead: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
let loading = true, loaded: i32 = 0, frame: i32 = 0;
// the first 300 frames after the loading, measured by the device's clock and printed once (docs/reports/tokyo-per-device.md)
const works: number[] = [];
let inPrefetch = 0, inSelect = 0, inRender = 0, loadsBefore: i32 = 0;
function measure(prefetchMs: number, selectMs: number, renderMs: number, workMs: number): void {
  if (works.length >= 300) return;
  works.push(workMs); inPrefetch += prefetchMs; inSelect += selectMs; inRender += renderMs;
  if (works.length < 300) return;
  const s = works.slice(0).sort((a: number, b: number): number => a - b), f = (v: number): string => v.toFixed(1);
  console.log(`tokyo: ${dev.name}, 300 frames after the loading: work p50 ${f(s[150])} p95 ${f(s[285])} max ${f(s[299])} ms; ` +
    `prefetch ${f(inPrefetch / 300)}, select ${f(inSelect / 300)}, render ${f(inRender / 300)} ms a frame; ${city.loads - loadsBefore} models read`);
}

onFrame((dt: number) => {
  // the opening: every place within reach of the first view and of the tour's next seconds, read behind a loading screen (a slice of time
  // a frame, so the screen keeps drawing); then the flight reads ahead of the eye, one model every few frames, before it is in view
  frame++;
  // the 3D target first, before the city's pictures fill the GPU memory of the Vita and the 3DS (made after them, it found no room)
  if (frame === 1) camera.render(scene, 0, 0, width(), height());
  if (loading) {
    for (let i = 0; i < 3; i++) flight.ahead(i * 4, ahead[i]);
    const started = clock();
    while (loading && clock() - started < 30) { if (city.prefetch(ahead, dev)) loaded++; else loading = false; }
    if (!loading) { console.log(`tokyo: ${loaded} models read in ${frame} frames`); loadsBefore = city.loads; }
    clear(0x0b0d14);
    const text = `Pocket Tokyo  ${loaded} models`;
    drawText(LOADING, (width() - textWidth(LOADING, text, 0)) / 2, height() / 2 - 8, text, 0xf4f4f5, 255, 0);
    return;
  }
  const t0 = clock();
  if (frame % 8 === 1) { flight.ahead(4, ahead[0]); city.prefetch([ahead[0]], dev); }   // not on a frame that chooses (below)
  const t1 = clock();
  pad.read();
  if (pad.toggleHud) hud.visible = !hud.visible;
  flight.step(city, pad, dt);
  sky.update(scene, flight.hour, DAY_OF_YEAR, flight.eye, FAR_PLANE * 0.8);
  const fog = scene.fog;
  if (fog !== null) fog.color = scene.background;
  city.setNight(dev.night && sky.night > 0.5);
  const w = width(), h = height();
  camera.fov = flight.fov;
  camera.setPosition(flight.eye[0], flight.eye[1], flight.eye[2]).lookAt(flight.target[0], flight.target[1], flight.target[2]);
  // the cone of view: half the diagonal of the picture, and a margin for the turn until the next choice
  const half = Math.atan2(Math.tan(flight.fov * Math.PI / 360) * Math.sqrt(1 + (w * w) / (h * h)), 1) + 0.08 * (dev.selectEvery - 1);
  const t2 = clock();
  if (frame % dev.selectEvery === 0) city.select(flight.eye, flight.look, half, dev, dt * dev.selectEvery);
  const started = clock();
  camera.render(scene, 0, 0, w, h);
  const t3 = clock();
  measure(t1 - t0, started - t2, t3 - started, t3 - t0);
  hud.frame(dt, t3 - started, city.triangles, gpu(), dev.name, flight.hour, flight.touring);
  hud.draw(w, h, credit);
});
