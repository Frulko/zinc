// tokyo: Pocket Tokyo's flight over the Shiba district around Tokyo Tower (pocket-nexus/pocket-tokyo, MIT), drawn by zinc:3d. The city is
// the original's cooked pack turned into glTF (tools/city-gltf.py) and imported by the asset build; the tour, the clock and the sun are
// ported from its tokyo-sim crate. The same program runs on a desktop, the PS Vita, the PSP and the 3DS; src/devices.ts holds what differs.
// The control panel (src/panel.ts) is the 3DS's touch screen, an overlay that SELECT opens elsewhere.
import { onFrame, openWindow, keep, width, height, clear, drawText, font, textWidth } from 'zinc:gfx';
import { clock, env, platform } from 'zinc:sys';
import { Scene, Camera, Fog, gpu } from 'zinc:3d';
import { stereoEye, stereoDepth } from 'zinc:hardware';
import { Stage, clearTouchZones } from 'zinc:stage';
import { City } from './city';
import { Sky } from './sky';
import { Flight } from './flight';
import { Pad } from './input';
import { Hud } from './hud';
import { Panel } from './panel';
import { Settings } from './settings';
import { currentDevice } from './devices';
import { DAY_OF_YEAR, NEAR_PLANE, FAR_PLANE, PANEL_W, PANEL_H, PANEL_BG, STEREO_SPREAD } from './constants';

