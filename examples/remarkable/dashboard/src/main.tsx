// dashboard: an e-ink friendly JSX app for the reMarkable Paper Pro. High contrast, big targets, no animation:
// only what changes is redrawn (the clock once a minute, the timer once a second, a tapped task), so display-rmpp
// refreshes small rectangles with its fast waveform and upgrades them once the screen is idle.
import { render } from 'zinc:ui/solid';
import { InkCanvas, Ink } from 'zinc:ink';
import { PAGE, LABEL } from './eink';
import { everySecond } from './state';
import { ClockPanel, TimerPanel, TasksPanel, HabitsPanel } from './components/panels';

// the scratchpad keeps its strokes for the whole session
const scratch = new Ink();
scratch.width = 5;

function Scratchpad(): i32 {
  return <View class="flex-col grow gap-2">
    <Text class={LABEL}>Scratchpad (pen)</Text>
    <View class="grow p-[3px] rounded-lg bg-black">
      <InkCanvas ink={scratch} class="grow" />
    </View>
  </View>;
}

function App(): i32 {
  return <View class={PAGE}>
    <View class="flex-row justify-between items-center">
      <ClockPanel />
      <TimerPanel />
    </View>
    <TasksPanel />
    <HabitsPanel />
    <Scratchpad />
  </View>;
}

setInterval(everySecond, 1000);
render(App, 0xffffff, null);
