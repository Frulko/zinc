// One window of the list: the app's icon, the title, the app's name, and where the window is when it is not simply on this Space.
import { Icon } from 'zinc:icons';
import { DesktopWindow } from 'zinc:desktop-windows';
import { icons } from './switcher';
import { settings } from './settings';
import { accentFill, density, iconColor, palette } from './theme';

function stateIcon(w: DesktopWindow): string {
  if (w.minimized) return 'minimize-2';
  if (w.hidden) return 'eye-off';
  return 'layers';
}
function stateNote(w: DesktopWindow): string {
  if (w.minimized) return 'Minimized';
  if (w.hidden) return 'Hidden';
  if (w.offSpace) return 'Other Space';
  return '';
}

export function WindowRow(props: { window: DesktopWindow; selected: () => boolean; onPress: () => void }): i32 {
  const w = props.window;
  const name = (): string => w.title !== '' ? w.title : w.app;
  const appName = (): string => settings().showAppName && w.title !== '' ? w.app : '';
  const note = stateNote(w);
  const detailColor = (): i32 => props.selected() ? 0xffffff : iconColor();
  const iconOf = (): number => icons().get(w.bundle) ?? -1;
  const onAccent = (): string => props.selected() ? 'text-white' : palette().label;
  const onAccentDetail = (): string => props.selected() ? 'text-white/75' : palette().secondary;
  return <View role="button" aria-label={w.app + ', ' + name()} onPress={props.onPress}
    className={`outline-none cursor-pointer flex-row items-center gap-[10px] px-[10px] rounded-[8px] h-[${density().rowHeight}px] ${props.selected() ? accentFill() : palette().rowHover}`}>
    <Show when={iconOf() >= 0} fallback={<View className={`w-[${density().icon}px] h-[${density().icon}px] rounded-[6px] items-center justify-center ${palette().card}`}><Icon name="app-window" size={Math.round(density().icon * 0.6)} color={detailColor} /></View>}>
      <Image image={iconOf()} className={`w-[${density().icon}px] h-[${density().icon}px]`} />
    </Show>
    <Text numberOfLines={1} className={`grow shrink ${density().title} ${onAccent()}`}>{name()}</Text>
    <Show when={appName() !== ''}>
      <Text numberOfLines={1} className={`shrink-0 ${density().detail} ${onAccentDetail()}`}>{appName()}</Text>
    </Show>
    <Show when={note !== ''}>
      <View className="shrink-0 flex-row items-center gap-[4px]">
        <Icon name={stateIcon(w)} size={12} color={detailColor} />
        <Text numberOfLines={1} className={`${density().detail} ${onAccentDetail()}`}>{note}</Text>
      </View>
    </Show>
  </View>;
}
