// Animated (timing, spring, interpolation of numbers and colours, loop), PanResponder with Animated.event and a spring back, Animated.event on a scroll,
// LayoutAnimation on a list. Animated values drive React renders through useAnimated.
import { useState, useRef } from 'zinc:ui/react';
import { View, Text, Pressable, ScrollView, PanResponder, LayoutAnimation, StyleSheet, useAnimated } from 'zinc:react-native';
import * as ui from 'zinc:ui';
import * as Animated from 'zinc:ui/animated';
import { Page, Card, Caption, usePalette } from '../kit';

const fade = new Animated.Value(1);
const slide = new Animated.Value(0);
const tint = slide.interpolate({ inputRange: [0, 1], outputRange: [0x007aff, 0xff2d55], colors: true });
const pop = new Animated.Value(1);
const pulse = new Animated.Value(0);
let pulsing = false;

export function AnimatedPage() {
  const c = usePalette();
  if (!pulsing) { pulsing = true; Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 600 }), Animated.timing(pulse, { toValue: 0, duration: 600 })])).start(); }
  const o = useAnimated(fade), x = useAnimated(slide), col = useAnimated(tint), k = useAnimated(pop), p = useAnimated(pulse);
  return <Page>
    <Card title="Animated.timing">
      <View style={[s.box, { opacity: o, backgroundColor: c.accent }]} />
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => Animated.timing(fade, { toValue: o > 0.5 ? 0.15 : 1, duration: 400 }).start()}>
        <Text style={s.buttonText}>Fade</Text>
      </Pressable>
    </Card>
    <Card title="interpolate · colours">
      <View style={[s.chip, { transform: [{ translateX: x * 220 }], backgroundColor: col }]} />
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => Animated.timing(slide, { toValue: x > 0.5 ? 0 : 1, duration: 700, easing: Animated.Easing.inOut(Animated.Easing.cubic) }).start()}>
        <Text style={s.buttonText}>Slide</Text>
      </Pressable>
    </Card>
    <Card title="Animated.spring · loop">
      <View style={s.row}>
        <View style={[s.chip, { transform: [{ scale: k }], backgroundColor: 0x34c759 }]} />
        <View style={[s.dot, { opacity: 0.3 + p * 0.7, transform: [{ scale: 0.8 + p * 0.4 }] }]} />
      </View>
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => { pop.setValue(0.6); Animated.spring(pop, { toValue: 1, bounciness: 14, speed: 10 }).start(); }}>
        <Text style={s.buttonText}>Spring</Text>
      </Pressable>
    </Card>
  </Page>;
}

const pan = new Animated.ValueXY();
const scrollY = new Animated.Value(0);
const headerOpacity = scrollY.interpolate({ inputRange: [0, 120], outputRange: [1, 0], extrapolate: 'clamp' });
const dragger = PanResponder.create({
  onStartShouldSetPanResponder: (e: ui.ResponderEvent, g: ui.GestureState): boolean => true,
  onPanResponderGrant: (e: ui.ResponderEvent, g: ui.GestureState): void => { pan.stopAnimation(); pan.extractOffset(); },
  onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }]),
  onPanResponderRelease: (e: ui.ResponderEvent, g: ui.GestureState): void => {
    pan.flattenOffset();
    Animated.spring(pan.x, { toValue: 0, bounciness: 8 }).start();
    Animated.spring(pan.y, { toValue: 0, bounciness: 8 }).start();
  },
});
export function GesturesPage() {
  const c = usePalette();
  const dx = useAnimated(pan.x), dy = useAnimated(pan.y), h = useAnimated(headerOpacity);
  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <View style={[s.stage, { backgroundColor: c.card }]}>
      <Caption text="PanResponder + Animated.event: drag the card, it springs back" />
      <View {...dragger.panHandlers} style={[s.card, { transform: [{ translateX: dx }, { translateY: dy }] }]}><Text style={s.buttonText}>Drag me</Text></View>
    </View>
    <View style={[s.fadeHeader, { opacity: h, backgroundColor: c.accent }]}><Text style={s.buttonText}>Animated.event on onScroll</Text></View>
    <ScrollView style={{ flex: 1 }} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}>
      {LINES.map((t: string) => <Text style={[s.line, { color: c.ink, borderColor: c.line }]}>{t}</Text>)}
    </ScrollView>
  </View>;
}
const LINES: string[] = [];
for (let i = 1; i <= 30; i++) LINES.push(`Scroll me: the header fades over 120 px (line ${i})`);

export function LayoutAnimationPage() {
  const c = usePalette();
  const [items, setItems] = useState<number[]>([1, 2, 3]);
  const next = useRef<number>(4);
  return <Page>
    <Card title="LayoutAnimation">
      <View style={s.row}>
        <Pressable style={[s.small, { backgroundColor: c.accent }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setItems([next.current].concat(items)); next.current = next.current + 1; }}><Text style={s.buttonText}>Add</Text></Pressable>
        <Pressable style={[s.small, { backgroundColor: 0xff3b30 }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.spring); setItems(items.slice(1)); }}><Text style={s.buttonText}>Remove</Text></Pressable>
      </View>
      {items.map((n: number) => <View style={[s.item, { backgroundColor: c.bg }]}><Text style={{ color: c.ink, fontSize: 17 }}>{`Item ${n}`}</Text></View>)}
    </Card>
  </Page>;
}

const s = StyleSheet.create({
  box: { height: 80, borderRadius: 12 },
  chip: { width: 64, height: 40, borderRadius: 10 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ff9500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  button: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  small: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  stage: { height: 220, margin: 16, borderRadius: 12, padding: 16, alignItems: 'center', gap: 24 },
  card: { width: 140, height: 90, borderRadius: 16, backgroundColor: '#5856d6', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  fadeHeader: { marginHorizontal: 16, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  line: { fontSize: 15, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  item: { height: 44, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 12 },
});
