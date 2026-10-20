// The thin column of icons on the far left, as in VS Code: each picks what the side panel shows; the shown one again
// folds the panel. A dot on Conversations while a turn runs.
import { Icon } from 'zinc:icons';
import { activity, sideOpen, pickActivity, runningCount, ACT_CHATS, ACT_FOLDERS, ACT_AGENTS, ACT_SETTINGS } from '../state';
import { BAR, BORDER, TEXT, FAINT, ACCENT, SURFACE_HOVER, bg, bd, color } from '../theme';

function ActivityButton(props: { act: i32; icon: string; label: string }): i32 {
  const on = (): boolean => activity() === props.act && sideOpen();
  return <View className={`relative w-[48] h-[44] items-center justify-center cursor-pointer transition-colors duration-150 hover:${bg(SURFACE_HOVER)}`}
    aria-label={props.label} onPress={() => pickActivity(props.act)}>
    {on() && <View className={`absolute left-0 top-[8] bottom-[8] w-[2] rounded-full ${bg(ACCENT)}`} />}
    <Icon name={props.icon} size={20} color={() => color(on() ? TEXT : FAINT)} strokeWidth={1.75} />
    {props.act === ACT_CHATS && runningCount() > 0 && <View className={`absolute top-[10] right-[11] w-[7] h-[7] rounded-full ${bg(ACCENT)}`} />}
  </View>;
}

export function ActivityBar(): i32 {
  return <View className={`w-[48] shrink-0 flex-col border-r ${bg(BAR)} ${bd(BORDER)}`}>
    <ActivityButton act={ACT_CHATS} icon="messages-square" label="Conversations" />
    <ActivityButton act={ACT_FOLDERS} icon="folder" label="Folders" />
    <ActivityButton act={ACT_AGENTS} icon="bot" label="Agents" />
    <View className="grow" />
    <ActivityButton act={ACT_SETTINGS} icon="settings" label="Settings" />
  </View>;
}
