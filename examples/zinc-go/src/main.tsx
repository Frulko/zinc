// Zinc Go's home screen (ZN-631, docs/reports/zinc-next-zinc-go.md): the app that runs your project from `zinc dev --lan`, as Expo Go runs
// one from `expo start`. Scan the QR code zinc dev prints, or type its zinc:// link, and the player (src/app/player.cpp, in the package)
// connects, runs the project and keeps it live: a save on your computer updates the phone in place. This screen is the app's own program:
// the player starts it with what it has to say (args: --message, --last, --connecting) and opens the links it hands to the system.
// The player is also a device of `zinc device` (ZN-792): --device, --address, --code (while a pairing is open), --paired; zinc://pair asks
// it for a new pairing code.
//   zinc export examples/zinc-go --target android --apk     (or --target ios; "player": true in zinc.json)
import { render, useState, useEffect } from 'zinc:ui/react';
import { View, Text, Pressable, TextInput, ScrollView, SafeAreaView, StyleSheet, Platform, ActivityIndicator } from 'zinc:react-native';
import { Linking } from 'zinc:react-native/linking';
import { Icon } from 'zinc:icons';
import { args, env } from 'zinc:sys';
import { drawImage, rect } from 'zinc:gfx';
import { thumbnail } from 'zinc:imageio';
import { Scanner } from './scanner';

// iOS look: system blue, grouped white cards on the system grey, hairline separators
const INK = 0x000000, MUTED = 0x8E8E93, LINE = 0xE5E5EA, ACCENT = 0x007AFF, FILL = 0xF2F2F7, WARN = 0x9A5B00, WARN_SOFT = 0xFFF4D6;

function arg(name: string): string {
  const a = args();
  const i = a.indexOf(name);
  return i >= 0 && i + 1 < a.length ? a[i + 1] : '';
}
const message = arg('--message'), last = arg('--last'), connecting = arg('--connecting'), opening = arg('--opening');
/** The apps zinc device sent to this phone (--app "name<TAB>title", once each): they stay, and a tile starts one again. */
function appsSent(): { name: string, title: string, icon: string }[] {
  const a = args(), out: { name: string, title: string, icon: string }[] = [];
  for (let i = 0; i + 1 < a.length; i++) if (a[i] === '--app') {
    const f = a[i + 1].split('\t');   // name, title, the icon's path
    out.push({ name: f[0], title: f.length > 1 ? f[1] : f[0], icon: f.length > 2 ? f[2] : '' });
  }
  return out;
}
const apps = appsSent();
const device = arg('--device'), address = arg('--address'), code = arg('--code'), paired = arg('--paired');

const TINTS: i32[] = [0x007AFF, 0xFF9500, 0x34C759, 0xAF52DE, 0xFF2D55, 0x5AC8FA, 0xFF3B30, 0x5856D6];
/** A stable colour per app, like an icon of the App Store. */
function tint(name: string): i32 {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return TINTS[h % TINTS.length];
}
/** What a person types: zinc://host:port/code, or host:port/code. */
function linkOf(s: string): string {
  const t = s.trim();
  return t === '' || t.startsWith('zinc://') ? t : 'zinc://' + t;
}
function open(url: string): void {
  console.log(`zinc go: opening ${url}`);
  Linking.openURL(url).catch((e: Error) => console.log(`zinc go: cannot open ${url}: ${e.message}`));   // the system gives it back to the player
}

/** The icon an app arrived with, decoded off the main thread; the coloured initial shows until it is there (or when the app has none). */
function AppIcon(p: { app: { name: string, title: string, icon: string } }) {
  const [img, setImg] = useState(-1);
  useEffect((): void => {
    if (p.app.icon === '') return;
    thumbnail(p.app.icon, 128).then((h: number): void => setImg(h)).catch((): void => {});
  }, []);
  if (img < 0) return <View style={[s.glyph, { backgroundColor: tint(p.app.name) }]}><Text style={s.glyphText}>{p.app.title.slice(0, 1).toUpperCase()}</Text></View>;
  return <Canvas style={s.glyph} onDraw={(x: i32, y: i32, w: i32, h: i32) => { drawImage(img as i32, x, y, w, h, 255, 11); }} />;
}

