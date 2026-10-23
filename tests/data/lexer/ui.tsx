// UI-03/07/08: Solid-style components on the host ABI; layout dump is identical on sim and native.
import { createSignal, createMemo, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

interface CardProps { title: string; children: () => i32 }
function Card(props: CardProps): i32 {
  return <View className="flex-col p-2 gap-1 bg-slate-800">
    <Text className="text-amber-400">{props.title}</Text>
    {props.children()}
  </View>;
}

const [count, setCount] = createSignal<i32>(0);
const [items, setItems] = createSignal<string[]>(['a', 'b']);
const doubled = createMemo(() => count() * 2, 0);

function App(): i32 {
  return <View className="flex-col p-4 gap-2 bg-slate-900">
    <Text className="text-xl">Counter</Text>
    <View className="flex-row gap-2 items-center">
      <Button onClick={() => setCount(count() - 1)}><Text>-</Text></Button>
      <Text>count {count()} doubled {doubled()}</Text>
      <Button onClick={() => setCount(count() + 1)}><Text>+</Text></Button>
    </View>
    <Show when={count() > 1} fallback={<Text>small</Text>}>
      <Text className="text-green-500">big!</Text>
    </Show>
    <Card title="list">
      <View className="flex-col">
        <For each={items()}>{(it: string, i: i32) => <Text>{i}: {it}</Text>}</For>
      </View>
    </Card>
  </View>;
}

const root = ui.createNode(ui.VIEW);
ui.insert(root, App(), -1);
ui.setRoot(root);
console.log(ui.dump());
ui.click(ui.find('+'));
ui.click(ui.find('+'));
batch(() => { setItems(['x', 'y', 'z']); setCount(count() + 1); });
console.log(ui.dump());
