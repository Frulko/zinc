// The Allow changes switch: off at each start, so the app only reads the iPod (and its backups) until it is turned on. Shown in the
// sidebar under the iPod, with a lock that says which way it is.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { allowChanges, setAllowChanges } from '../state';
import { log } from '../services/log';
import { bg, fg, color, TRACK, TEXT, MUTED, ACCENT, ERROR } from '../constants';

export function AllowChanges(): i32 {
  const on = (): boolean => allowChanges();
  const flip = (): void => { setAllowChanges(!on()); log(on() ? 'Allow changes turned on' : 'Allow changes turned off', on() ? 'adding, restoring, repairing and deleting backups are allowed' : 'the iPod is only read', true); };
  return <View className="flex-row items-center gap-2.5 h-[34] px-2.5 mx-2 mt-2 rounded-[6] cursor-pointer" onPointerDown={(e: ui.PointerEvent) => flip()}>
    <Icon name={on() ? 'lock-open' : 'lock'} size={15} color={() => color(on() ? ERROR : MUTED)} strokeWidth={2} />
    <View className="grow flex-col">
      <Text className={`text-[13px] ${fg(TEXT)}`}>Allow changes</Text>
      <Text className={`text-[10px] ${on() ? fg(ERROR) : fg(MUTED)}`}>{on() ? 'The iPod can be changed' : 'Read only'}</Text>
    </View>
    <View className={`flex-row w-[34] h-[20] p-[2] rounded-full ${on() ? `${bg(ACCENT)} justify-end` : bg(TRACK)}`}>
      <View className="w-[16] h-[16] rounded-full bg-white" />
    </View>
  </View>;
}
