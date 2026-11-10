import { Button, theme } from 'zinc:ui/kit';
import { LibraryModel } from '../state';
import { collections } from '../data';
export function Sidebar(p: { model: LibraryModel; onNavigate: () => void }): i32 {
  return <View className="flex-col gap-6">
    <Text className={`text-[22px] font-medium text-${theme().foreground}`}>Music</Text>
    <View className="flex-col gap-2"><Text className={`px-3 text-[12px] text-${theme().mutedForeground}`}>Your library</Text>
      {collections.map((name: string) => <Button label={name} pressed={p.model.collection() === name} variant={p.model.collection() === name ? 'secondary' : 'ghost'} className="justify-start w-full" onClick={() => { p.model.setCollection(name); p.model.setQuery(''); p.onNavigate(); }} />)}
    </View>
    <Text className={`px-3 text-[12px] text-${theme().mutedForeground}`}>A small record shelf, made here. No account needed.</Text>
  </View>;
}
