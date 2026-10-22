import { createSignal, render, For } from 'zinc:ui/solid';

class Item {
  text: string;
  done: boolean;
  constructor(text: string, done: boolean) { this.text = text; this.done = done; }
}

const [items, setItems] = createSignal<Item[]>([new Item('Bread', false), new Item('Apples', true)]);
const [draft, setDraft] = createSignal<string>('');

function add(): void {
  const text = draft().trim();
  if (text === '') return;
  setItems([...items(), new Item(text, false)]);
  setDraft('');
  console.log(`added "${text}", ${left()} left to buy`);
}

function toggle(item: Item): void {
  setItems(items().map((it: Item) => it === item ? new Item(it.text, !it.done) : it));
  console.log(`${item.text} ${item.done ? 'back on the list' : 'bought'}, ${left()} left to buy`);
}

function clearDone(): void {
  setItems(items().filter((it: Item) => !it.done));
  console.log(`cleared, ${items().length} on the list`);
}

function left(): i32 {
  return items().filter((it: Item) => !it.done).length;
}

interface RowProps { item: Item }

function Row(props: RowProps): i32 {
  const item = props.item;
  return <Button className="flex-row items-center justify-start gap-3 px-4 h-12 rounded-lg bg-white hover:bg-slate-50" onClick={() => toggle(item)}>
    <View className={`w-5 h-5 rounded-full border-2 ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`} />
    <Text className={`text-base ${item.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.text}</Text>
  </Button>;
}

function App(): i32 {
  return <View className="w-full h-full items-center p-8 bg-slate-100">
    <View className="w-[420px] gap-3">
      <Text className="text-3xl font-bold text-slate-900">Shopping list</Text>
      <View className="flex-row gap-2" onSubmit={add}>
        <Input className="grow h-11 px-3 rounded-lg bg-white border border-slate-300" placeholder="Something to buy"
          value={draft()} onInput={(v: string) => setDraft(v)} />
        <Button className="h-11 px-5 rounded-lg bg-indigo-600" onClick={add}>
          <Text className="text-base text-white">Add</Text>
        </Button>
      </View>
      <For each={items()}>{(item: Item) => <Row item={item} />}</For>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-slate-500">{`${left()} left to buy`}</Text>
        <Button className="h-9 px-4 rounded-lg bg-slate-200 hover:bg-slate-300" onClick={clearDone}>
          <Text className="text-sm text-slate-600">Clear bought</Text>
        </Button>
      </View>
    </View>
  </View>;
}

render(App, 0xf1f5f9, null);
