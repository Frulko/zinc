// Home: a hero card, live status chips (network mode, theme, notes, language) and a grid of quick actions that open every part of the showcase.
import { useState } from 'zinc:ui/react';
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { theme, Palette, SP, R_CARD, T_DISPLAY } from '../theme';
import { tr, language } from '../i18n';
import { Screen, Badge, s as k } from '../parts';
import { go } from '../nav';
import { api } from '../api';
import { notes, prefs } from '../store';

class Action { id: string; title: string; icon: string; sub: string; constructor(id: string, title: string, icon: string, sub: string) { this.id = id; this.title = title; this.icon = icon; this.sub = sub; } }
const ACTIONS: Action[] = [
  new Action('components', 'Components', 'shapes', 'Buttons, sheets, toasts'), new Action('forms', 'Forms', 'clipboard-list', 'Validation, pickers'),
  new Action('network', 'Network', 'wifi', 'fetch, WebSocket'), new Action('media', 'Media', 'image', 'Gallery, audio, video'),
  new Action('camera', 'Camera', 'camera', 'Live preview'), new Action('motion', 'Motion', 'sparkles', 'Springs, gestures'),
  new Action('data', 'Data', 'database', 'Notes that persist'), new Action('platform', 'Platform', 'smartphone', 'Device, sensors'),
];
function tint(c: Palette, i: number): number { const t = [c.accent, c.info, c.ok, c.violet, c.warn, c.teal, c.danger, c.muted]; return t[i % t.length]; }

export function HomeScreen() {
  const c = theme();
  const win = useWindowDimensions();
  const cols = win.width >= 640 ? 4 : 2;
  const tileW = (Math.min(win.width, 960) - SP * 8 - SP * 3 * (cols - 1)) / cols;
  const open = notes.filter((n) => !n.done).length;
  return <Screen>
    <View style={[st.hero, { backgroundColor: c.accent }]}>
      <View style={[st.orb, { backgroundColor: c.accentInk, opacity: 0.12, right: -40, top: -50 }]} />
      <View style={[st.orb, { backgroundColor: c.accentInk, opacity: 0.08, right: 60, top: 70, width: 120, height: 120 }]} />
      <Text style={[k.small, { color: c.accentInk, opacity: 0.85 }]}>{tr('Good to see you')}{prefs.nickname !== '' ? `, ${prefs.nickname}` : ''}</Text>
      <Text style={[st.display, { color: c.accentInk }]}>{tr('A React Native app on Zinc')}</Text>
      <Text style={[k.body, { color: c.accentInk, opacity: 0.9 }]}>{tr('Everything here is written like an Expo app and runs without a browser.')}</Text>
    </View>

    <View style={{ gap: SP * 2 }}>
      <Text style={[k.caps, { color: c.muted }]}>{tr('Status').toUpperCase()}</Text>
      <View style={k.wrap}>
        <Badge text={api.live() ? tr('Online') : tr('Mock network')} tone={api.live() ? 'ok' : 'info'} dot={true} />
        <Badge text={`${tr('Theme')}: ${tr(prefs.theme === 'system' ? 'System' : prefs.theme === 'dark' ? 'Dark' : 'Light')}`} tone="neutral" />
        <Badge text={`${tr('Notes')}: ${open}`} tone={open > 0 ? 'warn' : 'neutral'} />
        <Badge text={language() === 'fr' ? 'Français' : 'English'} tone="neutral" />
        <Badge text={Platform.OS} tone="neutral" />
      </View>
    </View>

    <View style={{ gap: SP * 2 }}>
      <Text style={[k.caps, { color: c.muted }]}>{tr('Quick actions').toUpperCase()}</Text>
      <View style={[k.wrap, { gap: SP * 3 }]}>
        {ACTIONS.map((a: Action, i: number) => <Pressable style={[st.tile, { width: tileW, backgroundColor: c.surface, borderColor: c.line }]} onPress={() => go(a.id)} accessibilityLabel={tr(a.title)}>
          <View style={[st.tileIcon, { backgroundColor: tint(c, i) }]}><Icon name={a.icon} size={20} color={() => 0xFFFFFF} /></View>
          <Text style={[k.heading, { color: c.ink }]}>{tr(a.title)}</Text>
          <Text style={[k.small, { color: c.muted }]} numberOfLines={1}>{a.sub}</Text>
        </Pressable>)}
      </View>
    </View>

    <Pressable style={[st.about, { backgroundColor: c.surface, borderColor: c.line }]} onPress={() => go('about')} accessibilityLabel={tr('About')}>
      <Icon name="info" size={20} color={() => theme().muted} />
      <Text style={[k.small, { color: c.muted, flex: 1 }]}>Interpreter, AOT, one source. Versions and credits</Text>
      <Icon name="chevron-right" size={18} color={() => theme().faint} />
    </Pressable>
  </Screen>;
}

const st = StyleSheet.create({
  hero: { borderRadius: R_CARD, padding: SP * 6, gap: SP * 2, overflow: 'hidden' },
  orb: { position: 'absolute', width: 180, height: 180, borderRadius: 90 },
  display: { fontSize: T_DISPLAY - 4, fontWeight: '800', letterSpacing: -0.8, lineHeight: 36 },
  tile: { borderRadius: 18, borderWidth: 1, padding: SP * 4, gap: SP * 2 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: SP },
  about: { flexDirection: 'row', alignItems: 'center', gap: SP * 3, padding: SP * 4, borderRadius: 16, borderWidth: 1 },
});
