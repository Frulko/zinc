// Zinc Go's home screen (ZN-631, docs/reports/zinc-next-zinc-go.md): the app that runs your project from `zinc dev --lan`, as Expo Go runs
// one from `expo start`. Scan the QR code zinc dev prints, or type its zinc:// link, and the player (src/app/player.cpp, in the package)
// connects, runs the project and keeps it live: a save on your computer updates the phone in place. This screen is the app's own program:
// the player starts it with what it has to say (args: --message, --last, --connecting) and opens the links it hands to the system.
//   zinc export examples/zinc-go --target android --apk     (or --target ios; "player": true in zinc.json)
import { render, useState } from 'zinc:ui/react';
import { View, Text, Pressable, TextInput, ScrollView, SafeAreaView, StyleSheet, Platform } from 'zinc:react-native';
import { Linking } from 'zinc:react-native/linking';
import { Icon } from 'zinc:icons';
import { args, env } from 'zinc:sys';
import { Scanner } from './scanner';

const INK = 0x18181B, MUTED = 0x71717A, LINE = 0xE4E4E7, ACCENT = 0x0EA5E9, WARN = 0xB45309, WARN_SOFT = 0xFEF3C7;

function arg(name: string): string {
  const a = args();
  const i = a.indexOf(name);
  return i >= 0 && i + 1 < a.length ? a[i + 1] : '';
}
const message = arg('--message'), last = arg('--last'), connecting = arg('--connecting');

/** What a person types: zinc://host:port/code, or host:port/code. */
function linkOf(s: string): string {
  const t = s.trim();
  return t === '' || t.startsWith('zinc://') ? t : 'zinc://' + t;
}
function open(url: string): void {
  console.log(`zinc go: opening ${url}`);
  Linking.openURL(url).catch((e: Error) => console.log(`zinc go: cannot open ${url}: ${e.message}`));   // the system gives it back to the player
}

function Home() {
  const [typed, setTyped] = useState(last);
  const [scanning, setScanning] = useState(env('ZINC_GO_SCAN') === '1');   // a test opens the scanner at once (tests/t1/zinc_go_home.sh)
  if (scanning) return <Scanner onCode={(url: string) => { setScanning(false); open(url); }} onClose={() => setScanning(false)} />;
  return <SafeAreaView style={s.page}><ScrollView style={s.body}>
    <View style={s.head}>
      <Text style={s.title}>Zinc Go</Text>
      <Text style={s.sub}>Run your project from your computer: start it with zinc dev --lan, then scan the QR code it prints.</Text>
    </View>
    {connecting !== '' && <View style={s.card}><Text style={s.text}>{`Connecting to ${connecting.split('/')[2]}...`}</Text></View>}
    {message !== '' && <View style={[s.card, { backgroundColor: WARN_SOFT, borderColor: WARN_SOFT }]}>
      <View style={s.row}><Icon name="circle-alert" size={18} color={() => WARN} /><Text style={[s.text, { color: WARN, flex: 1 }]}>{message}</Text></View>
    </View>}
    <Pressable style={s.primary} onPress={() => setScanning(true)} accessibilityLabel="Scan QR code">
      <Icon name="camera" size={20} color={() => 0xFFFFFF} /><Text style={s.primaryText}>Scan QR code</Text>
    </Pressable>
    <View style={s.card}>
      <Text style={s.label}>Or type the link</Text>
      <TextInput style={s.input} value={typed} onChangeText={setTyped} placeholder="zinc://192.168.1.10:8090/code" autoCapitalize="none"
        keyboardType="url" onSubmitEditing={() => open(linkOf(typed))} accessibilityLabel="Link" />
      <Pressable style={s.secondary} onPress={() => open(linkOf(typed))} accessibilityLabel="Open link">
        <Icon name="link" size={18} color={() => INK} /><Text style={s.secondaryText}>Open</Text>
      </Pressable>
    </View>
    {last !== '' && <Pressable style={s.secondary} onPress={() => open(last)} accessibilityLabel="Open again">
      <Icon name="refresh-cw" size={18} color={() => INK} /><Text style={s.secondaryText}>{`Open again: ${last.split('/')[2]}`}</Text>
    </Pressable>}
    <Text style={s.foot}>{`In a project: shake the ${Platform.OS === 'ios' ? 'phone' : 'device'}, press with three fingers or the Menu key for the dev menu (reload, back home).`}</Text>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 0xFAFAFA },
  body: { padding: 20, gap: 16 },
  head: { gap: 6, paddingTop: 12 },
  title: { fontSize: 32, fontWeight: '800', color: INK },
  sub: { fontSize: 15, color: MUTED },
  card: { borderWidth: 1, borderColor: LINE, backgroundColor: 0xFFFFFF, borderRadius: 16, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  text: { fontSize: 15, color: INK },
  label: { fontSize: 13, fontWeight: '600', color: MUTED },
  input: { height: 46, borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: INK, backgroundColor: 0xFFFFFF },
  primary: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 14, backgroundColor: ACCENT },
  primaryText: { fontSize: 17, fontWeight: '700', color: 0xFFFFFF },
  secondary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: 0xFFFFFF },
  secondaryText: { fontSize: 15, fontWeight: '600', color: INK },
  foot: { fontSize: 12, color: MUTED, textAlign: 'center' },
});

render(Home, 0xFAFAFA, null);
