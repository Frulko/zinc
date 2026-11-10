import { createSignal, render } from 'zinc:ui/solid';
import { Tabs, NavigationTabs, useQuietTheme } from 'zinc:ui/kit';
import { drive } from '../kit-tabs-reveal/drive';
useQuietTheme();
const labels = ['Profile', 'Notifications', 'Appearance', 'Account'];
const items = labels.map((label: string, i: i32) => ({ id: String(i), label, disabled: i === 1 }));
const [value, select] = createSignal<i32>(0), [rich, selectRich] = createSignal('0'), [visible, show] = createSignal(true);
function App(): i32 {
  return <View className="w-full h-full p-4"><ScrollView aria-label="Outer" className="w-full h-[180px]"><View className="gap-3"><View className="h-[80px]" /><Show when={visible()}><Tabs label="Basic" items={labels} selected={value} onSelect={select} disabled={[1]} className="w-full" /><NavigationTabs label="Rich" items={items} selected={rich} onSelect={selectRich} className="w-full" /></Show><View className="h-[300px]" /></View></ScrollView></View>;
}
let frame = 0;
render(App, 0xf2f2f2, (dt: number) => { frame++; drive(frame, value, rich, select, selectRich, show); });
