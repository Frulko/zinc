// Platform: what the app can learn and ask of the device, each with a friendly answer when the device does not have it. Device and screen,
// battery, network, orientation, motion sensors, vibration, clipboard, opening a link, the app's lifecycle and keyboard events, a keyboard-avoiding
// field, safe areas, and a platform-specific file (greeting.ts / greeting.macos.ts).
import { useState, useRef, useEffect } from 'zinc:ui/react';
import { View, Text, TextInput, Platform, PixelRatio, Keyboard, KeyboardEvent, SafeAreaView, KeyboardAvoidingView, StyleSheet, useColorScheme, Dimensions } from 'zinc:react-native';
import { openLink } from '../links';
import { setClipboardText, clipboardText } from 'zinc:gfx';
import { PROFILE, TIER } from 'zinc:platform';
import { theme, SP, R_CONTROL, T_BODY } from '../theme';
import { tr, language, setLanguage } from '../i18n';
import { Screen, Section, ActionButton, Badge, Line, toast, s as k } from '../parts';
import { Segmented } from '../controls';
import { GREETING } from '../greeting';
import { nav, onLeave } from '../nav';
import { prefs, savePrefs } from '../store';

class Status { battery: string = '…'; network: string = '…'; sensor: string = 'not started'; }

export function PlatformScreen() {
  const c = theme();
  const scheme = useColorScheme();
  const win = Dimensions.get('window');
  const [st, setSt] = useState<Status>(new Status());
  const [events, setEvents] = useState<string[]>([]);
  const [clip, setClip] = useState('');
  const [field, setField] = useState('');
  const started = useRef<boolean>(false);
  const log = useRef<string[]>([]);
  const push = (e: string): void => { log.current = [e].concat(log.current.slice(0, 4)); setEvents(log.current); };
  useEffect((): void => {
    if (started.current) return;
    started.current = true;
    const s = new Status();
    const net = navigator.connection;
    s.network = navigator.onLine ? `online · ${net.type}${net.ssid !== '' ? ` · ${net.ssid}` : ''}` : 'offline';
    setSt(s);
    navigator.getBattery().then((b: BatteryManager): void => {
      const n = new Status(); n.network = s.network; n.sensor = s.sensor;
      n.battery = b.source === 'none' && b.charging && b.level === 1 ? 'no battery (mains power)' : `${Math.round(b.level * 100)}%${b.charging ? ' · charging' : ''}`;
      setSt(n);
    }).catch((e: Error): void => {});
    const vis = (e: Event): void => push(`visibility: ${document.visibilityState}`);
    document.addEventListener('visibilitychange', vis);
    const k1 = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent): void => push(`keyboard shown, ${Math.round(e.endCoordinates.height)} px`));
    const k2 = Keyboard.addListener('keyboardDidHide', (e: KeyboardEvent): void => push('keyboard hidden'));
    push(`app ${document.visibilityState}`);
    onLeave((): void => { document.removeEventListener('visibilitychange', vis); k1.remove(); k2.remove(); });
  }, []);
  const sense = (): void => {
    const a = new Accelerometer({ frequency: 10 });
    a.onreading = (e: Event): void => { const n = new Status(); n.battery = st.battery; n.network = st.network; n.sensor = `x ${a.x.toFixed(2)} y ${a.y.toFixed(2)} z ${a.z.toFixed(2)}`; setSt(n); };
    a.onerror = (e: SensorErrorEvent): void => { const n = new Status(); n.battery = st.battery; n.network = st.network; n.sensor = `${tr('Unavailable here')}: ${e.error.message}`; setSt(n); };
    a.start();
    onLeave((): void => a.stop());
  };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1 }}>
      <Screen>
        <Section title="Device">
          <View style={k.pad}>
            <Line k="Platform.OS" v={Platform.OS} />
            <Line k="Platform.Version" v={`${Platform.Version}` !== "" ? `${Platform.Version}` : "n/a"} />
            <Line k="Profile · tier" v={`${PROFILE} · T${TIER}`} />
            <Line k="Window" v={`${Math.round(win.width)} × ${Math.round(win.height)} @${PixelRatio.get()}x`} />
            <Line k="Colour scheme" v={scheme} />
            <Line k="Orientation" v={screen.orientation.type} />
            <Line k={tr('Battery')} v={st.battery} />
            <Line k={tr('Network')} v={st.network} />
          </View>
        </Section>
        <Section title="Language">
          <View style={k.pad}><Segmented options={['English', 'Français']} value={language() === 'fr' ? 1 : 0}
            onChange={(i: number) => { setLanguage(i === 1 ? 'fr' : 'en'); prefs.lang = language(); savePrefs(); nav.relabel(); }} /></View>
        </Section>
        <Section title="Sensors">
          <View style={k.pad}>
            <Line k="Accelerometer" v={st.sensor} />
            <ActionButton title="Read the accelerometer" kind="secondary" icon="activity" onPress={sense} />
            <ActionButton title={tr('Vibrate')} kind="secondary" icon="vibrate" onPress={() => { if (!navigator.vibrate(200)) toast('No vibration motor on this device'); }} />
          </View>
        </Section>
        <Section title="Clipboard">
          <View style={k.pad}>
            <ActionButton title={tr('Copy')} kind="secondary" icon="copy" onPress={() => { setClipboardText('Hello from rn-showcase'); toast(tr('Copy') + ' ✓'); }} />
            <ActionButton title="Paste" kind="secondary" icon="clipboard-list" onPress={() => setClip(clipboardText())} />
            {clip !== '' && <Text style={[k.small, { color: c.muted }]}>{`Clipboard: ${clip}`}</Text>}
          </View>
        </Section>
        <Section title="Open link">
          <View style={k.pad}>
            <ActionButton title={tr('Open link')} kind="secondary" icon="external-link" onPress={() => {
              openLink('https://reactnative.dev').then((): void => toast('Opened in the browser')).catch((e: Error): void => toast(`Cannot open: ${e.message}`));
            }} />
          </View>
        </Section>
        <Section title="Lifecycle">
          <View style={k.pad}>
            {events.map((e: string) => <Text style={[k.small, { color: c.ink }]}>{e}</Text>)}
            <TextInput style={[st2.input, { backgroundColor: c.bg, color: c.ink, borderColor: c.line }]} value={field} onChangeText={setField}
              placeholder="Type here: the page makes room for the keyboard" accessibilityLabel="keyboard test" />
          </View>
        </Section>
        <Section title="Platform-specific file">
          <View style={k.pad}><Badge text={`./greeting on ${Platform.OS}`} tone="info" /><Text style={[k.small, { color: c.ink }]}>{GREETING}</Text></View>
        </Section>
      </Screen>
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const st2 = StyleSheet.create({
  input: { height: 44, borderRadius: R_CONTROL, borderWidth: 1, paddingHorizontal: SP * 3, fontSize: T_BODY },
});
