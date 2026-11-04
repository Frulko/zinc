import { Icon } from 'zinc:icons';
import { activeList, screen, setScreen, showLists, renameList, beginCreate, editingId } from '../state';
import { EntryEditor } from './EntryEditor';

export function ClearHeader(): i32 {
  return <View className="h-[44] shrink-0 flex-row items-center bg-[#f1f1f1] border-b border-[#d4d4d4]">
    <View className="w-[76] shrink-0" />
    {editingId() === 'list-title' ? <View className="grow"><EntryEditor color="#f1f1f1" /></View> :
      <Button onClick={() => { if (screen() === 'tasks') showLists(); else if (screen() === 'themes') setScreen('tasks'); }}
        aria-label="Show all lists" className="grow h-[44] bg-transparent items-center justify-center">
        <Text className="text-[14px] font-semibold text-[#292929]" numberOfLines={1}>
          {screen() === 'themes' ? 'Themes' : screen() === 'lists' ? 'My Lists' : activeList()?.title ?? 'Clear'}
        </Text>
      </Button>}
    <Button onClick={() => { if (screen() === 'lists') beginCreate(); else setScreen(screen() === 'themes' ? 'tasks' : 'themes'); }}
      aria-label={screen() === 'lists' ? 'Create a list' : 'Choose a theme'}
      className="w-[60] h-[44] shrink-0 bg-transparent items-center justify-center">
      <Icon name="menu" size={19} color={() => 0x858585} />
    </Button>
  </View>;
}
