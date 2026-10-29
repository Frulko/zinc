// The sleep timer's moon in the bar (services/sleep.ts): the time left under it while it runs, and its menu (15 to 90 minutes, the
// end of the song or of the queue, off), drawn over the page by main.tsx.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { sleepMode, sleepLeft, sleepOpen, setSleepOpen, startSleep, stopSleep } from '../services/sleep';
import { current } from '../services/player';
import { duration } from '../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT } from '../constants';

export function SleepButton(): i32 {
  const on = (): boolean => sleepMode() !== '';
  // as wide as the other buttons of the bar (it fits 1180 px): the time left goes under the moon
  return <View className={`flex-col items-center justify-center w-[34] h-[44] rounded-[8] cursor-pointer hover:${bg(HOVER)}`}
    onPointerDown={(e: ui.PointerEvent) => setSleepOpen(!sleepOpen())}>
    <Icon name="moon" size={on() ? 13 : 15} color={() => color(on() ? ACCENT : MUTED)} strokeWidth={2} />
    {on() ? <Text className={`text-[9px] font-semibold ${fg(ACCENT)}`} numberOfLines={1}>{duration(sleepLeft() * 1000)}</Text> : <View />}
  </View>;
}

function Item(props: { label: string; onPress: () => void; disabled?: boolean }): i32 {
  const off = props.disabled === true;
  return <View className={`flex-row items-center h-[28] px-3 rounded-[6] ${off ? '' : `cursor-pointer hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (off) return; setSleepOpen(false); props.onPress(); }}>
    <Text className={`text-[13px] ${off ? fg(FAINT) : fg(TEXT)}`}>{props.label}</Text>
  </View>;
}

export function SleepMenu(): i32 {
  const minutes: number[] = [15, 30, 45, 60, 90];
  const idle = (): boolean => current() === null;
  return <View className="absolute inset-0">
    <View className="absolute inset-0" onPointerDown={(e: ui.PointerEvent) => setSleepOpen(false)} />
    <View className={`absolute top-[58] left-[316] w-[220] flex-col p-1 rounded-[8] border ${bg(CARD)} ${bd(BORDER)}`}>
      <Text className={`h-[24] px-3 pt-1 text-[11px] font-semibold ${fg(FAINT)}`}>Sleep timer</Text>
      {minutes.map((m: number) => <Item label={`${m} minutes`} onPress={() => startSleep('minutes', m)} />)}
      <Item label="End of this song" disabled={idle()} onPress={() => startSleep('song')} />
      <Item label="End of this album or list" disabled={idle()} onPress={() => startSleep('list')} />
      {sleepMode() !== '' ? <View className={`mt-1 pt-1 border-t ${bd(BORDER)}`}><Item label="Off" onPress={stopSleep} /></View> : <View />}
    </View>
  </View>;
}
