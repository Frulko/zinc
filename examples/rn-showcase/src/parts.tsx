// The app's own building blocks, made of React Native primitives only (View, Text, Pressable, Switch...): a screen frame, sections, cards, list rows,
// buttons, chips, badges, avatars, progress bars, skeletons, empty and error states, and the toast host. Every screen is built from these.
import { useState } from 'zinc:ui/react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CARD, R_CONTROL, R_PILL, T_TITLE, T_HEADING, T_BODY, T_SMALL, T_TINY } from './theme';
import { tr } from './i18n';

/** The children of a component (a function prop: the JSX lowering appends what it returns). */
export function renderKids(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : <View />; }

/** A scrolling screen with the standard gutters. */
export function Screen(p: { children?: () => i32 }) {
  return <ScrollView style={{ flex: 1 }}><View style={s.screen}>{renderKids(p.children)}</View></ScrollView>;
}

/** A titled group: an uppercase caption above a card. */
export function Section(p: { title: string; note?: string; children?: () => i32 }) {
  const c = theme();
  return <View style={{ gap: SP * 2 }}>
    <Text style={[s.caps, { color: c.muted }]}>{tr(p.title).toUpperCase()}</Text>
    <View style={[s.card, { backgroundColor: c.surface, borderColor: c.line }]}>{renderKids(p.children)}</View>
    {p.note !== undefined && <Text style={[s.small, { color: c.faint }]}>{p.note as string}</Text>}
  </View>;
}

/** A row of a grouped list: an icon tile, a title and a subtitle, something on the right, a chevron when it opens something. */
export function Row(p: { icon: string; tint: number; title: string; sub?: string; right?: string; onPress?: () => void; label?: string }) {
  const c = theme();
  return <Pressable style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]} onPress={p.onPress} accessibilityLabel={p.label ?? p.title}>
    <View style={[s.tile, { backgroundColor: p.tint }]}><Icon name={p.icon} size={18} color={() => 0xFFFFFF} /></View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[s.body, { color: c.ink }]} numberOfLines={1}>{p.title}</Text>
      {p.sub !== undefined && <Text style={[s.small, { color: c.muted }]} numberOfLines={1}>{p.sub as string}</Text>}
    </View>
    {p.right !== undefined && <Text style={[s.small, { color: c.muted }]}>{p.right as string}</Text>}
    {p.onPress !== undefined && <Icon name="chevron-right" size={18} color={() => theme().faint} />}
  </Pressable>;
}
export function Divider() { return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme().line, marginLeft: 56 }} />; }

/** A button: 'primary', 'secondary', 'ghost' or 'danger'; `busy` shows a label of progress and ignores presses. */
export function ActionButton(p: { title: string; kind?: string; icon?: string; onPress?: () => void; disabled?: boolean; busy?: boolean; label?: string }) {
  const c = theme();
  const kind = p.kind ?? 'primary', off = p.disabled === true || p.busy === true;
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.danger : kind === 'ghost' ? c.surface : c.raised;
  const fg = kind === 'primary' ? c.accentInk : kind === 'danger' ? 0xFFFFFF : kind === 'ghost' ? c.accent : c.ink;
  return <Pressable style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.6 : 1, borderColor: kind === 'ghost' ? c.line : bg }]} disabled={off}
    onPress={p.onPress} accessibilityLabel={p.label ?? p.title}>
    {p.icon !== undefined && <Icon name={p.icon as string} size={18} color={() => fg} />}
    <Text style={[s.buttonText, { color: fg }]}>{p.busy === true ? tr('Sending…') : p.title}</Text>
  </Pressable>;
}

/** A selectable pill. */
export function Chip(p: { title: string; on: boolean; onPress: () => void }) {
  const c = theme();
  return <Pressable style={[s.chip, { backgroundColor: p.on ? c.ink : c.surface, borderColor: p.on ? c.ink : c.line }]} onPress={p.onPress} accessibilityLabel={p.title}>
    <Text style={[s.small, { color: p.on ? c.bg : c.ink }]}>{p.title}</Text>
  </Pressable>;
}

/** A small status pill: 'ok', 'warn', 'danger', 'info' or 'neutral'. */
export function Badge(p: { text: string; tone: string; dot?: boolean }) {
  const c = theme();
  const fg = p.tone === 'ok' ? c.ok : p.tone === 'warn' ? c.warn : p.tone === 'danger' ? c.danger : p.tone === 'info' ? c.info : c.muted;
  const bg = p.tone === 'ok' ? c.okSoft : p.tone === 'warn' ? c.warnSoft : p.tone === 'danger' ? c.dangerSoft : p.tone === 'info' ? c.infoSoft : c.raised;
  return <View style={[s.badge, { backgroundColor: bg }]}>
    {p.dot === true && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />}
    <Text style={[s.tiny, { color: fg, fontWeight: '600' }]}>{p.text}</Text>
  </View>;
}

/** A round avatar with initials. */
export function Avatar(p: { name: string; tint: number; size?: number }) {
  const n = p.size ?? 36;
  const parts = p.name.split(' ');
  const initials = parts.length > 1 ? parts[0].charAt(0) + parts[1].charAt(0) : p.name.substring(0, 2);
  return <View style={{ width: n, height: n, borderRadius: n / 2, backgroundColor: p.tint, alignItems: 'center', justifyContent: 'center' }} aria-label={p.name}>
    <Text style={{ color: 0xFFFFFF, fontSize: n * 0.38, fontWeight: '700' }}>{initials.toUpperCase()}</Text>
  </View>;
}

