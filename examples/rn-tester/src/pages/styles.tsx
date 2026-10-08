// React Native's object styles: the transform array, shadows and elevation, borderStyle, corner radii, side colours, values chosen at run time.
import { useState } from 'zinc:ui/react';
import { View, Text, Pressable, StyleSheet } from 'zinc:react-native';
import { Page, Card, Caption, usePalette } from '../kit';

export function StylesPage() {
  const c = usePalette();
  const [on, setOn] = useState(false);
  return <Page>
    <Card title="transform">
      <View style={s.row}>
        <View style={[s.tile, { transform: [{ scale: 1.2 }] }]}><Text style={s.tag}>scale</Text></View>
        <View style={[s.tile, { transform: [{ translateY: -10 }, { translateX: 6 }] }]}><Text style={s.tag}>translate</Text></View>
        <View style={[s.tile, { transform: [{ rotate: '12deg' }] }]}><Text style={s.tag}>rotate</Text></View>
      </View>
      <Caption text="rotate and skew hit-test in their shape; they paint once the renderer takes a matrix (ZN-361.01)." />
    </Card>
    <Card title="shadow · elevation">
      <View style={s.row}>
        <View style={[s.lift, { backgroundColor: c.card, shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10 }]}><Text style={[s.small, { color: c.ink }]}>iOS</Text></View>
        <View style={[s.lift, { backgroundColor: c.card, elevation: 4 }]}><Text style={[s.small, { color: c.ink }]}>4</Text></View>
        <View style={[s.lift, { backgroundColor: c.card, elevation: 12 }]}><Text style={[s.small, { color: c.ink }]}>12</Text></View>
      </View>
    </Card>
    <Card title="borders">
      <View style={s.row}>
        <View style={[s.lift, { borderWidth: 2, borderStyle: 'dashed', borderColor: '#007aff' }]} />
        <View style={[s.lift, { borderWidth: 2, borderStyle: 'dotted', borderColor: '#ff9500' }]} />
        <View style={[s.lift, { backgroundColor: '#5856d6', borderTopLeftRadius: 24, borderBottomRightRadius: 24 }]} />
        <View style={[s.lift, { borderWidth: 4, borderColor: '#d1d1d6', borderTopColor: '#ff3b30', borderLeftColor: '#ff3b30' }]} />
      </View>
    </Card>
    <Card title="values chosen at run time">
      <View style={[s.box, { flexDirection: on ? 'row' : 'column', justifyContent: on ? 'space-between' : 'flex-start', backgroundColor: on ? 0x34c759 : c.bg }]}>
        <Text style={{ fontWeight: on ? 'bold' : 'normal', color: c.ink, fontSize: 17 }}>flexDirection</Text>
        <Text style={{ textAlign: on ? 'right' : 'left', color: c.ink, fontSize: 17 }}>{on ? 'row' : 'column'}</Text>
      </View>
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => setOn(!on)}><Text style={s.buttonText}>Toggle</Text></Pressable>
    </Card>
  </Page>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 12 },
  tile: { width: 72, height: 56, borderRadius: 12, backgroundColor: '#007aff', alignItems: 'center', justifyContent: 'center' },
  tag: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  lift: { width: 64, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13 },
  box: { padding: 12, borderRadius: 10, gap: 4 },
  button: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
});
