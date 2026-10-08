// Platform, Dimensions / useWindowDimensions, PixelRatio, Appearance / useColorScheme (the whole tester follows the scheme), StatusBar.
import { View, Text, Switch, StatusBar, Platform, Dimensions, PixelRatio, Appearance, useWindowDimensions, useColorScheme, StyleSheet } from 'zinc:react-native';
import { Page, Card, usePalette } from '../kit';

function Line(p: { k: string; v: string }) {
  const c = usePalette();
  return <View style={s.line}><Text style={[s.key, { color: c.muted }]}>{p.k}</Text><Text style={[s.value, { color: c.ink }]}>{p.v}</Text></View>;
}
export function PlatformPage() {
  const c = usePalette();
  const win = useWindowDimensions();
  const scheme = useColorScheme();
  return <Page>
    <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
    <Card title="Platform">
      <Line k="Platform.OS" v={Platform.OS} />
      <Line k="Platform.select" v={Platform.select({ macos: 'desktop (macos)', web: 'web', native: 'native', default: 'other' }, '-')} />
    </Card>
    <Card title="Dimensions · PixelRatio">
      <Line k="useWindowDimensions" v={`${win.width} x ${win.height}`} />
      <Line k="Dimensions.get('screen')" v={`${Dimensions.get('screen').width} x ${Dimensions.get('screen').height}`} />
      <Line k="PixelRatio.get()" v={`${PixelRatio.get()}`} />
      <Line k="roundToNearestPixel(10.3)" v={`${PixelRatio.roundToNearestPixel(10.3)}`} />
    </Card>
    <Card title="Appearance">
      <View style={s.line}><Text style={[s.key, { color: c.ink }]}>Dark scheme</Text><Switch value={scheme === 'dark'} onValueChange={(v: boolean) => Appearance.setColorScheme(v ? 'dark' : 'light')} /></View>
      <Line k="useColorScheme()" v={scheme} />
    </Card>
  </Page>;
}
const s = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  key: { fontSize: 15 },
  value: { fontSize: 15, fontWeight: '600' },
});
