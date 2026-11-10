import { createSignal } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { Button, SearchField, Switch, Sheet, theme, setTheme, DARK, LIGHT } from 'zinc:ui/kit';
import { createLibrary } from './state';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/Library';
import { Player } from './components/Player';
import { Queue } from './components/Queue';
export function App(): i32 {
  const model = createLibrary();
  const [navigation, setNavigation] = createSignal(false);
  const [dark, setDark] = createSignal(env('MUSIC_DARK') === '1');
  setTheme(dark() ? DARK : LIGHT);
  return <View className={`flex-row w-full h-full bg-${theme().background} text-${theme().foreground}`}>
    <View className={`hidden md:flex w-[200px] shrink-0 flex-col p-4 border-r border-${theme().border}`}><Sidebar model={model} onNavigate={() => setNavigation(false)} /></View>
    <ScrollView className="grow min-w-0 h-full"><View className="flex-col p-4 md:p-8 gap-6">
      <View className="flex-row flex-wrap items-center justify-between gap-3"><View className="flex-row items-center gap-3"><Button label="Library" variant="outline" size="sm" className="md:hidden" onClick={() => setNavigation(true)} /><Text className={`text-[28px] font-medium text-${theme().foreground}`}>{model.collection()}</Text></View><Switch label="Dark" checked={dark} onChange={(value: boolean) => { setDark(value); setTheme(value ? DARK : LIGHT); }} /></View>
      <Text className={`text-[13px] text-${theme().mutedForeground}`}>Small sounds for a quieter day.</Text>
      <View className="flex-col lg:flex-row gap-8 min-w-0">
        <View className="grow min-w-0 flex-col gap-6"><SearchField label="Search your library" placeholder="Find a track or collection…" value={model.query} onInput={model.setQuery} /><Library model={model} /><Text className={`text-[11px] text-${theme().mutedForeground}`}>Local previews · 8 seconds each · no network</Text></View>
        <View className="w-full lg:w-[320px] shrink-0 flex-col gap-8"><Player model={model} /><Queue model={model} /></View>
      </View>
    </View></ScrollView>
    <Sheet title="Your music" side="left" size={280} open={navigation} onOpenChange={setNavigation}><Sidebar model={model} onNavigate={() => setNavigation(false)} /></Sheet>
  </View>;
}
