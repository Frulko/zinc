import { render, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { Tabs, NavigationTabs, useQuietTheme } from 'zinc:ui/kit';
import { drive, painted } from '../kit-tabs-idle/drive';
useQuietTheme();
let show = (on: boolean): void => {}, mount = (on: boolean): void => {}, select = (n: i32): void => {};
const labels = ['Profile', 'Notifications', 'Appearance', 'Account'];
const items = labels.map((label: string, i: i32) => ({ id: String(i), label }));
function App(): i32 {
  const [visible, setVisible] = useState(false), [mounted, setMounted] = useState(true), [selected, setSelected] = useState<i32>(0);
  show = setVisible; mount = setMounted; select = setSelected;
  return <View className="w-full h-full p-4"><View hidden={visible ? 0 : 1}>{mounted ? <View><Tabs label="Basic" items={labels} selected={() => selected} onSelect={select} className="w-full" /><NavigationTabs label="Rich" items={items} selected={() => String(selected)} onSelect={(id: string) => select(parseInt(id) as i32)} className="w-full" /></View> : <View />}</View></View>;
}
ui.setAfterPaint(painted);
render(App, 0xffffff, null);
function watch(): void { drive(show, mount, select); }
ui.addWatcher(watch);
