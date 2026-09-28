// camera-remote: a tethering app for USB cameras over zinc:gphoto2 — live view, the main exposure settings and
// capture with a thumbnail. No camera attached? ZINC_FAKE_CAMERA=1 (the sim target always fakes one).
import { render } from 'zinc:ui/solid';
import { setStats, status } from './state';
import { scan, watchCamera, liveStats } from './session';
import { TopBar } from './components/TopBar';
import { LiveView } from './components/LiveView';
import { SettingsPanel } from './components/SettingsPanel';
import { ChoicesPopover } from './components/ChoicesPopover';
import { captionText } from 'zinc:ui/kit';

function App(): i32 {
  return <View class="flex-col h-full bg-zinc-50">
    <TopBar />
    <View class="flex-row grow">
      <View class="flex-col grow p-4 gap-3">
        <LiveView />
        <Text class={captionText()}>{status()}</Text>
      </View>
      <SettingsPanel />
    </View>
    <ChoicesPopover />
  </View>;
}

/** Refreshes the statistics line twice a second (not every frame: it is text layout work). */
let sinceStats = 0;
function onTick(dt: number): void {
  sinceStats += dt;
  if (sinceStats < 0.5) return;
  sinceStats = 0;
  setStats(liveStats());
}

watchCamera();
render(App, 0xfafafa, onTick);
scan();
