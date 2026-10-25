// Geo: "where am I" on zinc:location (docs/plugins/location.md), one screen in the React Native model. See README.md.
//   build/zinc run examples/geo                                   (ZINC_FAKE_LOCATION="lat,lon;lat,lon..." walks a fake path)
// Test hooks: GEO_AUTO=1 asks, locates and starts the watch by itself, GEO_LOG=1 prints each change (tests/t1/location.sh).
import { render, useState, useEffect } from 'zinc:ui/react';
import { View, Text, Pressable, ScrollView, SafeAreaView, StyleSheet } from 'zinc:react-native';
import { env } from 'zinc:sys';
import { Position } from 'zinc:location';
import { geo } from './state';

const INK = 0x18181B, MUTED = 0x71717A, LINE = 0xE4E4E7, ACCENT = 0x0EA5E9, OK = 0x15803D, WARN = 0xB45309, WARN_SOFT = 0xFEF3C7;
const fixed = (v: number, n: number): string => v.toFixed(n);
const metres = (m: number): string => m < 1000 ? `${Math.round(m)} m` : `${fixed(m / 1000, 2)} km`;

function Row(p: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.label}>{p.label}</Text><Text style={s.value}>{p.value}</Text></View>;
}
function Btn(p: { title: string; onPress: () => void; primary?: boolean }) {
  const primary = p.primary ?? false;
  return <Pressable style={({ pressed }) => [primary ? s.primary : s.secondary, { opacity: pressed ? 0.6 : 1 }]} onPress={p.onPress} accessibilityLabel={p.title}>
    <Text style={primary ? s.primaryText : s.secondaryText}>{p.title}</Text>
  </Pressable>;
}

function Fix(p: { pos: Position }) {
  const pos = p.pos;
  return <View style={s.stack}>
    <Text style={s.coords}>{`${fixed(pos.latitude, 5)}, ${fixed(pos.longitude, 5)}`}</Text>
    <Row label="Accuracy" value={`± ${metres(pos.accuracy)}`} />
    <Row label="Altitude" value={pos.altitude === null ? '-' : metres(pos.altitude as number)} />
    <Row label="Speed" value={pos.speed === null ? '-' : `${fixed((pos.speed as number) * 3.6, 1)} km/h`} />
  </View>;
}

let version = 0;
function Home() {
  const [, setVersion] = useState(0);
  useEffect(() => { geo.onChange(() => setVersion(++version)); }, []);
  const pos = geo.position, granted = geo.permission === 'granted';
  return <SafeAreaView style={s.page}><ScrollView style={s.body}>
    <Text style={s.title}>Where am I?</Text>
    <View style={s.card}>
      <Row label="Permission" value={geo.permission} />
      {!granted && <Btn title="Allow location" onPress={() => geo.ask()} primary />}
    </View>
    <View style={s.card}>
      {pos === null ? <Text style={s.muted}>No position yet.</Text> : <Fix pos={pos as Position} />}
      <Btn title="Locate me" onPress={() => geo.locate()} primary={granted && pos === null} />
    </View>
    <View style={s.card}>
      <Row label="Live" value={geo.watching ? `on, ${geo.fixes} fixes` : 'off'} />
      <Row label="Distance travelled" value={metres(geo.walked)} />
      <Btn title={geo.watching ? 'Stop watching' : 'Watch my position'} onPress={() => geo.toggleWatch()} />
    </View>
    {geo.error !== '' && <View style={[s.card, { backgroundColor: WARN_SOFT, borderColor: WARN_SOFT }]}><Text style={[s.value, { color: WARN }]}>{geo.error}</Text></View>}
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 0xFAFAFA },
  body: { padding: 20, gap: 16 },
  title: { fontSize: 32, fontWeight: '800', color: INK, paddingTop: 12 },
  card: { borderWidth: 1, borderColor: LINE, backgroundColor: 0xFFFFFF, borderRadius: 16, padding: 16, gap: 12 },
  stack: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontSize: 15, color: MUTED },
  value: { fontSize: 15, fontWeight: '600', color: INK },
  muted: { fontSize: 15, color: MUTED },
  coords: { fontSize: 24, fontWeight: '700', color: OK },
  primary: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 14, backgroundColor: ACCENT },
  primaryText: { fontSize: 17, fontWeight: '700', color: 0xFFFFFF },
  secondary: { alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: 0xFFFFFF },
  secondaryText: { fontSize: 15, fontWeight: '600', color: INK },
});

if (env('GEO_LOG') === '1') geo.onChange(() => {
  const p = geo.position;
  console.log(`geo: ${geo.permission} ${p === null ? 'none' : `${fixed(p.latitude, 4)},${fixed(p.longitude, 4)}`} watching=${geo.watching} fixes=${geo.fixes} walked=${Math.round(geo.walked)}${geo.error !== '' ? ' error=' + geo.error : ''}`);
});
if (env('GEO_AUTO') === '1') {
  geo.ask();
  geo.locate();
  geo.toggleWatch();
}
render(Home, 0xFAFAFA, null);
