// Settings, Appearance: the themes (theme.ts), each with its colours as a strip; a click uses one at once. The user's folder of themes is
// shown with a button to read it again after a file was added or changed, and what was wrong with a file that could not be read.
import { Icon } from 'zinc:icons';
import { store } from '../state';
import { Theme, allThemes, currentTheme, useTheme, loadThemes, themeErrors, userThemesDir, TOKENS } from '../theme';
import { BG_HOVER, BG_SELECTED, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR } from '../constants';

const hex = (c: i32): string => `#${c.toString(16).padStart(6, '0')}`;
const SWATCHES = ['rail', 'sidebar', 'main', 'text', 'accent', 'link'];

function Row(p: { t: Theme }) {
  const t = p.t, on = currentTheme().id === t.id;
  return <View className={`h-[52] px-3 flex-row items-center gap-3 rounded ${on ? BG_SELECTED : BG_HOVER}`} aria-label={t.name}
    aria-selected={on ? 'true' : 'false'} onPress={() => { useTheme(t.id); store.changed(); }}>
    <View className="flex-row rounded overflow-hidden border border-[var(--dc-border)]">
      {SWATCHES.map((k: string) => <View key={k} className={`w-[16] h-[28] bg-[${hex(t.colors[TOKENS.indexOf(k)])}]`} />)}
    </View>
    <View className="grow basis-0">
      <Text className={`text-[15px] ${on ? TEXT_STRONG : TEXT_MAIN}`} numberOfLines={1}>{t.name}</Text>
      <Text className={`text-xs ${TEXT_MUTED}`}>{`${t.scheme}, ${t.density}, ${t.textSize} px${t.own ? ', yours' : ''}`}</Text>
    </View>
    {on ? <Icon name="check" size={18} color={() => 0x23a55a} /> : null}
  </View>;
}

export function Appearance() {
  return <View className="px-6 py-4 gap-1">
    <Text className={`pb-2 text-sm ${TEXT_MUTED}`}>A theme is a JSON file: its colours, corners, font, text size and density. This choice stays on this computer.</Text>
    {allThemes().map((t: Theme) => <Row key={t.id} t={t} />)}
    <Text className={`pt-5 pb-1 text-xs font-bold uppercase ${TEXT_MUTED}`}>Your themes</Text>
    <Text className={`text-sm ${TEXT_MUTED}`}>Put .json files in this folder (assets/themes/theme.schema.json in the app says what they hold; a copy of a shipped theme is a start):</Text>
    <Text className={`py-1 text-sm select-text font-mono ${TEXT_MAIN}`}>{userThemesDir()}</Text>
    <View className={`self-start px-3 py-1.5 rounded ${BG_HOVER}`} aria-label="Reload the themes" onPress={() => { loadThemes(); useTheme(currentTheme().id); store.changed(); }}>
      <Text className={`text-sm ${TEXT_MAIN}`}>Reload the themes</Text>
    </View>
    {themeErrors().map((e: string, i: i32) => <Text key={`${i}`} className={`text-sm ${TEXT_ERROR}`}>{e}</Text>)}
  </View>;
}
