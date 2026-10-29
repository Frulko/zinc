// A row whose second child grows from flex-basis 0 and holds cards that wrap: the row is as tall as the cards wrapped at the width that
// child ends with (one per line here), so the text under the row starts below the last card instead of over the cards.
import { render } from 'zinc:ui/solid';

function Card(props: { label: string }): i32 {
  return <View className="grow basis-[100] h-[20] border border-gray-400"><Text className="text-[12px] text-black">{props.label}</Text></View>;
}

function App(): i32 {
  return <View className="flex-col h-full p-2 bg-white">
    <View className="flex-row gap-2 items-start">
      <View className="w-[40] h-[30] bg-gray-400" />
      <View className="grow basis-0 min-w-0 flex-col">
        <View className="flex-row flex-wrap gap-1"><Card label="1" /><Card label="2" /><Card label="3" /><Card label="4" /></View>
      </View>
    </View>
    <Text className="text-[12px] text-red-600">under the row</Text>
  </View>;
}

render(App, 0xffffff, null);
