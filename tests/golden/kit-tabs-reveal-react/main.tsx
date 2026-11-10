import { useState, render } from 'zinc:ui/react';
import { Tabs, NavigationTabs, useQuietTheme } from 'zinc:ui/kit';
import { drive } from '../kit-tabs-reveal/drive';
useQuietTheme();
const labels = ['Profile', 'Notifications', 'Appearance', 'Account'];
const items = labels.map((label: string, i: i32) => ({ id: String(i), label, disabled: i === 1 }));
let value: () => i32 = () => 0, rich: () => string = () => '0';
let select: (i: i32) => void = (i: i32) => {}, selectRich: (id: string) => void = (id: string) => {}, show: (visible: boolean) => void = (visible: boolean) => {};
function App(): i32 {
  const [v, setV] = useState<i32>(0), [r, setR] = useState('0'), [shown, setShown] = useState(true);
  value = () => v; rich = () => r; select = setV; selectRich = setR; show = setShown;
  return <View className="w-full h-full p-4"><ScrollView aria-label="Outer" className="w-full h-[180px]"><View className="gap-3"><View className="h-[80px]" />{shown ? <View className="gap-3"><Tabs label="Basic" items={labels} selected={value} onSelect={select} disabled={[1]} className="w-full" /><NavigationTabs label="Rich" items={items} selected={rich} onSelect={selectRich} className="w-full" /></View> : <View />}<View className="h-[300px]" /></View></ScrollView></View>;
}
let frame = 0;
render(App, 0xf2f2f2, (dt: number) => { frame++; drive(frame, value, rich, select, selectRich, show); });