const dev = currentDevice();
const scene = new Scene();
const city = new City(scene, dev);
const sky = new Sky(scene, dev.dome);
const flight = new Flight(city);
if (env('ZINC_TOKYO_HOUR') !== '') flight.hour = parseFloat(env('ZINC_TOKYO_HOUR'));   // to look at an hour without waiting for it
const pad = new Pad();
const hud = new Hud();
const camera = new Camera();
camera.near = NEAR_PLANE;
camera.far = FAR_PLANE;
const credit = city.credits.length > 0 ? 'PLATEAU (MLIT), GSI, (c) OpenStreetMap contributors' : '';
// the haze: the sky's colour at the horizon (set again each frame), from the device's start to its end
scene.fog = new Fog(0, dev.fogStart, dev.fogEnd);
const LOADING = font('sans-bold', 14);
const settings = new Settings(dev, city, scene, flight, hud);
const touch = platform() === 'n3ds';   // the panel on the touch screen, else an overlay
const panel = new Panel(settings, flight, city, hud, touch);
const stage = new Stage();
stage.color = PANEL_BG;
stage.addChild(panel);
// ZINC_TOKYO_TAP=<frame>:<x>:<y>[/<frame>:<x>:<y>...]: touches of the panel at (x, y), that many frames after the loading, in order (the
// consoles' scripted runs: their input scripts hold buttons, not the stylus); the overlay opens first
const taps = env('ZINC_TOKYO_TAP').split('/');
let tapAt: string[] = [], tapNext: i32 = 0;
function nextTap(): i32 {
  tapAt = tapNext < taps.length ? taps[tapNext++].split(':') : [];
  return tapAt.length === 3 ? parseInt(tapAt[0], 10) : -1;
}
if (env('ZINC_TOKYO_STEREO') === '1') settings.toggleStereo();   // to measure the stereo picture without touching the panel
if (env('ZINC_TOKYO_SHADOWS') === '0') settings.toggleShadows();   // to see and measure the city without its shadows
let tapFrame: i32 = nextTap(), ran: i32 = 0, settled: i32 = 0, eye: i32 = 0, panelMs = 0;
// where the eye will be: in 2 and 4 seconds in flight, in 4 and 8 seconds behind the loading screen (the chunks to read for them)
const ahead: number[] = [0, 0, 0, 0, 0, 0];
const spot: number[] = [0, 0, 0];
function aheadAt(k: i32, s: number): void { flight.ahead(s, spot); ahead[k * 3] = spot[0]; ahead[k * 3 + 1] = spot[1]; ahead[k * 3 + 2] = spot[2]; }
let loading = true, loaded: i32 = 0, frame: i32 = 0, warm: i32 = -1;
const WARM_FRAMES: i32 = 3;   // frames of the city rendered behind the loading screen once its chunks are read
// the first 300 frames after the loading, measured by the device's clock and printed once (docs/reports/tokyo-per-device.md)
const works: number[] = [];
const worstParts: number[] = [0, 0, 0, 0];   // the slowest frame: its work, read, select and render
let inRead = 0, inSelect = 0, inRender = 0, loadsBefore: i32 = 0, drawSum = 0, triSum = 0, panelBefore = 0;
function measure(readMs: number, selectMs: number, renderMs: number, workMs: number): void {
  if (works.length >= 300) return;
  const world = city.world;
  if (works.length === 0) panelBefore = panelMs;
  if (works.length === 0 || workMs > worstParts[0]) { worstParts[0] = workMs; worstParts[1] = readMs; worstParts[2] = selectMs; worstParts[3] = renderMs; }
  works.push(workMs); inRead += readMs; inSelect += selectMs; inRender += renderMs; drawSum += world.draws; triSum += world.triangles;
  if (works.length < 300) return;
  const s = works.slice(0).sort((a: number, b: number): number => a - b), f = (v: number): string => v.toFixed(1);
  let worst: i32 = 0;
  for (let i: i32 = 1; i < 300; i++) if (works[i] > works[worst]) worst = i;
  console.log(`tokyo: ${dev.name}, 300 frames after the loading: work p50 ${f(s[150])} p95 ${f(s[285])} max ${f(s[299])} ms (frame ${worst}: read ${f(worstParts[1])}, select ${f(worstParts[2])}, render ${f(worstParts[3])}); ` +
    `read ${f(inRead / 300)}, select ${f(inSelect / 300)}, render ${f(inRender / 300)}, panel ${(Math.max(0, panelMs - panelBefore) / 300).toFixed(2)} ms a frame; ` +
    `${city.loads - loadsBefore} chunks read; ` +
    `${Math.round(triSum / 300)} triangles and ${Math.round(drawSum / 300)} draws a frame, reaches at ${world.reachScale.toFixed(2)}`);
}
/** The camera at the flight's eye; in stereo, `side` (-1 the left eye, 1 the right one) moves it aside by half the spread. */
function aim(side: number): void {
  camera.fov = flight.fov;
  const l = flight.look, r = Math.sqrt(l[0] * l[0] + l[2] * l[2]) || 1, s = side * 0.5 * STEREO_SPREAD * Math.max(0, stereoDepth());
  const dx = side === 0 ? 0 : -l[2] / r * s, dz = side === 0 ? 0 : l[0] / r * s;
  camera.setPosition(flight.eye[0] + dx, flight.eye[1], flight.eye[2] + dz).lookAt(flight.target[0] + dx, flight.target[1], flight.target[2] + dz);
}

// the touch screen: drawn when the panel has changed (else the last picture stays), once per pair of eyes
if (touch) openWindow('Touch screen', PANEL_W, PANEL_H, (dt: number) => {
  if (eye !== 0) { keep(); return; }
  const t = clock();
  stage.frame(dt);
  panelMs += clock() - t;
});

