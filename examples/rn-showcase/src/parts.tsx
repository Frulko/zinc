// Shared pieces of the showcase: the static styles (StyleSheet.create) and small components built from views, text and canvases only.
import { createSignal } from 'zinc:ui/solid';
import { StyleSheet } from 'zinc:ui';
import { t } from './theme';

export const styles = StyleSheet.create({
  screen: { flexDirection: 'column', paddingHorizontal: 20, paddingTop: 24, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { flexDirection: 'column', borderRadius: 22, overflow: 'hidden', shadowColor: '#1c1917', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14 },
  cardBody: { flexDirection: 'column', padding: 16, gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 34, borderRadius: 999 },
  title: { fontSize: 22, fontWeight: 'bold', letterSpacing: -0.4 },
  display: { fontSize: 34, fontWeight: 'bold', letterSpacing: -1 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14 },
  tiny: { fontSize: 12, letterSpacing: 0.4 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 16 },
  group: { flexDirection: 'column', borderRadius: 18, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  hidden: { display: 'none' },
  bold: { fontWeight: 'bold' },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});

/** A chip that can be selected. */
export function Chip(p: { label: string; on: () => boolean; press: () => void }): i32 {
  return <view style={[styles.pill, { backgroundColor: p.on() ? t().ink : t().surface, borderWidth: 1, borderColor: p.on() ? t().ink : t().line }]} onClick={p.press}>
    <text style={[styles.small, { color: p.on() ? t().bg : t().ink }]}>{p.label}</text>
  </view>;
}

/** A round avatar with initials. */
export function Avatar(p: { initials: string; bg: () => i32 }): i32 {
  return <view style={[styles.avatar, { backgroundColor: p.bg() }]}>
    <text style={[styles.tiny, styles.bold, { color: 0xFFFFFF }]}>{p.initials}</text>
  </view>;
}

/** A switch made of two views; the knob slides with `pos` (0..1, animated by the app). */
export function Switch(p: { pos: () => number; press: () => void }): i32 {
  return <view style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: p.pos() > 0.5 ? t().accent : t().raised }} onClick={p.press}>
    <view style={{ position: 'absolute', top: 3, left: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: 0xFFFFFF, translateX: p.pos() * 20 }} />
  </view>;
}

/** A primary or a quiet button. */
export function Button(p: { label: string; primary: boolean; press: () => void }): i32 {
  return <view style={[styles.button, { backgroundColor: p.primary ? t().accent : t().raised }]} onClick={p.press}>
    <text style={[styles.body, styles.bold, { color: p.primary ? t().accentInk : t().ink }]}>{p.label}</text>
  </view>;
}
