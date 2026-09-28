// navigation: a Waze-style turn-by-turn GPS demo. A simulated drive through central Paris on real OpenStreetMap
// streets, with a heading-up camera that follows the car, a vector map drawn every frame (zinc:citymap, a plugin of
// this project), the instruction banner, ETA sheet with the step list, speed bubble, alerts, report button,
// night mode and an arrival celebration. Runs offline: all data is bundled (assets/city.bin, src/route-data.ts).
//
//   zinc run examples/maps/navigation               ZINC_DEMO=<state> scripts a state (see demo.ts, README.md)
import { render, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { width, height } from 'zinc:gfx';
import { stepMotion } from './motion';
import { stepSim, togglePlay, setSimSpeed, cycleSpeed, simSpeed } from './sim';
import { stepCamera, pointerDown, pointerMove, pointerUp, wheel, recenter, panBy, zoomBy } from './camera';
import { drawScene, advanceScene } from './scene';
import { stepAlerts, cardIndex, cardIn, toggleReport, reportOpen, toast } from './alerts';
import { stepApp, nightT, toggleNight, toggleSheet, restart, go } from './app';
import { stepDemo } from './demo';
import { Banner, stepBanner } from './components/Banner';
import { Sheet } from './components/Sheet';
import { Controls, SpeedBubble, AlertCard, Report, MapFooter, Toast, Arrival, Attribution } from './components/Hud';

function App(): i32 {
  // the canvas draws the map under its children; the panels float over it
  return <Canvas class="h-full" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawScene(x, y, w, h, nightT.get())}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={wheel}>
    <View class="absolute top-4 bottom-4 left-4 w-[284px] lg:w-[336px] flex-col gap-3">
      <Banner />
      <Show when={cardIndex() >= 0 || cardIn.get() > 0.01}><AlertCard /></Show>
      <View class="grow" />
      <SpeedBubble />
      <Sheet />
    </View>
    <Controls />
    <Attribution />
    <MapFooter />
    <Toast />
    <Report />
    <Arrival />
  </Canvas>;
}

ui.onKey((e: ui.KeyEvent) => {
  const k = e.key;
  if (k === 'Escape') { if (reportOpen()) toggleReport(); else return; }
  else if (k === ' ') togglePlay();
  else if (k === 'Enter') go();
  else if (k === '1' || k === '2' || k === '4') { setSimSpeed(k.charCodeAt(0) - 48); toast(`Simulation ×${simSpeed()}`); }
  else if (k === 's') { cycleSpeed(); toast(`Simulation ×${simSpeed()}`); }
  else if (k === 'n') toggleNight();
  else if (k === 'l') toggleSheet();
  else if (k === 'r') restart();
  else if (k === 'c') recenter();
  else if (k === 'p') toggleReport();
  else if (k === '=' || k === '+') zoomBy(0.5);
  else if (k === '-') zoomBy(-0.5);
  else if (k === 'ArrowLeft') panBy(-80, 0);
  else if (k === 'ArrowRight') panBy(80, 0);
  else if (k === 'ArrowUp') panBy(0, -80);
  else if (k === 'ArrowDown') panBy(0, 80);
  else return;
  e.preventDefault();
});

function tick(dt: number): void {
  stepDemo();
  stepSim(dt);
  stepAlerts(dt);
  stepApp(dt);
  stepBanner();
  stepMotion(dt);
  stepCamera(dt, 0, 0, width(), height());
  advanceScene(dt);
}

render(App, 0xeef0f3, tick);