onFrame((dt: number) => {
  // the opening: the chunks the first view and the tour's next seconds want, the far level of the whole city first, read behind a loading
  // screen (a slice of time a frame, so the screen keeps drawing); then each frame reads what the eye will want, before it is in view
  frame++;
  // the 3D target first, before the city's pictures fill the GPU memory of the Vita and the 3DS (made after them, it found no room)
  if (frame === 1) camera.render(scene, 0, 0, width(), height());
  if (frame === 2) panel.prepare();   // the map picture, behind the loading screen
  const w = width(), h = height();
  if (loading || warm > 0) {
    aim(0); aheadAt(0, 4); aheadAt(1, 8);
    // the hour's night before the chunks load: a renderer sends their night pictures to the GPU only once the dusk has begun (the 3DS)
    sky.update(scene, flight.hour, DAY_OF_YEAR, flight.eye, FAR_PLANE * 0.8);
    city.setNight(dev.night ? sky.night : 0);
    if (!loading) {
      // the first frames of the city drawn behind the loading screen: their pictures, palettes, shadows and lists made before the flight
      // (the first frame after the loading took 26 to 62 ms on the consoles)
      const fog = scene.fog;
      if (fog !== null) fog.color = scene.background;
      city.select(camera, w / h, ahead, 0);
      city.serve(dev.readMs);
      camera.render(scene, 0, 0, w, h);
      if (--warm === 0) loadsBefore = city.loads;
    }
    const started = clock();
    while (loading && clock() - started < 30) {
      city.select(camera, w / h, ahead, 0);
      if (city.complete()) loading = false;
      else {
        const wanted = city.world.missing.length, n = city.serve(30 - (clock() - started));
        loaded += n;
        // some on their way from the reader thread (the card, a console's other core): the frame ends, the thread reads while it waits
        if (n < wanted) break;
      }
    }
    if (!loading && warm < 0) { console.log(`tokyo: ${loaded} chunks read in ${frame} frames`); warm = WARM_FRAMES; }
    clear(0x0b0d14);
    const text = `Pocket Tokyo  ${loaded} chunks`;
    drawText(LOADING, (width() - textWidth(LOADING, text, 0)) / 2, height() / 2 - 8, text, 0xf4f4f5, 255, 0);
    return;
  }
  // the right eye of a stereo picture: the same frame, seen from beside
  eye = settings.stereo ? stereoEye() : 0;
  if (eye === 1) {
    aim(1);
    camera.render(scene, 0, 0, w, h);
    hud.draw(w, h, credit);
    return;
  }
  const t0 = clock();
  pad.read();
  ran++;
  if (touch) { if (pad.menu) hud.visible = !hud.visible; }
  else {
    if (pad.menu || (panel.shown && pad.back) || (tapFrame >= 0 && ran >= tapFrame && !panel.shown)) {
      panel.shown = !panel.shown;
      if (!panel.shown) clearTouchZones();
    }
    if (panel.shown) { panel.navigate(pad.step, pad.press); pad.still(); stage.update(dt); }
  }
  if (tapFrame >= 0 && ran > tapFrame && panel.tapAt(parseFloat(tapAt[1]), parseFloat(tapAt[2]))) {
    console.log(`tokyo: tapped ${tapAt[1]}, ${tapAt[2]} at ${ran}`);
    tapFrame = nextTap();
  }
  flight.step(city, pad, dt);
  // a flight to a place: once the eye has been there for half a second, where it is (the scripted runs check it arrived)
  const there = flight.arrived;
  if (there === null) settled = 0;
  else if (++settled === 30) {
    const e = there.eye, d = Math.sqrt((flight.eye[0] - e[0]) ** 2 + (flight.eye[1] - e[1]) ** 2 + (flight.eye[2] - e[2]) ** 2);
    console.log(`tokyo: at ${there.name}, ${flight.touring ? 'on the tour' : 'free flight'}, ${d.toFixed(1)} m from its view`);
  }
  sky.update(scene, flight.hour, DAY_OF_YEAR, flight.eye, FAR_PLANE * 0.8);
  const fog = scene.fog;
  if (fog !== null) fog.color = scene.background;
  city.setNight(dev.night ? sky.night : 0);
  aim(settings.stereo ? -1 : 0); aheadAt(0, 2); aheadAt(1, 4);
  const t1 = clock();
  city.select(camera, w / h, ahead, dt);
  const t2 = clock();
  city.serve(dev.readMs);
  const started = clock();
  camera.render(scene, 0, 0, w, h);
  const t3 = clock();
  measure(started - t2, t2 - t1, t3 - started, t3 - t0);
  hud.frame(dt, t3 - started, city.world.triangles, gpu(), dev.name, flight.hour, flight.touring);
  hud.draw(w, h, credit);
  if (!touch && panel.shown) {
    const t = clock();
    stage.drawIn(w - PANEL_W - 4, Math.max(0, (h - PANEL_H) / 2), PANEL_W, PANEL_H);
    panelMs += clock() - t;
  }
});