/** A progress bar, 0..1. */
export function Progress(p: { value: number; tint?: number }) {
  const c = theme();
  const v = Math.max(0, Math.min(1, p.value));
  return <View style={[s.track, { backgroundColor: c.raised }]} role="progressbar">
    <View style={{ width: `${Math.round(v * 100)}%`, height: 8, borderRadius: 4, backgroundColor: p.tint ?? c.accent }} />
  </View>;
}

/** A grey placeholder block while content loads. */
export function Skeleton(p: { width: number; height: number; round?: boolean }) {
  return <View style={{ width: p.width, height: p.height, borderRadius: p.round === true ? p.height / 2 : 8, backgroundColor: theme().raised }} />;
}
/** Placeholder rows: what a list shows while its first page loads. */
export function SkeletonRows(p: { rows: number }) {
  const out: number[] = [];
  for (let i = 0; i < p.rows; i++) out.push(i);
  return <View style={{ gap: SP * 4, padding: SP * 4 }}>
    {out.map((i: number) => <View style={[s.rowFlat, { gap: SP * 3 }]}>
      <Skeleton width={40} height={40} round={true} />
      <View style={{ flex: 1, gap: SP * 2 }}><Skeleton width={180 - (i % 3) * 30} height={12} /><Skeleton width={120 + (i % 2) * 60} height={10} /></View>
    </View>)}
  </View>;
}

/** The friendly state of a screen with nothing to show (empty, offline, an error, a missing feature): an icon, a title, a line, an action. */
export function EmptyState(p: { icon: string; title: string; body: string; action?: string; onAction?: () => void; tone?: string }) {
  const c = theme();
  const tint = p.tone === 'danger' ? c.danger : p.tone === 'warn' ? c.warn : p.tone === 'ok' ? c.ok : c.accent;
  const soft = p.tone === 'danger' ? c.dangerSoft : p.tone === 'warn' ? c.warnSoft : p.tone === 'ok' ? c.okSoft : c.accentSoft;
  return <View style={s.empty} aria-label={p.title}>
    <View style={[s.emptyIcon, { backgroundColor: soft }]}><Icon name={p.icon} size={26} color={() => tint} /></View>
    <Text style={[s.heading, { color: c.ink, textAlign: 'center' }]}>{p.title}</Text>
    <Text style={[s.small, { color: c.muted, textAlign: 'center' }]}>{p.body}</Text>
    {p.action !== undefined && <ActionButton title={p.action as string} kind="secondary" icon="refresh-cw" onPress={p.onAction} />}
  </View>;
}

/** A label above a value, for the key-value lines of the Platform and About screens. */
export function Line(p: { k: string; v: string }) {
  const c = theme();
  return <View style={s.line}><Text style={[s.small, { color: c.muted }]}>{p.k}</Text><Text style={[s.small, { color: c.ink, fontWeight: '600' }]} numberOfLines={1}>{p.v}</Text></View>;
}

// ---------------------------------------------------------------- toasts: one host in the App, `toast('Saved')` from anywhere
class Toasts { show: (msg: string, icon: string) => void = (msg: string, icon: string): void => {}; }
const toasts = new Toasts();
export function toast(msg: string, icon: string = 'circle-check'): void { toasts.show(msg, icon); }
let toastSerial = 0;
/** The toast host: the last message for 2.4 s above the tab bar. */
export function ToastHost() {
  const c = theme();
  const [msg, setMsg] = useState('');
  const [icon, setIcon] = useState('circle-check');
  toasts.show = (m: string, i: string): void => { setMsg(m); setIcon(i); const k = ++toastSerial; setTimeout((): void => { if (k === toastSerial) setMsg(''); }, 2400); };
  if (msg === '') return <View />;
  return <View style={s.toastWrap}>
    <View style={[s.toast, { backgroundColor: c.ink }]} role="status"><Icon name={icon} size={18} color={() => theme().bg} /><Text style={[s.small, { color: c.bg }]}>{msg}</Text></View>
  </View>;
}

export const s = StyleSheet.create({
  screen: { padding: SP * 4, paddingBottom: SP * 8, gap: SP * 6 },
  caps: { fontSize: T_TINY, fontWeight: '600', letterSpacing: 0.8, marginLeft: SP * 1 },
  card: { borderRadius: R_CARD, borderWidth: 1, overflow: 'hidden' },
  pad: { padding: SP * 4, gap: SP * 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SP * 3, paddingHorizontal: SP * 4, minHeight: 56, paddingVertical: SP * 2 },
  rowFlat: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP * 2 },
  tile: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: T_TITLE, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: T_HEADING, fontWeight: '600' },
  body: { fontSize: T_BODY },
  small: { fontSize: T_SMALL },
  tiny: { fontSize: T_TINY },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP * 2, height: 46, paddingHorizontal: SP * 5, borderRadius: R_CONTROL, borderWidth: 1 },
  buttonText: { fontSize: T_BODY, fontWeight: '600' },
  chip: { height: 32, paddingHorizontal: SP * 3, borderRadius: R_PILL, borderWidth: 1, justifyContent: 'center' },
  badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: SP, height: 22, paddingHorizontal: SP * 2, borderRadius: R_PILL },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  empty: { alignItems: 'center', padding: SP * 6, gap: SP * 3 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SP * 4, minHeight: 30 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: SP * 2, paddingHorizontal: SP * 4, height: 40, borderRadius: R_PILL },
});
