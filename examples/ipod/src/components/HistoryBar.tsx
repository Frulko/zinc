// Left of the playing bar: back and forward through what was shown (‹ ›, greyed when there is nothing that way; Cmd+[ and Cmd+], the
// mouse's side buttons and a two-finger swipe do the same) and the magnifier of the global search (Cmd+F, Cmd+K).
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { goBack, goForward, canGoBack, canGoForward } from '../state';
import { openQuickSearch } from './QuickSearch';
import { bg, bd, color, CARD, BORDER, HOVER, TEXT, FAINT } from '../constants';

function Arrow(props: { icon: string; on: () => boolean; onPress: () => void }): i32 {
  return <View className={`items-center justify-center w-[30] h-[30] rounded-full ${props.on() ? `cursor-pointer hover:${bg(HOVER)}` : ''}`}
    onPointerDown={(e: ui.PointerEvent) => { if (props.on()) props.onPress(); }}>
    <Icon name={props.icon} size={20} color={() => color(props.on() ? TEXT : FAINT)} strokeWidth={2.25} />
  </View>;
}

export function HistoryBar(): i32 {
  return <View className={`flex-row items-center gap-0.5 h-[64] pl-4 border-b shrink-0 ${bg(CARD)} ${bd(BORDER)}`}>
    <Arrow icon="chevron-left" on={canGoBack} onPress={goBack} />
    <Arrow icon="chevron-right" on={canGoForward} onPress={goForward} />
    <Arrow icon="search" on={() => true} onPress={openQuickSearch} />
  </View>;
}
