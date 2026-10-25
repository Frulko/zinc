// tokyo: Pocket Tokyo's flight over the Shiba district around Tokyo Tower (pocket-nexus/pocket-tokyo, MIT), drawn by zinc:3d. The city is
// the original's cooked pack turned into glTF (tools/city-gltf.py) and imported by the asset build; the tour, the clock and the sun are
// ported from its tokyo-sim crate. The same program runs on a desktop, the PS Vita, the PSP and the 3DS; src/devices.ts holds what differs.
import { onFrame, width, height } from 'zinc:gfx';
import { clock, env } from 'zinc:sys';
import { Scene, Camera, gpu } from 'zinc:3d';
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

onFrame((dt: number) => {
  pad.read();
  if (pad.toggleHud) hud.visible = !hud.visible;
  flight.step(city, pad, dt);
  sky.update(scene, flight.hour, DAY_OF_YEAR, flight.eye, FAR_PLANE * 0.8);
  city.setNight(dev.night && sky.night > 0.5);
  const w = width(), h = height();
  camera.fov = flight.fov;
  camera.setPosition(flight.eye[0], flight.eye[1], flight.eye[2]).lookAt(flight.target[0], flight.target[1], flight.target[2]);
  // the cone of view: half the diagonal of the picture
  const half = Math.atan2(Math.tan(flight.fov * Math.PI / 360) * Math.sqrt(1 + (w * w) / (h * h)), 1);
  city.select(flight.eye, flight.look, half, dev, dt);
  const started = clock();
  camera.render(scene, 0, 0, w, h);
  hud.frame(dt, clock() - started, city.triangles, gpu(), dev.name, flight.hour, flight.touring);
  hud.draw(w, h, credit);
});
