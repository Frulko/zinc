// Under the list: the settings, the menu bar icon and quitting. Reached with the mouse while the shortcut is held.
import { Icon } from 'zinc:icons';
import { settings } from './settings';
import { BAR_HEIGHT, iconColor, palette } from './theme';
import { Toggle } from './components/Controls';

function BarButton(props: { icon: string; label: string; onPress: () => void }): i32 {
  return <View role="button" aria-label={props.label} onPress={props.onPress} className={`outline-none cursor-pointer flex-row items-center gap-[6px] h-[26px] px-2 rounded-[7px] ${palette().rowHover}`}>
    <Icon name={props.icon} size={14} color={iconColor} />
    <Text className={`text-[12px] ${palette().secondary}`}>{props.label}</Text>
  </View>;
}

export function BottomBar(props: { onSettings: () => void; onToggleTray: (on: boolean) => void; onQuit: () => void }): i32 {
  return <View className={`flex-row items-center justify-between h-[${BAR_HEIGHT}px] mt-[4px] pt-[4px] border-t ${palette().barBorder}`}>
    <BarButton icon="settings" label="Settings" onPress={props.onSettings} />
    <View className="flex-row items-center gap-[6px]">
      <Icon name="panel-top" size={14} color={iconColor} />
      <Text className={`text-[12px] ${palette().secondary}`}>Menu bar icon</Text>
      <Toggle label="Menu bar icon" value={() => settings().showTrayIcon} onChange={props.onToggleTray} />
    </View>
    <BarButton icon="power" label="Quit" onPress={props.onQuit} />
  </View>;
}
