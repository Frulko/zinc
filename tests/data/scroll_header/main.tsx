// A scroll under what a moved scroll carries wrongly (ZN-744, tests/t0/scroll_move.sh and tests/t1/gl_scroll.sh): a translucent header fixed
// over the scroll area, cards whose shadows cross the area's edges, the area clipped with rounded corners, and the rows of cards moving under
// them. A whole frame drawn again and a frame whose scrolled pixels moved must be the same pixels.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

const ROWS: i32[] = [];
for (let i: i32 = 0; i < 30; i++) ROWS.push(i);
const COLORS: string[] = ['bg-blue-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500'];

function App(): i32 {
  return <View className="flex-col w-full h-full bg-slate-200 p-4">
    <View className="grow rounded-3xl overflow-hidden bg-slate-50">
      <ScrollView className="grow">
        <View className="flex-col gap-4 p-4 pt-20">
          {ROWS.map((i: i32): i32 => <View className="flex-row items-center gap-3 p-3 rounded-xl bg-white shadow-lg">
            <View className={`w-10 h-10 rounded-full ${COLORS[i % 4]}`} />
            <Text className="text-base text-slate-800">{`Row ${i}: a card whose shadow crosses the edges`}</Text>
          </View>)}
        </View>
      </ScrollView>
      <View className="absolute top-0 left-0 right-0 h-16 flex-row items-center px-4 bg-white/60 border-b border-slate-300">
        <Text className="text-lg font-semibold text-slate-900">Translucent header</Text>
      </View>
    </View>
  </View>;
}
render(App, 0xe2e8f0, (dt: number) => { });
