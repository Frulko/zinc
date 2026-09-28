// map-explorer: an offline OpenStreetMap vector map of central Paris (zinc:map) under a floating kit panel.
// Drag, wheel, pinch or double-click the map; pick a place in the panel to fly there.
import { render } from 'zinc:ui/solid';
import { drawMap, updateMap } from './map';
import { demoMode, demoStep } from './demo';
import { PlacesPanel } from './components/PlacesPanel';

/** OpenStreetMap data needs its attribution on screen. */
function Attribution(): i32 {
  return <View class="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-white border border-zinc-200">
    <Text class="text-xs text-zinc-600">© OpenStreetMap contributors · OpenFreeMap</Text>
  </View>;
}

function App(): i32 {
  // the canvas draws the map under its children; the panel and the attribution float over it
  return <Canvas class="h-full" onDraw={drawMap}>
    <PlacesPanel />
    <Attribution />
  </Canvas>;
}

render(App, 0xf2efe9, (dt: number) => {
  updateMap(dt);
  if (demoMode) demoStep();
});
