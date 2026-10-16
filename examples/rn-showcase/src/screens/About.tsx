// About: what this app is, what it runs on, and the work it stands on (the licences of what it ships).
import { useState } from 'zinc:ui/react';
import { View, Text, Platform, PixelRatio } from 'zinc:react-native';
import { openLink } from '../links';
import { PROFILE, TIER } from 'zinc:platform';
import { theme, SP } from '../theme';
import { tr } from '../i18n';
import { Screen, Section, Row, Divider, Line, toast, s as k } from '../parts';
import { api } from '../api';

class Credit { name: string; what: string; licence: string; constructor(name: string, what: string, licence: string) { this.name = name; this.what = what; this.licence = licence; } }
const CREDITS: Credit[] = [
  new Credit('Yoga', 'the flexbox layout React Native uses', 'MIT'), new Credit('Lucide', 'the icons', 'ISC'), new Credit('Inter', 'the typeface', 'OFL-1.1'),
  new Credit('SDL3', 'windows, input and audio devices', 'zlib'), new Credit('HarfBuzz', 'text shaping', 'MIT'), new Credit('miniaudio', 'the audio mixer', 'Public domain'),
  new Credit('FFmpeg', 'video decoding (zinc:video)', 'LGPL-2.1'), new Credit('orbit.json', 'the Lottie animation, written for Zinc', 'CC0'),
  new Credit('JSONPlaceholder', 'the public API of the Network tab', 'MIT'),
];
function open(url: string): void { openLink(url).catch((e: Error): void => toast(`Cannot open: ${e.message}`)); }

export function AboutScreen() {
  const c = theme();
  return <Screen>
    <View style={{ alignItems: 'center', gap: SP * 2, paddingVertical: SP * 4 }}>
      <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.accentInk, fontSize: 34, fontWeight: '800' }}>Zn</Text>
      </View>
      <Text style={[k.title, { color: c.ink }]}>rn-showcase</Text>
      <Text style={[k.small, { color: c.muted, textAlign: 'center' }]}>A React Native app on Zinc: one TypeScript source for the interpreter, the native build and every screen size.</Text>
    </View>
    <Section title="Versions">
      <View style={k.pad}>
        <Line k="Platform" v={`${Platform.OS} ${Platform.Version}`} />
        <Line k="Profile" v={`${PROFILE}, tier ${TIER}, @${PixelRatio.get()}x`} />
        <Line k="UI" v="zinc:react-native (React model), Yoga layout" />
        <Line k="Network" v={api.live() ? 'live (jsonplaceholder.typicode.com)' : 'mock (in the app)'} />
      </View>
    </Section>
    <Section title="Links">
      <Row icon="external-link" tint={c.info} title="React Native on Zinc" sub="docs/react-native.md" onPress={() => open('https://github.com/Frulko/zinc/blob/main/docs/react-native.md')} />
      <Divider />
      <Row icon="external-link" tint={c.violet} title="Expo's kitchen sink" sub="what this app is modelled on" onPress={() => open('https://github.com/expo/expo/tree/main/apps/native-component-list')} />
    </Section>
    <Section title="Credits" note="The example's own code is under the licence of the Zinc repository.">
      <View style={k.pad}>{CREDITS.map((cr: Credit) => <View style={{ gap: 1 }}>
        <View style={[k.rowFlat, { justifyContent: 'space-between' }]}><Text style={[k.body, { color: c.ink, fontWeight: '600' }]}>{cr.name}</Text><Text style={[k.tiny, { color: c.muted }]}>{cr.licence}</Text></View>
        <Text style={[k.small, { color: c.muted }]}>{cr.what}</Text>
      </View>)}</View>
    </Section>
  </Screen>;
}
