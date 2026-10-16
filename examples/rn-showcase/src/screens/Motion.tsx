// Motion: Animated springs and timing with easing and colour interpolation, swipe cards (PanResponder, a fling throws the card out), drag to reorder
// (LayoutAnimation settles the list), a Lottie animation (zinc:lottie) and a finger-paint canvas. Each one moves only while it is used: the
// screen at rest draws nothing per frame.
import { useState, useRef } from 'zinc:ui/react';
import { View, Text, Pressable, PanResponder, LayoutAnimation, StyleSheet, Dimensions, useAnimated } from 'zinc:react-native';
import * as ui from 'zinc:ui';
import * as Animated from 'zinc:ui/animated';
import { stroke } from 'zinc:gfx';
import * as lottie from 'zinc:lottie';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CARD } from '../theme';
import { tr } from '../i18n';
import { Screen, Section, ActionButton, Chip, s as k } from '../parts';
import { picture, TITLES } from '../art';
import { onLeave } from '../nav';

// ---------------------------------------------------------------- springs and timing
const ball = new Animated.Value(0);
const tint = ball.interpolate({ inputRange: [0, 1], outputRange: [0xE8492A, 0x2563EB], colors: true });
const EASINGS: string[] = ['spring', 'bounce', 'elastic', 'linear'];
function Springs() {
  const c = theme();
  const x = useAnimated(ball), col = useAnimated(tint);
  const [ease, setEase] = useState(0);
  const run = Math.min(Dimensions.get('window').width, 640) - SP * 16 - 46;   // the track's inner width less the ball
  const go = (): void => {
    const to = ball.get() > 0.5 ? 0 : 1;
    if (ease === 0) Animated.spring(ball, { toValue: to, bounciness: 12, speed: 8 }).start();
    else Animated.timing(ball, { toValue: to, duration: 900, easing: ease === 1 ? Animated.Easing.bounce : ease === 2 ? Animated.Easing.elastic(1.2) : Animated.Easing.linear }).start();
  };
  return <Section title="Springs">
    <View style={k.pad}>
      <View style={[st.track, { backgroundColor: c.raised }]}><View style={[st.ball, { backgroundColor: col, transform: [{ translateX: x * run }] }]} /></View>
      <View style={k.wrap}>{EASINGS.map((e: string, i: number) => <Chip title={e} on={ease === i} onPress={() => setEase(i)} />)}</View>
      <ActionButton title="Animate" icon="zap" onPress={go} />
    </View>
  </Section>;
}

