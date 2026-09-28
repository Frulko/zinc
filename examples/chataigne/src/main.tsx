// chataigne: a show-control companion that talks OSC with Chataigne (https://benjamin.kuperberg.fr/chataigne/).
// Faders, cues, toggles, an XY pad, colours and a chat go out; meters, cue names, feedback and chat come back.
//   ZINC_CHATAIGNE_SIM=1   start with the built-in simulator (no Chataigne, no sockets)
//   ZINC_CHATAIGNE_DEMO=1  play a few scripted gestures (screenshots, the round-trip check in tools/)
import { render } from 'zinc:ui/solid';
import { env, platform } from 'zinc:sys';
import { now, setNow } from './state';
import { setSimulated } from './link';
import { tickSimulator } from './simulator';
import { tickDemo } from './demo';
import { followChat } from './panels/feed';
import { App } from './app';

const demo = env('ZINC_CHATAIGNE_DEMO') === '1';
// The sim target runs headless frames back to back: no network there, the simulator stands in.
setSimulated(env('ZINC_CHATAIGNE_SIM') === '1' || platform() === 'sim');

render(App, 0xfafafa, (dt: number) => {
  setNow(now() + dt);
  tickSimulator(dt);
  if (demo) tickDemo(dt);
  followChat();
});
