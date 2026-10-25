// Photos: zinc:photos in one small app. The access the person gave (and a button to ask, or to change a limited selection), the albums,
// a grid of the chosen album's thumbnails, a tap shows the picture whole, and a button saves a generated picture into the album "Zinc".
//   zinc run examples/photos                                     (ZINC_FAKE_PHOTOS=<a folder of PNG and JPEG files> lends a library)
//   zinc export examples/photos --target ios --ipa --simulator   ("permissions": ["photos"] writes the Info.plist usage texts)
import { render, useState } from 'zinc:ui/react';
import { View, Text, Pressable, ScrollView, SafeAreaView, StyleSheet } from 'zinc:react-native';
import { drawImage, imageWidth, imageHeight, rect } from 'zinc:gfx';
import { Album } from 'zinc:photos';
import { state, Cell, SAVE_ALBUM } from './state';

const INK = 0x18181B, MUTED = 0x71717A, LINE = 0xE4E4E7, ACCENT = 0x0EA5E9, PAPER = 0xFAFAFA;

/** A runtime image drawn into its box: `cover` fills it (cropped), else it fits inside. */
function Picture(p: { image: number; cover: boolean }) {
  return <Canvas style={p.cover ? s.square : s.fill} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, p.cover ? LINE : 0x000000);
    if (p.image < 0) return;
    const iw = imageWidth(p.image as i32), ih = imageHeight(p.image as i32);
    const k = p.cover ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih), dw = iw * k, dh = ih * k;
    drawImage(p.image as i32, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, 0);
  }} />;
}

function Access() {
  const a = state.access;
  const text = a === 'granted' ? 'Photos sees your whole library.' : a === 'limited' ? 'Photos sees the pictures you chose.'
    : a === 'denied' ? 'Access is off: allow it in the settings.' : 'Photos needs to see your library.';
  return <View style={s.card}>
    <Text style={s.text}>{text}</Text>
    {a === 'undetermined' && <Pressable style={s.primary} onPress={() => state.ask()} accessibilityLabel="Allow access">
      <Text style={s.primaryText}>Allow access</Text></Pressable>}
    {a === 'limited' && <Pressable style={s.secondary} onPress={() => state.changeSelection()} accessibilityLabel="Change selection">
      <Text style={s.secondaryText}>Choose more pictures</Text></Pressable>}
  </View>;
}

function Library() {
  return <View style={s.stack}>
    <View style={s.albums}>
      {state.albums.map((a: Album) => <Pressable style={[s.chip, a.id === state.albumId ? s.chipOn : {}]} onPress={() => state.choose(a.id)} accessibilityLabel={a.title}>
        <Text style={a.id === state.albumId ? s.chipTextOn : s.chipText}>{`${a.title} ${a.count}`}</Text>
      </Pressable>)}
    </View>
    <Pressable style={s.primary} onPress={() => state.save()} accessibilityLabel="Save a picture">
      <Text style={s.primaryText}>{`Save a generated picture to ${SAVE_ALBUM}`}</Text>
    </Pressable>
    <View style={s.grid}>
      {state.cells.map((c: Cell) => <Pressable style={s.cell} onPress={() => state.open(c)} accessibilityLabel={c.asset.id}>
        <Picture image={c.image} cover={true} />
      </Pressable>)}
    </View>
  </View>;
}

let version = 0;
function App() {
  const [, setVersion] = useState(0);
  state.onChange(() => setVersion(++version));
  if (state.viewing >= 0) return <View style={s.viewer}>
    <Picture image={state.viewing} cover={false} />
    <Pressable style={s.close} onPress={() => state.close()} accessibilityLabel="Close"><Text style={s.closeText}>Close</Text></Pressable>
  </View>;
  const open = state.access === 'granted' || state.access === 'limited';
  return <SafeAreaView style={s.page}><ScrollView style={s.body}>
    <Text style={s.title}>Photos</Text>
    <Access />
    {open && <Library />}
    {state.message !== '' && <Text style={s.foot}>{state.message}</Text>}
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAPER },
  fill: { flex: 1, alignSelf: 'stretch' },
  square: { width: '100%', aspectRatio: 1 },
  body: { padding: 16, gap: 14 },
  stack: { gap: 14 },
  title: { fontSize: 32, fontWeight: '800', color: INK, paddingTop: 12 },
  card: { borderWidth: 1, borderColor: LINE, backgroundColor: 0xFFFFFF, borderRadius: 16, padding: 16, gap: 12 },
  text: { fontSize: 15, color: INK },
  albums: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: LINE, backgroundColor: 0xFFFFFF, justifyContent: 'center' },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 14, color: INK },
  chipTextOn: { fontSize: 14, color: 0xFFFFFF, fontWeight: '600' },
  primary: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 14, backgroundColor: ACCENT },
  primaryText: { fontSize: 16, fontWeight: '700', color: 0xFFFFFF },
  secondary: { alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 12, borderWidth: 1, borderColor: LINE },
  secondaryText: { fontSize: 15, fontWeight: '600', color: INK },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: '32%', borderRadius: 6, overflow: 'hidden' },
  viewer: { flex: 1, backgroundColor: 0x000000 },
  close: { position: 'absolute', right: 16, top: 52, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 0xFFFFFF, justifyContent: 'center' },
  closeText: { fontSize: 15, fontWeight: '700', color: INK },
  foot: { fontSize: 12, color: MUTED, textAlign: 'center' },
});

state.start();
render(App, PAPER, null);
