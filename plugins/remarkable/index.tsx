import { createSignal } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import status from './native/status.spec';

const [minutes, setMinutes] = createSignal<i32>(status.localMinutes());
const [battery, setBattery] = createSignal<i32>(status.battery());
const [charging, setCharging] = createSignal<boolean>(status.charging());
setInterval(() => {
  setMinutes(status.localMinutes()); setBattery(status.battery()); setCharging(status.charging());
}, 10000);

export interface RemarkableBarProps {
  title: string;
  /** App decides whether unsaved work permits exit. Notes saves before calling quit(). */
  onQuit?: () => void;
}
/** Platform-specific shell component, explicitly imported by reMarkable apps. Hosts preview an unknown battery. */
export function RemarkableBar(props: RemarkableBarProps): i32 {
  return <View class="flex-row items-center justify-between gap-6 px-6 py-3 bg-white border-b-2 border-black">
    <Text class="text-[30px] text-black">{props.title}</Text>
    <Text class="text-[30px] text-black">{Math.floor(minutes() / 60).toString().padStart(2, '0')}:{(minutes() % 60).toString().padStart(2, '0')}</Text>
    <Text class="text-[28px] text-black">{battery() < 0 ? 'Battery —' : `Battery ${battery()}%`}{charging() ? ' · Charging' : ''}</Text>
    <Button class="px-8 py-3 border-2 border-black rounded-lg bg-white focus:bg-white" onClick={() => { if (props.onQuit) props.onQuit(); else quit(); }}>
      <Text class="text-[30px] text-black">Quitter</Text>
    </Button>
  </View>;
}
