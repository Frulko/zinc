// navigation: a Waze-style turn-by-turn GPS demo. A simulated drive through central Paris on real OpenStreetMap
// streets, with a heading-up camera that follows the car, a vector map drawn every frame (zinc:citymap, a plugin of
// this project), the instruction banner, ETA sheet with the step list, speed bubble, alerts, report button,
// night mode and an arrival celebration. Runs offline: all data is bundled (assets/city.bin, src/route-data.ts).
//
//   zinc run examples/maps/navigation               ZINC_DEMO=<state> scripts a state (see demo.ts, README.md)
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { width, height } from 'zinc:gfx';
import { Navigation, navKey, stepNavigation } from './embed';
import { stepDemo } from './demo';

function App(): i32 { return <Navigation />; }

ui.onKey((e: ui.KeyEvent) => { if (navKey(e, true)) e.preventDefault(); });

function tick(dt: number): void {
  stepDemo();
  stepNavigation(dt, 0, 0, width(), height());
}

render(App, 0xeef0f3, tick);
