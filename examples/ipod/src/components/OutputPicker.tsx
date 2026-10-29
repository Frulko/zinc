// Where the music plays: the button at the right of the bar (this computer or a Sonos group, and the group's volume) and its menu, the
// list of the Sonos groups found (a search the first time it opens, Search again). Drawn over the page by main.tsx.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { outputs, output, searching, sonosError, pickerOpen, setPickerOpen, findSpeakers, OutputChoice } from '../services/sonos';
import { chooseOutput, volume, setVolume } from '../services/player';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR, TRACK, VOLUME_WIDTH } from '../constants';

function outputName(): string {
  for (const o of outputs()) if (o.id === output()) return o.name;
  return 'This computer';
}

function openPicker(): void {
  const open = !pickerOpen();
  setPickerOpen(open);
  if (open && outputs().length === 0) findSpeakers();
}

export function OutputButton(): i32 {
  return <View className="flex-col items-end gap-1 w-[160]">
    <View className={`flex-row items-center gap-1.5 px-2 h-[24] rounded-[6] cursor-pointer hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => openPicker()}>
      <Icon name={output() === '' ? 'laptop' : 'speaker'} size={14} color={() => color(output() === '' ? MUTED : ACCENT)} strokeWidth={2} />
      <Text className={`text-[12px] ${output() === '' ? fg(MUTED) : fg(ACCENT)}`} numberOfLines={1}>{outputName()}</Text>
      <Icon name="chevron-down" size={12} color={() => color(FAINT)} strokeWidth={2} />
    </View>
    {output() !== '' && volume() >= 0
      ? <View className="flex-row items-center gap-1.5">
        <Icon name="volume-1" size={12} color={() => color(FAINT)} strokeWidth={2} />
        <View className={`h-[5] rounded-full overflow-hidden cursor-pointer ${bg(TRACK)}`} style={{ width: VOLUME_WIDTH }}
          onPointerDown={(e: ui.PointerEvent) => setVolume(Math.round(Math.max(0, Math.min(1, e.x / VOLUME_WIDTH)) * 100) as i32)}>
          <View className={`h-full ${bg(ACCENT)}`} style={{ width: Math.round(volume() * VOLUME_WIDTH / 100) }} />
        </View>
      </View>
      : <View />}
  </View>;
}

function Choice(props: { id: string; name: string; icon: string }): i32 {
  const on = (): boolean => output() === props.id;
  return <View className={`flex-row items-center gap-2 h-[30] px-3 rounded-[6] cursor-pointer hover:${bg(HOVER)}`}
    onPointerDown={(e: ui.PointerEvent) => { setPickerOpen(false); chooseOutput(props.id); }}>
    <Icon name={props.icon} size={14} color={() => color(on() ? ACCENT : MUTED)} strokeWidth={2} />
    <Text className={`grow basis-0 text-[13px] ${on() ? `${fg(ACCENT)} font-semibold` : fg(TEXT)}`} numberOfLines={1}>{props.name}</Text>
    {on() ? <Icon name="check" size={14} color={() => color(ACCENT)} strokeWidth={2} /> : <View />}
  </View>;
}

export function OutputMenu(): i32 {
  return <View className="absolute inset-0">
    <View className="absolute inset-0" onPointerDown={(e: ui.PointerEvent) => setPickerOpen(false)} />
    <View className={`absolute top-[58] right-[16] w-[260] flex-col p-1 rounded-[8] border ${bg(CARD)} ${bd(BORDER)}`}>
      <Choice id="" name="This computer" icon="laptop" />
      {outputs().map((o: OutputChoice) => <Choice id={o.id} name={o.name} icon="speaker" />)}
      <View className={`flex-row items-center gap-2 h-[30] px-3 mt-1 border-t ${bd(BORDER)}`}>
        <Text className={`grow basis-0 text-[11px] ${sonosError() !== '' ? fg(ERROR) : fg(FAINT)}`} numberOfLines={1}>
          {searching() ? 'Looking for Sonos speakers…' : sonosError() !== '' ? sonosError() : `${outputs().length} Sonos ${outputs().length === 1 ? 'group' : 'groups'}`}
        </Text>
        <View className="cursor-pointer" onPointerDown={(e: ui.PointerEvent) => findSpeakers()}>
          <Icon name="refresh-cw" size={13} color={() => color(MUTED)} strokeWidth={2} />
        </View>
      </View>
    </View>
  </View>;
}
