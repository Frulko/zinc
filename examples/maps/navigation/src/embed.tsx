// The navigation demo as reusable parts: the screen, its keys and its per-frame step. main.tsx runs them as an app;
// examples/hero embeds them as a tab (the keys only while the tab is shown, the step only while it is mounted).
import { Show, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { stepMotion } from './motion';
import { stepSim, togglePlay, setSimSpeed, cycleSpeed, simSpeed } from './sim';
import { stepCamera, pointerDown, pointerMove, pointerUp, wheel, recenter, panBy, zoomBy } from './camera';
import { drawScene, advanceScene } from './scene';
import { stepAlerts, cardIndex, cardIn, toggleReport, reportOpen, toast } from './alerts';
import { stepApp, nightT, toggleNight, toggleSheet, restart, go } from './app';
import { Banner, stepBanner } from './components/Banner';
import { Sheet } from './components/Sheet';
import { Controls, SpeedBubble, AlertCard, Report, MapFooter, Toast, Arrival, Attribution } from './components/Hud';

/** The map canvas: its box is the camera's viewport. */
export const mapRef = createNodeRef();

export function Navigation(): i32 {
  // the canvas draws the map under its children; the panels float over it
  return <Canvas ref={mapRef} class="h-full" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawScene(x, y, w, h, nightT.get())}
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

/** true when the key was handled. `digits` false leaves 1 / 2 / 4 to the host (tab shortcuts). */
export function navKey(e: ui.KeyEvent, digits: boolean): boolean {
  const k = e.key;
  if (k === 'Escape') { if (reportOpen()) toggleReport(); else return false; }
  else if (k === ' ') togglePlay();
  else if (k === 'Enter') go();
  else if (digits && (k === '1' || k === '2' || k === '4')) { setSimSpeed(k.charCodeAt(0) - 48); toast(`Simulation ×${simSpeed()}`); }
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
  else return false;
  return true;
}

/** Per frame (after the demo script): the simulation, the panels and the camera in the viewport x, y, w, h. */
export function stepNavigation(dt: number, x: number, y: number, w: number, h: number): void {
  stepSim(dt);
  stepAlerts(dt);
  stepApp(dt);
  stepBanner();
  stepMotion(dt);
  stepCamera(dt, x, y, w, h);
  advanceScene(dt);
}
