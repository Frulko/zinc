// UI-03/07/08: Solid-style components on the host ABI; layout dump is identical on sim and native.
import { createSignal, createMemo, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

interface CardProps { title: string; children: () => i32 }
function Card(props: CardProps): i32 {
  return <view class="flex-col p-2 gap-1 bg-slate-800">
    <text class="text-amber-400">{props.title}</text>
    {props.children()}
  </view>;
}

const [count, setCount] = createSignal<i32>(0);
const [items, setItems] = createSignal<string[]>(['a', 'b']);
const doubled = createMemo(() => count() * 2, 0);

function App(): i32 {
  return <view class="flex-col p-4 gap-2 bg-slate-900">
    <text class="text-xl">Counter</text>
    <view class="flex-row gap-2 items-center">
      <button onClick={() => setCount(count() - 1)}><text>-</text></button>
      <text>count {count()} doubled {doubled()}</text>
      <button onClick={() => setCount(count() + 1)}><text>+</text></button>
    </view>
    <Show when={count() > 1} fallback={<text>small</text>}>
      <text class="text-green-500">big!</text>
    </Show>
    <Card title="list">
      <view class="flex-col">
        <For each={items()}>{(it: string, i: i32) => <text>{i}: {it}</text>}</For>
      </view>
    </Card>
  </view>;
}

const root = ui.createNode(ui.VIEW);
ui.insert(root, App(), -1);
ui.setRoot(root);
console.log(ui.dump());
ui.click(ui.find('+'));
ui.click(ui.find('+'));
batch(() => { setItems(['x', 'y', 'z']); setCount(count() + 1); });
console.log(ui.dump());
