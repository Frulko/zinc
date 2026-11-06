// The list shown during a hold. Only the rows that fit are built, so a long list costs what a short one does.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { DesktopWindow } from 'zinc:desktop-windows';
import { firstVisible, isSelected, pick, rows, scrollList } from './switcher';
import { settings } from './settings';
import { PANEL_PADDING, PANEL_RADIUS, density, iconColor, palette, panelFill } from './theme';
import { BottomBar } from './BottomBar';
import { WindowRow } from './WindowRow';

const MIN_THUMB = 24;
/** Where the list stands when it does not all fit. */
function ScrollThumb(): i32 {
  const track = (): number => settings().maxRows * density().rowHeight;
  const height = (): number => Math.max(MIN_THUMB, track() * settings().maxRows / rows().length);
  const top = (): number => (track() - height()) * firstVisible() / (rows().length - settings().maxRows);
  return <View className={`absolute right-[1px] w-[3px] rounded-full ${palette().track}`} style={{ top: top(), height: height() }} />;
}

export function Picker(props: { onSettings: () => void; onToggleTray: (on: boolean) => void; onQuit: () => void }): i32 {
  const shown = (): DesktopWindow[] => rows().slice(firstVisible(), firstVisible() + settings().maxRows);
  return <View className={`w-full h-full rounded-[${PANEL_RADIUS}px] overflow-hidden p-[${PANEL_PADDING}px] ${panelFill()} ${palette().panel}`}>
    <Show when={rows().length > 0} fallback={<View className={`flex-row gap-2 h-[${density().rowHeight}px] justify-center items-center`}><Icon name="app-window" size={16} color={iconColor} /><Text className={`text-[13px] ${palette().secondary}`}>No windows</Text></View>}>
      <View className="relative" onWheel={(e: ui.PointerEvent) => scrollList(e.wheel)}>
        <For each={shown()}>{(w: DesktopWindow) =>
          <WindowRow window={w} selected={() => isSelected(w.id)} onPress={() => pick(w.id)} />}
        </For>
        <Show when={rows().length > settings().maxRows}><ScrollThumb /></Show>
      </View>
    </Show>
    <BottomBar onSettings={props.onSettings} onToggleTray={props.onToggleTray} onQuit={props.onQuit} />
  </View>;
}
