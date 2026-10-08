// FlatList over 10 000 rows (only the visible ones exist), pull to refresh and onEndReached; a numColumns grid; SectionList with sticky headers.
import { useState } from 'zinc:ui/react';
import { View, Text, FlatList, SectionList, ListRenderItemInfo, SectionListRenderItemInfo, SectionHeaderInfo, StyleSheet } from 'zinc:react-native';
import { usePalette } from '../kit';

class Row { id: i32; title: string; constructor(id: i32) { this.id = id; this.title = `Row ${id + 1}`; } }
const ROWS: Row[] = [];
for (let i = 0; i < 10000; i++) ROWS.push(new Row(i));
const COLORS: number[] = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x5ac8fa, 0x007aff, 0x5856d6, 0xaf52de, 0xff2d55];

export function FlatListPage() {
  const c = usePalette();
  const [refreshing, setRefreshing] = useState(false);
  const [pulls, setPulls] = useState(0);
  const [ends, setEnds] = useState(0);
  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <Text style={[s.status, { color: c.muted }]}>{`10 000 rows · refreshed ${pulls}x · end reached ${ends}x${refreshing ? ' · refreshing' : ''}`}</Text>
    <View style={{ height: 120 }}>
      <FlatList data={COLORS} numColumns={3} keyExtractor={(n: number) => `${n}`}
        renderItem={(x: ListRenderItemInfo<number>) => <View style={[s.swatch, { backgroundColor: x.item }]} />} />
    </View>
    <FlatList data={ROWS} keyExtractor={(r: Row) => `${r.id}`}
      renderItem={(x: ListRenderItemInfo<Row>) => <View style={[s.row, { backgroundColor: c.card }]}>
        <View style={[s.dot, { backgroundColor: COLORS[x.index % COLORS.length] }]} />
        <Text style={{ color: c.ink, fontSize: 17 }}>{x.item.title}</Text>
      </View>}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line, marginLeft: 52 }} />}
      ListHeaderComponent={() => <Text style={[s.header, { color: c.muted }]}>PULL DOWN TO REFRESH</Text>}
      getItemLayout={(d: Row[], i: number) => { return { length: 45, offset: 45 * i, index: i }; }}
      refreshing={refreshing} onRefresh={() => { setRefreshing(true); setPulls(pulls + 1); }}
      onEndReached={() => { setEnds(ends + 1); }} />
  </View>;
}

const FOOD = [
  { title: 'Fruits', data: ['Apple', 'Banana', 'Cherry', 'Fig', 'Grape', 'Kiwi', 'Lemon', 'Mango'] },
  { title: 'Vegetables', data: ['Artichoke', 'Beet', 'Carrot', 'Fennel', 'Leek', 'Onion', 'Pea', 'Radish'] },
  { title: 'Herbs', data: ['Basil', 'Chive', 'Dill', 'Mint', 'Oregano', 'Parsley', 'Sage', 'Thyme'] },
];
export function SectionListPage() {
  const c = usePalette();
  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <SectionList sections={FOOD}
      renderItem={(x: SectionListRenderItemInfo<string>) => <View style={[s.row, { backgroundColor: c.card }]}><Text style={{ color: c.ink, fontSize: 17 }}>{x.item}</Text></View>}
      renderSectionHeader={(h: SectionHeaderInfo<string>) => <View style={[s.section, { backgroundColor: c.bg }]}><Text style={[s.sectionText, { color: c.muted }]}>{h.section.title}</Text></View>}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line, marginLeft: 16 }} />} />
  </View>;
}

const s = StyleSheet.create({
  status: { fontSize: 13, padding: 12 },
  swatch: { height: 36, margin: 2, borderRadius: 8 },
  row: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  dot: { width: 24, height: 24, borderRadius: 12 },
  header: { fontSize: 13, padding: 12 },
  section: { paddingHorizontal: 16, paddingVertical: 6 },
  sectionText: { fontSize: 13, fontWeight: '600' },
});
