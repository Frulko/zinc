// The tester's home: a list of pages like React Native's RNTester; RN_TESTER_PAGE opens one, RN_TESTER_SCHEME=dark starts dark.
import { useState } from 'zinc:ui/react';
import { View, Text, Pressable, FlatList, ListRenderItemInfo, Appearance, StyleSheet } from 'zinc:react-native';
import { env } from 'zinc:sys';
import { usePalette } from './kit';
import { PressablePage, SwitchPage, TextInputPage } from './pages/controls';
import { FlatListPage, SectionListPage } from './pages/lists';
import { AnimatedPage, GesturesPage, LayoutAnimationPage } from './pages/motion';
import { StylesPage } from './pages/styles';
import { PlatformPage } from './pages/platform';
import { DialogsPage } from './pages/dialogs';

class Entry { id: string; title: string; about: string; constructor(id: string, title: string, about: string) { this.id = id; this.title = title; this.about = about; } }
const PAGES: Entry[] = [
  new Entry('pressable', 'Pressable · Touchables', 'onPress, onLongPress, pressed feedback, disabled'),
  new Entry('switch', 'Switch · Spinner', 'Switch: controlled value, track colours; ActivityIndicator'),
  new Entry('textinput', 'TextInput · Keyboard', 'controlled text, maxLength, secure, multiline, KeyboardAvoidingView'),
  new Entry('flatlist', 'FlatList', '10 000 rows, pull to refresh, onEndReached, numColumns'),
  new Entry('sectionlist', 'SectionList', 'sticky section headers'),
  new Entry('animated', 'Animated', 'timing, spring, interpolate, colours, loop'),
  new Entry('gestures', 'Gestures', 'PanResponder, Animated.event: drag and spring back, a scroll-driven fade'),
  new Entry('layout', 'LayoutAnimation', 'animated insert and remove'),
  new Entry('dialogs', 'Modal · Alert', 'slide and fade modals, onRequestClose, Alert.alert'),
  new Entry('styles', 'Styles', 'transform, shadows, elevation, borders, run-time values'),
  new Entry('platform', 'Platform · Appearance', 'Platform, Dimensions, PixelRatio, dark scheme'),
];
if (env('RN_TESTER_SCHEME') === 'dark') Appearance.setColorScheme('dark');

/** The body: a page as its own component (its hooks are its own), or the list of pages. */
function renderMain(id: string, open: (id: string) => void): i32 {
  if (id === 'pressable') return <PressablePage />;
  if (id === 'switch') return <SwitchPage />;
  if (id === 'textinput') return <TextInputPage />;
  if (id === 'flatlist') return <FlatListPage />;
  if (id === 'sectionlist') return <SectionListPage />;
  if (id === 'animated') return <AnimatedPage />;
  if (id === 'gestures') return <GesturesPage />;
  if (id === 'layout') return <LayoutAnimationPage />;
  if (id === 'dialogs') return <DialogsPage />;
  if (id === 'styles') return <StylesPage />;
  if (id === 'platform') return <PlatformPage />;
  return <Home open={open} />;
}

function Home(p: { open: (id: string) => void }) {
  const c = usePalette();
  return <FlatList data={PAGES} keyExtractor={(e: Entry) => e.id}
    renderItem={(x: ListRenderItemInfo<Entry>) => <Pressable style={[s.row, { backgroundColor: c.card }]} onPress={() => p.open(x.item.id)}>
      <Text style={[s.rowTitle, { color: c.ink }]}>{x.item.title}</Text>
      <Text style={[s.rowAbout, { color: c.muted }]} numberOfLines={1}>{x.item.about}</Text>
    </Pressable>}
    ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line, marginLeft: 16 }} />} />;
}

export default function App() {
  const c = usePalette();
  const [page, setPage] = useState(env('RN_TESTER_PAGE'));
  const entry = PAGES.find((e: Entry) => e.id === page);
  return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 44 }}>
    <View style={[s.bar, { borderColor: c.line }]}>
      {entry !== undefined && <Pressable style={s.back} onPress={() => setPage('')}><Text style={{ color: c.accent, fontSize: 17 }}>‹ RNTester</Text></Pressable>}
      <Text style={[s.title, { color: c.ink }]}>{entry !== undefined ? (entry as Entry).title : 'RNTester'}</Text>
    </View>
    {renderMain(entry !== undefined ? page : '', setPage)}
  </View>;
}
const s = StyleSheet.create({
  bar: { height: 52, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1 },
  back: { position: 'absolute', left: 12, top: 14 },
  title: { fontSize: 17, fontWeight: '600' },
  row: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  rowTitle: { fontSize: 17 },
  rowAbout: { fontSize: 13 },
});
