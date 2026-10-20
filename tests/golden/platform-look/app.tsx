// The platform look forced by one switch (tests/t1/platform_look.sh): a switch, a button, a segmented control and a slider of zinc:ui/kit, a Nuxt UI
// switch and React Native's Switch, Button and ActivityIndicator, all on, in one React screen. It prints the look and the width of each switch, then a
// tap flips the kit switch (iOS: a light haptic) and a long press opens the kit's context menu on a touch screen (with its haptic, ZINC_DEVICE_LOG).
import { render, useRef, MutableRef } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { Switch as KitSwitch, Button as KitButton, Tabs, Slider, ContextMenu } from 'zinc:ui/kit';
import { Switch as NuxtSwitch } from 'zinc:ui/nuxt';
import { Switch as RNSwitch, Button as RNButton, ActivityIndicator } from 'zinc:react-native';
import { lookName } from 'zinc:ui/platform';

let on = true, frames = 0;
let refs: MutableRef<i32>[] = [];
function App(): i32 {
  const k1 = useRef<i32>(-1), k2 = useRef<i32>(-1), k3 = useRef<i32>(-1);
  refs = [k1, k2, k3];
  return <View className="flex-col items-start gap-3 p-4 bg-white h-full">
    <View className="h-10"><ContextMenu items={[{ id: 'copy', label: 'Copy' }]} onSelect={(id: string) => console.log(`menu ${id}`)}>
      <View className="w-40 h-10 bg-zinc-100"><Text className="text-black">Hold me</Text></View>
    </ContextMenu></View>
    <View ref={k1}><KitSwitch checked={() => on} onChange={(v: boolean) => { on = v; console.log(`kit switch ${v}`); }} label="Kit" /></View>
    <View ref={k2}><NuxtSwitch modelValue={() => true} label="Nuxt" /></View>
    <View ref={k3}><RNSwitch value={true} /></View>
    <KitButton label="Save" />
    <RNButton title="Send" />
    <Tabs items={['Day', 'Week']} selected={() => 0} onSelect={(i: i32) => {}} />
    <View className="w-60"><Slider value={() => 40} onChange={(v: number) => {}} /></View>
    <ActivityIndicator animating={false} hidesWhenStopped={false} />
  </View>;
}
/** The width of the first descendant of `h` shaped like a switch's track: one child (the thumb), wider than high, under 40 px high. */
function trackWidth(h: i32): number {
  const n = ui.inspectNode(h);
  if (n === null) return 0;
  for (const c of n.children) { const w = trackWidth(c); if (w > 0) return w; }
  return n.lh > 0 && n.lh < 40 && n.lw > n.lh && n.lw < 2.2 * n.lh && n.children.length === 1 ? n.lw : 0;
}
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames !== 3) return;
  console.log(`look ${lookName()} kit ${trackWidth(refs[0].current)} nuxt ${trackWidth(refs[1].current)} rn ${trackWidth(refs[2].current)}`);
});
