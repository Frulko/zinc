// The bench app (ZN-713): a title, one image, a field that filters a scrolling list of 200 rows.
import { render, createSignal } from 'zinc:ui/solid';
import { theme, hex, Input } from 'zinc:ui/nuxt';

const ROWS: string[] = [];
for (let i = 1; i <= 200; i++) ROWS.push(`Row ${i}`);
const [query, setQuery] = createSignal<string>('');

function App(): i32 {
  return <View className={`w-full h-full flex-col gap-3 p-4 bg-${hex(theme().bg)}`}>
    <View className="flex-row items-center gap-3">
      <Image className="w-12 h-12" src="image.png" />
      <Text className={`text-xl font-semibold text-${hex(theme().textHighlighted)}`}>Bench List</Text>
    </View>
    <Input placeholder="Filter" modelValue={query} onUpdate={setQuery} />
    <ScrollView className="grow">
      <For each={ROWS.filter((r: string) => r.toLowerCase().includes(query().toLowerCase()))}>{(r: string) =>
        <Text className={`py-2 text-${hex(theme().text)}`}>{r}</Text>}</For>
    </ScrollView>
  </View>;
}

// The second tick starts after the first frame was presented: the same point as the double requestAnimationFrame of the two web versions.
let ticks = 0;
render(App, 0xffffff, (dt: number) => { if (++ticks === 2) console.log('first-frame'); });
