// modules-showcase: every built-in native module live on one screen (Solid model).
// The services start once; a one-second timer in the frame loop refreshes what they show.
import { render } from 'zinc:ui/solid';
import { startSystem, refreshSystem, secondsUp } from './services/system';
import { startNetwork, pingNetwork } from './services/network';
import { startHardware, reportTick } from './services/hardware';
import { App } from './app';

startSystem();
startNetwork();
startHardware(secondsUp);

let sinceLastTick = 0;
let tick: i32 = 0;

/** Runs every frame; does the periodic work once per second. */
function onFrame(dt: number): void {
  sinceLastTick += dt;
  if (sinceLastTick < 1) return;
  sinceLastTick = 0;
  tick++;
  refreshSystem();
  pingNetwork(tick);
  reportTick(tick);
}

render(App, 0xfafafa, onFrame);