// ---------------------------------------------------------------- swipe cards
const card = new Animated.ValueXY();
function SwipeCards() {
  const c = theme();
  const [top, setTop] = useState(0);
  const [likes, setLikes] = useState(0);
  const dx = useAnimated(card.x), dy = useAnimated(card.y);
  const state = useRef<number>(0);
  state.current = top;
  const pan = useRef<ui.PanResponderInstance | null>(null);
  if (pan.current === null) pan.current = PanResponder.create({
    onStartShouldSetPanResponder: (e: ui.ResponderEvent, g: ui.GestureState): boolean => true,
    onPanResponderGrant: (e: ui.ResponderEvent, g: ui.GestureState): void => card.stopAnimation(),
    onPanResponderMove: Animated.event([null, { dx: card.x, dy: card.y }]),
    onPanResponderRelease: (e: ui.ResponderEvent, g: ui.GestureState): void => {
      if (Math.abs(g.dx) > 110 || Math.abs(g.vx) > 0.8) {
        const right = g.dx > 0;
        Animated.timing(card.x, { toValue: right ? 480 : -480, duration: 220 }).start((done: boolean): void => {
          card.x.setValue(0); card.y.setValue(0);
          if (right) setLikes(likes + 1);
          setTop(state.current + 1);
        });
      } else { Animated.spring(card.x, { toValue: 0, bounciness: 10 }).start(); Animated.spring(card.y, { toValue: 0, bounciness: 10 }).start(); }
    },
  });
  const cards: number[] = [top + 2, top + 1, top];   // the next two wait under the top one
  return <Section title="Swipe cards" note={`Swipe right to keep, left to pass · kept ${likes}`}>
    <View style={st.deck}>
      {cards.map((n: number, i: number) => {
        if (i === 2) return <View {...(pan.current as ui.PanResponderInstance).panHandlers} aria-label={TITLES[n % TITLES.length]}
          style={[st.swipe, { backgroundColor: c.surface, borderColor: c.line, transform: [{ translateX: dx }, { translateY: dy * 0.3 }] }]}><SwipeFace n={n} like={dx} /></View>;
        return <View style={[st.swipe, { backgroundColor: c.surface, borderColor: c.line, transform: [{ translateY: (2 - i) * 10 }, { scale: 1 - (2 - i) * 0.04 }] }]}><SwipeFace n={n} like={0} /></View>;
      })}
    </View>
  </Section>;
}
function SwipeFace(p: { n: number; like: number }) {
  const c = theme();
  return <View style={{ flex: 1 }}>
    <Canvas style={{ flex: 1, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => picture(x, y, w, h, p.n, 0)} />
    <View style={[k.rowFlat, { padding: SP * 3, justifyContent: 'space-between' }]}>
      <Text style={[k.heading, { color: c.ink }]}>{`${TITLES[p.n % TITLES.length]} #${p.n + 1}`}</Text>
      <Icon name={p.like > 40 ? 'heart' : p.like < -40 ? 'x' : 'hand'} size={22} color={() => p.like > 40 ? theme().danger : theme().muted} />
    </View>
  </View>;
}

// ---------------------------------------------------------------- drag to reorder
const ROW = 52;
const dragY = new Animated.Value(0);
function Reorder() {
  const c = theme();
  const [items, setItems] = useState<string[]>(['Wake up', 'Coffee', 'Write the plan', 'Ship it', 'Celebrate']);
  const [held, setHeld] = useState(-1);
  const y = useAnimated(dragY);
  const list = useRef<string[]>(items);
  list.current = items;
  const pans = useRef<ui.PanResponderInstance[]>([]);
  for (let i = pans.current.length; i < 5; i++) {
    const at = i;
    pans.current.push(PanResponder.create({
      onStartShouldSetPanResponder: (e: ui.ResponderEvent, g: ui.GestureState): boolean => true,
      onPanResponderGrant: (e: ui.ResponderEvent, g: ui.GestureState): void => { dragY.setValue(0); setHeld(at); },
      onPanResponderMove: (e: ui.ResponderEvent, g: ui.GestureState): void => dragY.setValue(g.dy),
      onPanResponderRelease: (e: ui.ResponderEvent, g: ui.GestureState): void => {
        const to = Math.max(0, Math.min(4, at + Math.round(g.dy / ROW)));
        const rest = list.current.filter((s: string, j: number) => j !== at);
        const next = rest.slice(0, to).concat([list.current[at]]).concat(rest.slice(to));
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        dragY.setValue(0); setHeld(-1); setItems(next);
      },
    }));
  }
  return <Section title="Drag to reorder" note="Drag a row by its handle">
    {items.map((t: string, i: number) => <View style={[st.row, { backgroundColor: held === i ? c.accentSoft : c.surface, borderColor: c.line },
      held === i ? { transform: [{ translateY: y }], shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } : {}]}>
      <Text style={[k.small, { color: c.muted, width: 22 }]}>{`${i + 1}`}</Text>
      <Text style={[k.body, { color: c.ink, flex: 1 }]}>{t}</Text>
      <View {...pans.current[i].panHandlers} style={st.handle} aria-label={`move ${t}`}><Icon name="grip-vertical" size={20} color={() => theme().faint} /></View>
    </View>)}
  </Section>;
}

// ---------------------------------------------------------------- Lottie
let orbit = -2;
function LottieCard() {
  const c = theme();
  if (orbit === -2) orbit = lottie.load('orbit.json');
  const [playing, setPlaying] = useState(false);
  const started = useRef<number>(0);
  const play = (): void => {
    started.current = ui.now(); setPlaying(true);
    const t = setTimeout((): void => setPlaying(false), 4000);   // two loops, then the canvas rests
    onLeave((): void => clearTimeout(t));
  };
  return <Section title="Lottie">
    <View style={[k.rowFlat, { padding: SP * 4, gap: SP * 4 }]}>
      <Canvas style={{ width: 120, height: 120, lazy: playing ? 0 : 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
        if (orbit < 0) return;
        const f = playing ? ((ui.now() - started.current) / 1000 * lottie.fps(orbit)) % lottie.frames(orbit) : 0;
        lottie.draw(orbit, f, x, y, w, h);
      }} />
      <View style={{ flex: 1, gap: SP * 2 }}>
        <Text style={[k.small, { color: c.muted }]}>{orbit >= 0 ? 'orbit.json, drawn by zinc:lottie on the app\'s canvas' : tr('Unavailable here')}</Text>
        <ActionButton title={tr('Play')} kind="secondary" icon="play" disabled={playing || orbit < 0} onPress={play} />
      </View>
    </View>
  </Section>;
}

// ---------------------------------------------------------------- finger paint
class Ink { pts: number[] = []; ends: number[] = []; down: boolean = false; }   // flat x, y pairs; where each stroke ends
const ink = new Ink();
const seg: number[] = [0, 0, 0, 0];
function Paint() {
  const c = theme();
  const [n, setN] = useState(0);
  const add = (e: ui.PointerEvent): void => { ink.pts.push(e.x); ink.pts.push(e.y); ui.repaint(); };
  return <Section title="Canvas" note={`Draw with a finger or the mouse · ${n} strokes`}>
    <Canvas style={{ height: 200, lazy: 1 }}
      onPointerDown={(e: ui.PointerEvent) => { ink.down = true; if (ink.pts.length > 0) ink.ends.push(ink.pts.length); add(e); }}
      onPointerMove={(e: ui.PointerEvent) => { if (ink.down) add(e); }}
      onPointerUp={(e: ui.PointerEvent) => { ink.down = false; setN(n + 1); }}
      onDraw={(x: i32, y: i32, w: i32, h: i32) => {
        let from = 0;
        const col = theme().accent;
        for (let s = 0; s <= ink.ends.length; s++) {
          const to = s < ink.ends.length ? ink.ends[s] : ink.pts.length;
          for (let i = from; i + 3 < to; i += 2) { seg[0] = ink.pts[i]; seg[1] = ink.pts[i + 1]; seg[2] = ink.pts[i + 2]; seg[3] = ink.pts[i + 3]; stroke(seg, 4, col as u32, 255, false); }
          from = to;
        }
      }} />
    <View style={k.pad}><ActionButton title="Clear" kind="secondary" icon="rotate-ccw" onPress={() => { ink.pts.length = 0; ink.ends.length = 0; ui.repaint(); setN(0); }} /></View>
  </Section>;
}

export function MotionScreen() {
  return <Screen><Springs /><SwipeCards /><Reorder /><LottieCard /><Paint /></Screen>;
}

const st = StyleSheet.create({
  track: { height: 44, borderRadius: 22, padding: 4 },
  ball: { width: 36, height: 36, borderRadius: 18 },
  deck: { height: 300, margin: SP * 4 },
  swipe: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: R_CARD, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SP * 3, height: ROW, paddingLeft: SP * 4, borderBottomWidth: 1 },
  handle: { width: 52, height: ROW, alignItems: 'center', justifyContent: 'center' },
});