function Home() {
  const [typed, setTyped] = useState('');
  const [scanning, setScanning] = useState(env('ZINC_GO_SCAN') === '1');   // a test opens the scanner at once (tests/t1/zinc_go_home.sh)
  if (opening !== '') return <View style={s.splash} accessibilityLabel={`Opening ${opening}`}>   {/* an app of this phone starts: its splash */}
    <Text style={s.splashTitle}>{opening}</Text>
    <ActivityIndicator size="large" color="#007AFF" />
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
      <Text style={s.label}>Apps on this phone</Text>
      {apps.map((app) => <View key={app.name} style={s.row}>
        <Pressable style={({ pressed }) => [s.tile, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(`zinc://open/${app.name}`)} accessibilityLabel={`Open ${app.title}`}>
          <AppIcon app={app} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.tileTitle} numberOfLines={1}>{app.title}</Text>
            {app.title !== app.name && <Text style={s.tileName} numberOfLines={1}>{app.name}</Text>}
          </View>
        </Pressable>
        {Platform.OS === 'ios' && <Pressable style={({ pressed }) => [s.icon, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(`zinc://shortcut/${app.name}`)} accessibilityLabel={`Add ${app.title} to the Home Screen`}>
          <Icon name="square-plus" size={20} color={() => ACCENT} />
        </Pressable>}
        <Pressable style={({ pressed }) => [s.icon, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(`zinc://delete/${app.name}`)} accessibilityLabel={`Delete ${app.title}`}>
          <Icon name="x" size={18} color={() => MUTED} />
        </Pressable>
      </View>)}
    </View>}
    <Pressable style={({ pressed }) => [s.primary, { opacity: pressed ? 0.6 : 1 }]} onPress={() => setScanning(true)} accessibilityLabel="Scan QR code">
      <Icon name="qr-code" size={20} color={() => 0xFFFFFF} /><Text style={s.primaryText}>Scan QR code</Text>
    </Pressable>
    <View style={s.card}>
      <Text style={s.label}>Or type the link</Text>
      <TextInput style={s.input} value={typed} onChangeText={setTyped} placeholder="zinc://192.168.1.10:8090/code" autoCapitalize="none"
        keyboardType="url" autoCorrect={false} onSubmitEditing={() => open(linkOf(typed))} accessibilityLabel="Link" />
      {typed !== '' && <Pressable style={s.secondary} onPress={() => setTyped('')} accessibilityLabel="Clear link">
        <Text style={s.secondaryText}>Clear</Text>
      </Pressable>}
      <Pressable style={({ pressed }) => [s.secondary, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(linkOf(typed))} accessibilityLabel="Open link">
        <Icon name="link" size={18} color={() => ACCENT} /><Text style={s.secondaryText}>Open</Text>
      </Pressable>
    </View>
    {last !== '' && <Pressable style={({ pressed }) => [s.secondary, { opacity: pressed ? 0.6 : 1 }]} onPress={() => open(last)} accessibilityLabel="Open again">
      <Icon name="refresh-cw" size={18} color={() => ACCENT} /><Text style={s.secondaryText}>{`Open again: ${last.split('/')[2]}`}</Text>
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
          <Icon name="link" size={18} color={() => ACCENT} /><Text style={s.secondaryText}>Pair another computer</Text>
        </Pressable>
      </View>}
    </View>}
    <Text style={s.foot}>{`Hold three fingers for one second to return to Zinc Go. Shake the ${Platform.OS === 'ios' ? 'phone' : 'device'} or press the Menu key to reload or go home.`}</Text>
  </View></ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: FILL },
  scroll: { flex: 1 },   // the screen's height, so what is longer scrolls
  body: { padding: 20, paddingBottom: 40, gap: 20 },
  head: { gap: 4, paddingTop: 16 },
  title: { fontSize: 34, fontWeight: '700', color: INK },
  sub: { fontSize: 15, color: MUTED },
  card: { backgroundColor: 0xFFFFFF, borderRadius: 14, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  text: { fontSize: 15, color: INK },
  label: { fontSize: 13, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },
  input: { height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: INK, backgroundColor: FILL },
  primary: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 14, backgroundColor: ACCENT },
  primaryText: { fontSize: 17, fontWeight: '600', color: 0xFFFFFF },
  secondary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 12, backgroundColor: 0xFFFFFF },
  secondaryText: { fontSize: 17, fontWeight: '500', color: ACCENT },
  stack: { gap: 12 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: FILL },
  splashTitle: { fontSize: 30, fontWeight: '700', color: INK, textAlign: 'center', paddingHorizontal: 24 },
  tile: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 },
  glyph: { width: 48, height: 48, borderRadius: 11, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  glyphText: { fontSize: 22, fontWeight: '700', color: 0xFFFFFF },
  tileTitle: { fontSize: 17, fontWeight: '500', color: INK },
  tileName: { fontSize: 13, color: MUTED },
  get: { height: 28, paddingHorizontal: 16, borderRadius: 14, backgroundColor: FILL, alignItems: 'center', justifyContent: 'center' },
  getText: { fontSize: 13, fontWeight: '700', color: ACCENT },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  code: { fontSize: 40, fontWeight: '700', color: INK, letterSpacing: 6, textAlign: 'center' },
  mono: { fontSize: 13, color: INK, textAlign: 'center' },
  foot: { fontSize: 13, color: MUTED, textAlign: 'center' },
});

render(Home, 0xF2F2F7, null);
