import { THEME_IDS, THEME_NAMES, rowColor, ROW_HEIGHT } from '../themes';
import { chooseTheme, activeList, clearCompleted, undo, setScreen, renameList } from '../state';

export function ThemesPage(): i32 {
  return <ScrollView className="grow min-h-0 bg-[#161616]">
    <View className="flex-col">
      {THEME_IDS.map((theme: string, index: i32) =>
        <Button onClick={() => chooseTheme(theme)} className={`w-full justify-center px-[15] bg-[${rowColor(theme, 3, 9)}]`}
          style={{ height: ROW_HEIGHT }}>
          <Text className="text-[20px] font-medium text-white">{THEME_NAMES[index] + (activeList()?.theme === theme ? '  ✓' : '')}</Text>
        </Button>)}
      <Button onClick={() => { setScreen('tasks'); renameList(); }} className="h-[52] px-[15] justify-center bg-[#292929]">
        <Text className="text-[17px] text-[#dddddd]">Rename list</Text>
      </Button>
      <Button onClick={() => { clearCompleted(); setScreen('tasks'); }} className="h-[52] px-[15] justify-center bg-[#242424]">
        <Text className="text-[17px] text-[#dddddd]">Clear completed</Text>
      </Button>
      <Button onClick={() => undo()} className="h-[52] px-[15] justify-center bg-[#202020]">
        <Text className="text-[17px] text-[#dddddd]">Undo last change</Text>
      </Button>
      <Text className="px-[15] pt-6 text-[13px] text-[#777777] leading-[22]">{'Swipe right to complete. Swipe left to delete.\nHold, then drag to reorder.\n⌘N adds · ⌘Z undoes · Escape goes back.'}</Text>
    </View>
  </ScrollView>;
}
