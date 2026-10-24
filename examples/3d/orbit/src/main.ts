// 3d/orbit: a ringed gas giant, its moons, a space station and an asteroid belt, lit by a far sun, drawn by zinc:3d (the console's GPU
// where it has one) with a 2D readout over it. Runs unchanged on a desktop, the PSP, the PS Vita and the 3DS (in stereo there).
// Pad: the stick or the d-pad orbits, L / R zoom, Start changes the view, Triangle (Y) hides the readout. Keyboard: arrows, Btn keys.
import { onFrame, width, height } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { gpu } from 'zinc:3d';
import { stereoDepth, setStereo, stereoEye } from 'zinc:hardware';
import { Orbit, paintPlanet } from './scene';
import { OrbitCamera, VIEW_NAMES } from './view';
import { Pad } from './input';
import { Hud } from './hud';

const world = new Orbit();
const view = new OrbitCamera();
const pad = new Pad();
const hud = new Hud();
const HELP = 'Stick: orbit   L / R: zoom   START: view   Y / Triangle: readout';
const stereo = stereoDepth() >= 0 && setStereo(true);
let t = 0, painted = false;

onFrame((dt: number) => {
  if (!painted) { paintPlanet(); painted = true; }
  const eye = stereo ? stereoEye() : 0;
  if (eye === 0) {   // the world and the pad move once per picture pair
    pad.read();
    if (pad.nextView) view.nextView();
    if (pad.toggleHud) hud.visible = !hud.visible;
    t += dt;
    world.animate(t);
    view.update(dt, pad, world.station);
  }
  view.place(eye, stereo ? stereoDepth() : -1);
  const w = width(), h = height();
  const started = clock();
  const triangles = view.camera.render(world.scene, 0, 0, w, h);
  if (eye === 0) hud.frame(dt, clock() - started, triangles, gpu(), VIEW_NAMES[view.view]);
  hud.draw(w, h, HELP);
});
