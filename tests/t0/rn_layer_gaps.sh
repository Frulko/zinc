#!/bin/sh
# React Native layer gaps found by rn-showcase (ZN-812): a file's own `function Button` shadows the host <Button>; `<ActivityIndicator />`
# with no props; a run-time angle `rotate: \`${deg}deg\``; View's pointerEvents ('none', a conditional, 'box-none': only its children,
# 'box-only': not its children), accessibilityLabel and TextInput's placeholderTextColor; an onScroll attribute set again by each render
# keeps one watcher (it fired once per render before).
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/p"
echo '{ "name": "gaps", "entry": "main.tsx" }' > "$tmp/p/zinc.json"
cat > "$tmp/p/main.tsx" <<'P'
import * as ui from 'zinc:ui';
import { render, useRef, useState, MutableRef } from 'zinc:ui/react';
import { View, Text, ActivityIndicator, TextInput, ScrollView } from 'zinc:react-native';

function Button(p: { label: string }): i32 {
  return <View style={{ padding: 4 }}><Text>{p.label}</Text></View>;
}
let deg = 30, presses = '', frame = 0, scrolled = 0;
let rot: MutableRef<i32> | null = null, sv: MutableRef<i32> | null = null, bump: (n: number) => void = (n: number): void => {};
function App(): i32 {
  const [n, setN] = useState<number>(0);
  bump = setN;
  const angle = `${deg}deg`, r = useRef<i32>(-1), s = useRef<i32>(-1), off = deg > 10;
  rot = r; sv = s;
  return <View style={{ flex: 1 }}>
    <Button label="local" />
    <ActivityIndicator />
    <View ref={r} style={{ width: 20, height: 20, transform: [{ rotate: angle }] }} />
    <View pointerEvents="box-none" onPress={(): void => { presses += 'outer '; }} style={{ height: 60, flexDirection: 'row' }}>
      <View onPress={(): void => { presses += 'child '; }} style={{ width: 40, height: 40 }} />
      <View pointerEvents={off ? 'none' : 'auto'} onPress={(): void => { presses += 'none '; }} style={{ width: 40, height: 40 }} />
      <View pointerEvents="box-only" onPress={(): void => { presses += 'only '; }} style={{ width: 40, height: 40 }}>
        <View onPress={(): void => { presses += 'inner '; }} style={{ width: 20, height: 20 }} />
      </View>
    </View>
    <View accessibilityLabel="box" style={{ width: 20, height: 20 }} />
    <TextInput placeholder="type" placeholderTextColor="#94a3b8" />
    <ScrollView ref={s} style={{ height: 40 }} onScroll={(e: ui.ResponderEvent, g: ui.GestureState): void => { scrolled++; }}>
      <View style={{ height: 400 }}><Text>{`${n}`}</Text></View>
    </ScrollView>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
ui.addWatcher((): void => {
  frame++;
  if (frame < 10) bump(frame);
  const R = rot, S = sv;
  if (frame === 3 && R !== null) {
    const root = ui.inspectNode(ui.rootNode());
    const b = root !== null ? ui.inspectNode(root.children[0]) : null;
    console.log(`log local ${b !== null && b.tag !== ui.BUTTON} rotate ${ui.getNumber(R.current, 'rotate')}`);
  }
  if (frame === 24 && S !== null) ui.scrollTo(S.current, 0, 50);
  if (frame === 29) console.log(`log presses ${presses}scrolled ${scrolled}`);
});
P
# the row of pointerEvents views is at y 70 to 130: the child (x 0-40), the 'none' one (40-80), the 'box-only' one (80-120) and its inner
# view (80-100, 70-90), then the 'box-none' row alone (200)
printf '5 move 20 90\n6 down\n7 up\n10 move 60 90\n11 down\n12 up\n15 move 90 80\n16 down\n17 up\n20 move 200 90\n21 down\n22 up\n' > "$tmp/p/press.input"
out=$(cd "$tmp/p" && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x320 ZINC_FRAMES=30 ZINC_INPUT=press.input "$ZINC" run . 2>&1)
got=$(echo "$out" | grep '^log')
want='log local true rotate 30
log presses child only scrolled 1'
[ "$got" = "$want" ] && { echo "rn_layer_gaps: ok"; exit 0; }
echo "rn_layer_gaps: want '$want', got '$got'"; echo "$out" | grep -E 'error|panic' | head -5; exit 1
