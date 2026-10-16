// More: the theme (light, dark or the system's; kept between runs) and the rest of the showcase as a grouped list, pushed on the stack.
import { useState } from 'zinc:ui/react';
import { View, Text } from 'zinc:react-native';
import { theme, SP } from '../theme';
import { tr } from '../i18n';
import { Screen, Section, Row, Divider, s as k } from '../parts';
import { Segmented } from '../controls';
import { go } from '../nav';
import { prefs, savePrefs, applyTheme } from '../store';

const THEMES: string[] = ['light', 'dark', 'system'];

export function MoreScreen() {
  const c = theme();
  const [mode, setMode] = useState(Math.max(0, THEMES.indexOf(prefs.theme)));
  const pick = (i: number): void => { setMode(i); prefs.theme = THEMES[i]; savePrefs(); applyTheme(); };
  return <Screen>
    <Section title="Theme" note="Kept between runs. System follows ZINC_COLOR_SCHEME until the engine reads the system setting.">
      <View style={k.pad}><Segmented options={[tr('Light'), tr('Dark'), tr('System')]} value={mode} onChange={pick} /></View>
    </Section>
    <Section title="More">
      <Row icon="image" tint={c.violet} title={tr('Media')} sub="Gallery with zoom, audio player, video" onPress={() => go('media')} />
      <Divider />
      <Row icon="camera" tint={c.warn} title={tr('Camera')} sub="Preview, switch camera, take a photo" onPress={() => go('camera')} />
      <Divider />
      <Row icon="sparkles" tint={c.teal} title={tr('Motion')} sub="Springs, swipe cards, drag to reorder, canvas" onPress={() => go('motion')} />
      <Divider />
      <Row icon="database" tint={c.danger} title={tr('Data')} sub="Notes that persist, search, undo" onPress={() => go('data')} />
      <Divider />
      <Row icon="smartphone" tint={c.info} title={tr('Platform')} sub="Device, battery, network, sensors, clipboard" onPress={() => go('platform')} />
      <Divider />
      <Row icon="info" tint={c.muted} title={tr('About')} sub="Versions, credits, licence" onPress={() => go('about')} />
    </Section>
    <Text style={[k.tiny, { color: c.faint, textAlign: 'center', marginTop: SP * 2 }]}>rn-showcase · one source for every engine</Text>
  </Screen>;
}
