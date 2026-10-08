// zinc:react-native FlatList, SectionList, RefreshControl (ZN-367.03): a 10 000 item FlatList keeps a bounded number of row nodes while it scrolls and
// fires onEndReached once near its end; a pull past the top calls onRefresh and the spinner row shows while refreshing; a numColumns grid packs its
// rows; SectionList keeps the current section's header at the top while its rows scroll under it.
import { useState } from 'zinc:ui/react';
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { View, Text, FlatList, SectionList, ListRenderItemInfo, SectionListRenderItemInfo, SectionHeaderInfo } from 'zinc:react-native';
import { quit } from 'zinc:gfx';

class Item { id: i32; label: string; constructor(id: i32) { this.id = id; this.label = `item ${id}`; } }
const items: Item[] = [];
for (let i = 0; i < 10000; i++) items.push(new Item(i));
const small: Item[] = [];
for (let i = 0; i < 7; i++) small.push(new Item(i));
const log: string[] = [];
let setRefreshingOut: (v: boolean) => void = (v: boolean): void => {};
function App(): i32 {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  setRefreshingOut = setRefreshing;
  return <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#ffffff' }}>
    <View style={{ width: 180 }}>
      <FlatList data={items} renderItem={(x: ListRenderItemInfo<Item>) => <View style={{ height: 40, justifyContent: 'center' }}><Text>{x.item.label}</Text></View>}
        keyExtractor={(it: Item, i: number) => `${it.id}`} ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#dddddd' }} />}
        ListHeaderComponent={() => <Text>header</Text>} ListFooterComponent={() => <Text>footer</Text>}
        getItemLayout={(d: Item[], i: number) => { return { length: 41, offset: 41 * i, index: i }; }}
        onEndReached={() => { log.push('end reached'); }} onEndReachedThreshold={0.5}
        refreshing={refreshing} onRefresh={() => { log.push('refresh'); setRefreshing(true); }} />
    </View>
    <View style={{ flex: 1 }}>
      <View style={{ height: 150 }}>
        <FlatList data={small} numColumns={3} renderItem={(x: ListRenderItemInfo<Item>) => <View style={{ height: 30 }}><Text>{`#${x.index}`}</Text></View>} />
      </View>
      <SectionList sections={[{ title: 'Fruits', data: ['apple', 'pear', 'plum', 'fig', 'kiwi', 'lime', 'date', 'lemon', 'mango', 'peach', 'quince', 'grape'] }, { title: 'Greens', data: ['kale', 'leek', 'pea', 'okra', 'bean', 'corn', 'chard', 'cress', 'endive', 'fennel', 'rocket', 'sorrel'] }, { title: 'Herbs', data: ['basil', 'mint', 'sage', 'dill', 'thyme', 'chive', 'oregano', 'parsley', 'tarragon', 'lovage', 'savory', 'anise'] }]}
        renderItem={(x: SectionListRenderItemInfo<string>) => <View style={{ height: 36 }}><Text>{x.item}</Text></View>}
        renderSectionHeader={(h: SectionHeaderInfo<string>) => <View style={{ height: 24, backgroundColor: '#eeeeee' }}><Text>{h.section.title}</Text></View>} />
    </View>
  </View>;
}
function scrolls(): i32[] { const r: i32[] = []; for (let h = 0; h < 2000; h++) { const n = ui.inspectNode(h); if (n !== null && n.tag === ui.SCROLL) r.push(h); } return r; }
function spinners(): i32 { let k = 0; for (let h = 0; h < 4000; h++) { const n = ui.inspectNode(h); if (n !== null && n.role === 'progressbar') k++; } return k; }
function headerY(title: string): number { const h = ui.find(title); return h < 0 ? -1 : Math.round(ui.screenBox(ui.parentOf(h))[1]); }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  const s = scrolls();
  if (f === 2) {
    console.log(`rows alive at the top: ${ui.childCount(s[0]) < 40} | grid rows ${ui.childCount(s[1])}`);
    ui.scrollTo(s[0], 0, 41 * 9990);
  }
  if (f === 4) { console.log(`near the end: ${log.join(' ')} | rows alive ${ui.childCount(s[0]) < 40}`); ui.scrollTo(s[0], 0, 41 * 9995); }
  if (f === 6) { console.log(`further: ${log.join(' ')}`); log.length = 0; ui.scrollTo(s[0], 0, 0); }
  if (f === 8) { const b = ui.screenBox(s[0]); ui.pointerAt(b[0] + 60, b[1] + 20, true); }
  if (f >= 9 && f <= 14) { const b = ui.screenBox(s[0]); ui.pointerAt(b[0] + 60, b[1] + 20 + (f - 8) * 40, true); }
  if (f === 15) { const b = ui.screenBox(s[0]); ui.pointerAt(b[0] + 60, b[1] + 260, false); }
  if (f === 18) { console.log(`pull: ${log.join(' ')} | spinners while refreshing ${spinners()}`); setRefreshingOut(false); }
  if (f === 19) console.log(`spinners after ${spinners()}`);
  if (f === 20) {
    const top = Math.round(ui.screenBox(s[2])[1]);
    console.log(`sections at rest: Fruits ${headerY('Fruits') - top} Greens ${headerY('Greens') - top}`);
    ui.scrollTo(s[2], 0, 100);
  }
  if (f === 22) { const top = Math.round(ui.screenBox(s[2])[1]); console.log(`scrolled 100: Fruits ${headerY('Fruits') - top} (sticky)`); ui.scrollTo(s[2], 0, 500); }
  if (f === 24) { const top = Math.round(ui.screenBox(s[2])[1]); console.log(`scrolled 500: Greens ${headerY('Greens') - top} (sticky), Fruits ${headerY('Fruits') - top} (pushed up with its section)`); quit(); }
});
