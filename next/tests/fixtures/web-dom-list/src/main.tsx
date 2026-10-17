// The fixture of the measurements of tools/web-measure and of the list checks of tests/t1/web_dom_list.sh: a list of 10 000 rows (only the rows in view exist as elements, with spacers for the
// rest, in a native scroller) next to 1 200 small boxes of which twenty move every frame (a width that changes, so it goes to a custom property, never to a new class).
import { createSignal, For, VirtualList, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

const CELLS: number[] = [];
for (let i = 0; i < 1180; i++) CELLS.push(i);
const BARS: number[] = [];
for (let i = 0; i < 20; i++) BARS.push(i);
const [phase, setPhase] = createSignal<number>(0);
const [shown, setShown] = createSignal<string>('top');
ui.addStepper((): void => { setPhase(phase() + 0.05); });

function App(): i32 {
  return <View className="flex-row w-full h-full bg-white">
    <View as="nav" aria-label="Boxes" className="flex-col gap-1 p-2 w-64 border-r border-slate-200">
      <View className="flex-row flex-wrap gap-1">
        <For each={CELLS}>{(i: number) => <View className={i % 7 === 0 ? 'w-4 h-4 rounded bg-sky-200' : 'w-4 h-4 rounded bg-slate-100'} />}</For>
      </View>
      <View className="flex-col gap-1">
        <For each={BARS}>{(i: number) => <View className="h-2 rounded bg-sky-500" style={{ width: 20 + 100 * (0.5 + 0.5 * Math.sin(phase() + i * 0.3)) }} />}</For>
      </View>
    </View>
    <View as="main" className="flex-col grow">
      <Text as="h1" className="px-4 py-3 text-lg font-semibold text-slate-900">{'10 000 rows, ' + shown()}</Text>
      <VirtualList count={10000} itemHeight={32} className="grow">{(i: i32) => <View as="li" className="flex-row items-center gap-3 px-4 h-8 border-b border-slate-100"><Text className="w-14 text-sm text-slate-500">{'#' + i}</Text><Text className="text-slate-900">{'Row number ' + i}</Text></View>}</VirtualList>
    </View>
  </View>;
}

render(App, 0xffffff, null);
