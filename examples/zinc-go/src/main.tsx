// Zinc Go's home screen (ZN-631, docs/reports/zinc-next-zinc-go.md): the app that runs your project from `zinc dev --lan`, as Expo Go runs
// one from `expo start`. Scan the QR code zinc dev prints, or type its zinc:// link, and the player (src/app/player.cpp, in the package)
// connects, runs the project and keeps it live: a save on your computer updates the phone in place. This screen is the app's own program:
// the player starts it with what it has to say (args: --message, --last, --connecting) and opens the links it hands to the system.
// The player is also a device of `zinc device` (ZN-792): --device, --address, --code (while a pairing is open), --paired; zinc://pair asks
// it for a new pairing code.
//   zinc export examples/zinc-go --target android --apk     (or --target ios; "player": true in zinc.json)
import { render, useState } from 'zinc:ui/react';
import { View, Text, Pressable, TextInput, ScrollView, SafeAreaView, StyleSheet, Platform, ActivityIndicator } from 'zinc:react-native';
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
const message = arg('--message'), last = arg('--last'), connecting = arg('--connecting'), opening = arg('--opening');
/** The apps zinc device sent to this phone (--app "name<TAB>title", once each): they stay, and a tile starts one again. */
function appsSent(): { name: string, title: string }[] {
  const a = args(), out: { name: string, title: string }[] = [];
  for (let i = 0; i + 1 < a.length; i++) if (a[i] === '--app') {
    const t = a[i + 1].indexOf('\t');
    out.push(t < 0 ? { name: a[i + 1], title: a[i + 1] } : { name: a[i + 1].slice(0, t), title: a[i + 1].slice(t + 1) });
  }
  return out;
}
const apps = appsSent();
const device = arg('--device'), address = arg('--address'), code = arg('--code'), paired = arg('--paired');

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
  if (opening !== '') return <View style={s.splash} accessibilityLabel={`Opening ${opening}`}>   {/* an app of this phone starts: its splash */}
    <Text style={s.splashTitle}>{opening}</Text>
    <ActivityIndicator size="large" color="#0EA5E9" />
    <Text style={s.foot}>Zinc Go</Text>
  </View>;
  if (scanning) return <Scanner onCode={(url: string) => { setScanning(false); open(url); }} onClose={() => setScanning(false)} />;
  return <SafeAreaView style={s.page}><ScrollView style={s.scroll}><View style={s.body}>
    <View style={s.head}>
      <Text style={s.title}>Zinc Go</Text>
      <Text style={s.sub}>Run your project from your computer: start it with zinc dev --lan, then scan the QR code it prints.</Text>
    </View>
    {connecting !== '' && <View style={s.card}><Text style={s.text}>{`Connecting to ${connecting.split('/')[2]}...`}</Text></View>}
    {message !== '' && <View style={[s.card, { backgroundColor: WARN_SOFT, borderColor: WARN_SOFT }]}>
      <View style={s.row}><Icon name="circle-alert" size={18} color={() => WARN} /><Text style={[s.text, { color: WARN, flex: 1 }]}>{message}</Text></View>
    </View>}
    {apps.length > 0 && <View style={s.card} accessibilityLabel="Your apps">
      <Text style={s.label}>Your apps</Text>
      {apps.map((app) => <View key={app.name} style={s.row}>
        <Pressable style={({ pressed }) => [s.tile, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(`zinc://open/${app.name}`)} accessibilityLabel={`Open ${app.title}`}>
          <Text style={s.tileTitle}>{app.title}</Text>
          {app.title !== app.name && <Text style={s.tileName}>{app.name}</Text>}
        </Pressable>
        {Platform.OS === 'ios' && <Pressable style={({ pressed }) => [s.icon, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(`zinc://shortcut/${app.name}`)} accessibilityLabel={`Add ${app.title} to the Home Screen`}>
          <Icon name="square-plus" size={18} color={() => INK} />
        </Pressable>}
        <Pressable style={({ pressed }) => [s.icon, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(`zinc://delete/${app.name}`)} accessibilityLabel={`Delete ${app.title}`}>
          <Icon name="x" size={18} color={() => MUTED} />
        </Pressable>
      </View>)}
    </View>}
    <Pressable style={({ pressed }) => [s.primary, { opacity: pressed ? 0.6 : 1 }]} onPress={() => setScanning(true)} accessibilityLabel="Scan QR code">
      <Icon name="camera" size={20} color={() => 0xFFFFFF} /><Text style={s.primaryText}>Scan QR code</Text>
    </Pressable>
    <View style={s.card}>
      <Text style={s.label}>Or type the link</Text>
      <TextInput style={s.input} value={typed} onChangeText={setTyped} placeholder="zinc://192.168.1.10:8090/code" autoCapitalize="none"
        keyboardType="url" onSubmitEditing={() => open(linkOf(typed))} accessibilityLabel="Link" />
      <Pressable style={({ pressed }) => [s.secondary, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(linkOf(typed))} accessibilityLabel="Open link">
        <Icon name="link" size={18} color={() => INK} /><Text style={s.secondaryText}>Open</Text>
      </Pressable>
    </View>
    {last !== '' && <Pressable style={({ pressed }) => [s.secondary, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(last)} accessibilityLabel="Open again">
      <Icon name="refresh-cw" size={18} color={() => INK} /><Text style={s.secondaryText}>{`Open again: ${last.split('/')[2]}`}</Text>
    </Pressable>}
    {device !== '' && <View style={s.card} accessibilityLabel="This device">
      <Text style={s.label}>{`This device: ${device} at ${address}`}</Text>
      {code !== '' ? <View style={s.stack}>
        <Text style={s.code}>{code}</Text>
        <Text style={s.mono}>{`zinc device pair ${address} ${code}`}</Text>
        <Text style={s.sub}>Type this on your computer, then zinc device deploy runs a project here.</Text>
      </View> : <View style={s.stack}>
        <Text style={s.text}>{paired !== '' ? `Paired with ${paired}. On it: zinc device deploy, or zinc dev --device ${device}.` : `On your computer: zinc device deploy, or zinc dev --device ${device}.`}</Text>
        <Pressable style={({ pressed }) => [s.secondary, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open('zinc://pair')} accessibilityLabel="New pairing code">
          <Icon name="link" size={18} color={() => INK} /><Text style={s.secondaryText}>Pair another computer</Text>
        </Pressable>
      </View>}
    </View>}
    <Text style={s.foot}>{`In a project: shake the ${Platform.OS === 'ios' ? 'phone' : 'device'}, press with three fingers or the Menu key for the dev menu (reload, back home).`}</Text>
  </View></ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 0xFAFAFA },
  scroll: { flex: 1 },   // the screen's height, so what is longer scrolls
  body: { padding: 20, paddingBottom: 40, gap: 16 },
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
  stack: { gap: 12 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: 0xFAFAFA },
  splashTitle: { fontSize: 30, fontWeight: '800', color: INK, textAlign: 'center', paddingHorizontal: 24 },
  tile: { flex: 1, minHeight: 52, justifyContent: 'center', borderRadius: 12, backgroundColor: 0xF4F4F5, paddingHorizontal: 14, paddingVertical: 8 },
  tileTitle: { fontSize: 16, fontWeight: '700', color: INK },
  tileName: { fontSize: 12, color: MUTED },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  code: { fontSize: 40, fontWeight: '800', color: INK, letterSpacing: 6, textAlign: 'center' },
  mono: { fontSize: 13, color: INK, textAlign: 'center' },
  foot: { fontSize: 12, color: MUTED, textAlign: 'center' },
});

render(Home, 0xFAFAFA, null);
