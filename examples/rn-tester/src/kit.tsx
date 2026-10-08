// The tester's own pieces, from React Native primitives only: colours of the scheme, a page frame, a titled card, a caption.
import { View, Text, ScrollView, StyleSheet, useColorScheme } from 'zinc:react-native';

export class Palette { bg: number = 0; card: number = 0; ink: number = 0; muted: number = 0; line: number = 0; accent: number = 0; }
const LIGHT = new Palette(), DARK = new Palette();
LIGHT.bg = 0xf2f2f7; LIGHT.card = 0xffffff; LIGHT.ink = 0x000000; LIGHT.muted = 0x6c6c70; LIGHT.line = 0xc6c6c8; LIGHT.accent = 0x007aff;
DARK.bg = 0x000000; DARK.card = 0x1c1c1e; DARK.ink = 0xffffff; DARK.muted = 0x98989f; DARK.line = 0x38383a; DARK.accent = 0x0a84ff;
export function usePalette(): Palette { return useColorScheme() === 'dark' ? DARK : LIGHT; }

/** The children of a frame (a function prop: the JSX lowering appends what a render* call returns). */
export function renderBody(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : <View />; }
export function Card(p: { title: string; children?: () => i32 }) {
  const c = usePalette();
  return <View style={[styles.card, { backgroundColor: c.card }]}>
    <Text style={[styles.cardTitle, { color: c.muted }]}>{p.title.toUpperCase()}</Text>
    {renderBody(p.children)}
  </View>;
}
export function Caption(p: { text: string }) {
  const c = usePalette();
  return <Text style={[styles.caption, { color: c.muted }]}>{p.text}</Text>;
}
export function Page(p: { children?: () => i32 }) {
  const c = usePalette();
  return <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
    <View style={styles.page}>{renderBody(p.children)}</View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { borderRadius: 12, padding: 16, gap: 12 },
  cardTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  caption: { fontSize: 13 },
});
