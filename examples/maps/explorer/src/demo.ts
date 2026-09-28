// ZINC_MAP_DEMO=1: a scripted benchmark. Six phases of 120 frames (load, pan, zoom in, pan, zoom out, pan) each
// print their average and worst frame time plus the map's tile statistics, then the app quits.
import { quit, width, height } from 'zinc:gfx';
import { env, clock } from 'zinc:sys';
import { map, PANEL_WIDTH } from './map';

export const demoMode = env('ZINC_MAP_DEMO') !== '';

const FRAMES_PER_PHASE = 120;
const PHASES: string[] = ['load z14', 'pan z14', 'zoom to 15', 'pan z15', 'zoom to 12', 'pan z12'];

let frame: i32 = 0;
let phaseStart = 0, phaseWorst = 0, phaseFrames: i32 = 0, lastClock = 0;

/** Called once per frame when demoMode is on. */
export function demoStep(): void {
  const now = clock();
  const frameMs = lastClock > 0 ? now - lastClock : 0;
  lastClock = now;
  const phase: i32 = Math.floor(frame / FRAMES_PER_PHASE);
  const k = frame % FRAMES_PER_PHASE;
  if (phase >= PHASES.length) { quit(); return; }
  if (k === 0) { phaseStart = now; phaseWorst = 0; phaseFrames = 0; map.stats(); }
  const cx = (width() - PANEL_WIDTH) / 2, cy = height() / 2;
  if (phase === 1 || phase === 3 || phase === 5) map.panBy(-6, -2);   // 360 px/s at 60 fps
  if (phase === 2 && k === 0) map.zoomAround(1, cx, cy);
  if (phase === 4 && k === 0) map.zoomAround(-3, cx, cy);
  if (k > 0) { phaseWorst = Math.max(phaseWorst, frameMs); phaseFrames++; }
  if (k === FRAMES_PER_PHASE - 1) {
    const average = (now - phaseStart) / phaseFrames;
    console.log(`${PHASES[phase].padEnd(11)} avg ${average.toFixed(2)} ms  max ${phaseWorst.toFixed(1)} ms  ${map.stats()}`);
  }
  frame++;
}
