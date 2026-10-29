// The search field of a page: a magnifier, the text (matched as search.ts folds it), and an x that clears it once something is typed.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { bg, bd, fg, color, CARD, BORDER, TEXT, MUTED, FAINT } from '../constants';

export function SearchField(props: { value: string; onInput: (v: string) => void; placeholder: string; width: i32 }): i32 {
  return <View className={`flex-row items-center gap-2 h-[32] px-3 rounded-[8] border shrink-0 ${bg(CARD)} ${bd(BORDER)}`} style={{ width: props.width }}>
    <Icon name="search" size={14} color={() => color(MUTED)} strokeWidth={2} />
    <Input className={`grow text-[13px] ${fg(TEXT)}`} value={props.value} onInput={props.onInput} placeholder={props.placeholder} />
    {props.value !== '' ? <View className="cursor-pointer" onPointerDown={(e: ui.PointerEvent) => props.onInput('')}>
      <Icon name="x" size={13} color={() => color(FAINT)} strokeWidth={2} />
    </View> : <View />}
  </View>;
}
