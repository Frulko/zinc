// dashboard: an e-ink friendly JSX app for the reMarkable Paper Pro. High contrast, big targets, no animation:
// only what changes is redrawn (the clock once a minute, the timer once a second, a tapped task), so display-rmpp
// refreshes small rectangles with its fast waveform and upgrades them once the screen is idle.
import { RemarkableBar } from 'zinc:remarkable';
import { render } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { refreshDisplay, quit } from 'zinc:gfx';
import * as storage from 'zinc:storage';
import { InkCanvas, Ink, parseStrokes } from 'zinc:ink';
import { PAGE, LABEL } from './eink';
import { everySecond } from './state';
import { ClockPanel, TimerPanel, TasksPanel, HabitsPanel } from './components/panels';

// the scratchpad's strokes are saved with the rest of the state (zinc:storage; every 10 s when they changed, and on Accueil and Quitter)
const scratch = new Ink();
scratch.width = 5;
let savedScratch = storage.get('dashboard.scratch');
if (savedScratch !== '') {
  try { scratch.setStrokes(parseStrokes(savedScratch)); } catch (e) { savedScratch = ''; }
}
function saveScratch(): void {
  const json = scratch.toJSON();
  if (json !== savedScratch) { storage.set('dashboard.scratch', json); savedScratch = json; }
}

const SMALL_BUTTON = 'px-6 py-3 rounded-lg border-2 border-black bg-white focus:bg-white';

function Scratchpad(): i32 {
  return <View className="flex-col grow gap-2">
    <View className="flex-row justify-between items-center">
      <Text className={LABEL}>Scratchpad (pen)</Text>
      <View className="flex-row gap-4">
        <Button className={SMALL_BUTTON} onClick={() => scratch.clear()}><Text className={LABEL}>Clear</Text></Button>
        <Button className={SMALL_BUTTON} onClick={() => { refreshDisplay(); }}><Text className={LABEL}>Refresh</Text></Button>
      </View>
    </View>
    <View className="grow p-[3px] rounded-lg bg-black">
      <InkCanvas ink={scratch} className="grow" />
    </View>
  </View>;
}

function App(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Dashboard" onHome={saveScratch} onQuit={() => { saveScratch(); quit(); }} />
    <View className="flex-row justify-between items-center">
      <ClockPanel />
      <TimerPanel />
    </View>
    <TasksPanel />
    <HabitsPanel />
    <Scratchpad />
  </View>;
}

// a pressed button fading in and out would ghost on e-paper and cost a dozen refreshes: it keeps its look while pressed
setPressFeedback(false);
setInterval(everySecond, 1000);
setInterval(saveScratch, 10000);
render(App, 0xffffff, null);
