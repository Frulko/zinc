// native-view: a plugin's own native view (ZN-1075, docs/plugins/appkit.md "Plugin views"). plugins/levels declares <LevelIndicator> in its spec, with
// typed props and an event; `zinc native-gen --views` writes its Objective-C++ glue and the plugin implements it with an NSLevelIndicator. Under
// "render": "native" on macOS zinc:appkit mounts that view for the component's kind; ZINC_RENDER=drawn, or another platform, draws the same node.
import 'zinc:appkit';
import { createSignal, render } from 'zinc:ui/solid';
import { LevelIndicator } from 'zinc:levels';

const [rating, setRating] = createSignal<number>(3);
const [battery] = createSignal<number>(7);

function App(): i32 {
  return <View className="flex-col gap-4 p-6 w-full h-full">
    <Text className="text-lg font-semibold">A plugin's native view</Text>
    <View className="flex-row items-center gap-3">
      <Text className="w-[80px]">Rating</Text>
      <LevelIndicator value={rating} max={5} style="rating" editable onChange={setRating} className="w-[90px]" />
      <Text>{`${rating()} of 5`}</Text>
    </View>
    <View className="flex-row items-center gap-3">
      <Text className="w-[80px]">Battery</Text>
      <LevelIndicator value={battery} max={10} style="continuous" className="w-[160px]" />
    </View>
  </View>;
}

render(App, 0xffffff, null);
