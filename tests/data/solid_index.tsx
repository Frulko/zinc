import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { equal, ok } from 'zinc:assert';

class Item {
  title: string;
  constructor(title: string) { this.title = title; }
}
const first = new Item('A');
const second = new Item('B');
const [items, setItems] = createSignal<Item[]>([first, second]);
let stableMounts = 0;
function StableRow(props: { item: Item }): i32 {
  stableMounts++;
  return <Text>{props.item.title}</Text>;
}
function App(): i32 {
  return <View>
    {items().map((item: Item, index: i32) => <Text>{'map ' + item.title + ' ' + index.toString()}</Text>)}
    <For each={items()}>{(item: Item, index: i32) => <Text>{'for ' + item.title + ' ' + index.toString()}</Text>}</For>
    {items().map((item: Item) => <StableRow item={item} />)}
  </View>;
}
let frame = 0;
render(App, 0x000000, (dt: number) => {
  frame++;
  if (frame === 2) setItems([second, first]);
  if (frame === 3) {
    const tree = ui.dump();
    ok(tree.indexOf('map B 0') >= 0 && tree.indexOf('map A 1') >= 0, 'map indices update after reorder');
    ok(tree.indexOf('for B 0') >= 0 && tree.indexOf('for A 1') >= 0, 'For indices update after reorder');
    equal(stableMounts, 2, 'index-free rows retain their instance');
    setItems([first]);
  }
  if (frame === 4) {
    const tree = ui.dump();
    ok(tree.indexOf('map A 0') >= 0 && tree.indexOf('for A 0') >= 0, 'indices update after removal');
    equal(stableMounts, 2);
    console.log('solid-index: pass');
  }
});
