// A button of the pages, as Music draws them: an icon and a label in a rounded box; `accent` fills it, `danger` writes it red,
// `disabled` greys it out and ignores the click (a change while Allow changes is off says why on the page instead).
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, FAINT, ACCENT, ERROR } from '../constants';

export function Button(props: { icon: string; label: string; onPress: () => void; accent?: boolean; danger?: boolean; disabled?: boolean }): i32 {
  const off = props.disabled === true, accent = props.accent === true && !off;
  const ink = off ? FAINT : accent ? -1 : props.danger === true ? ERROR : TEXT;
  return <View className={`flex-row items-center gap-1.5 h-[28] px-3 rounded-[7] border shrink-0 ${accent ? `${bg(ACCENT)} ${bd(ACCENT)}` : `${bg(CARD)} ${bd(BORDER)}`} ${off ? '' : `cursor-pointer ${accent ? '' : `hover:${bg(HOVER)}`}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (!off) props.onPress(); }}>
    <Icon name={props.icon} size={14} color={() => ink < 0 ? 0xffffff : color(ink)} strokeWidth={2} />
    <Text className={`text-[12px] font-semibold ${ink < 0 ? 'text-white' : fg(ink)}`}>{props.label}</Text>
  </View>;
}
