import { createSignal } from 'zinc:ui/solid';
import { quit, minimizeWindow } from 'zinc:gfx';
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
  /** Accueil: called first (save the state there), then the window is minimized and the app keeps running (AppLoad's window bar brings
   *  it back). Where the window cannot be minimized, Accueil quits like Quitter: an app that saved its state comes back as it was. */
  onHome?: () => void;
}
const BUTTON = 'px-8 py-3 border-2 border-black rounded-lg bg-white focus:bg-white';
function leave(props: RemarkableBarProps): void { if (props.onQuit) props.onQuit(); else quit(); }
/** Platform-specific shell component, explicitly imported by reMarkable apps. Hosts preview an unknown battery. */
export function RemarkableBar(props: RemarkableBarProps): i32 {
  return <View className="flex-row items-center justify-between gap-6 px-6 py-3 bg-white border-b-2 border-black">
    <Text className="text-[30px] text-black">{props.title}</Text>
    <Text className="text-[30px] text-black">{Math.floor(minutes() / 60).toString().padStart(2, '0')}:{(minutes() % 60).toString().padStart(2, '0')}</Text>
    <Text className="text-[28px] text-black">{battery() < 0 ? 'Battery —' : `Battery ${battery()}%`}{charging() ? ' · Charging' : ''}</Text>
    <View className="flex-row gap-4">
      <Button className={BUTTON} onClick={() => { if (props.onHome) props.onHome(); if (!minimizeWindow()) leave(props); }}>
        <Text className="text-[30px] text-black">Accueil</Text>
      </Button>
      <Button className={BUTTON} onClick={() => leave(props)}>
        <Text className="text-[30px] text-black">Quitter</Text>
      </Button>
    </View>
  </View>;
}
