import { render, createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Tabs, NavigationTabs, useQuietTheme } from 'zinc:ui/kit';
import { drive, painted } from '../kit-tabs-idle/drive';
useQuietTheme();
const [visible, show] = createSignal(false), [mounted, mount] = createSignal(true), [selected, select] = createSignal<i32>(0);
const labels = ['Profile', 'Notifications', 'Appearance', 'Account'];
const items = labels.map((label: string, i: i32) => ({ id: String(i), label }));
function App(): i32 {
  return <View className="w-full h-full p-4"><View hidden={visible() ? 0 : 1}><Show when={mounted()}><Tabs label="Basic" items={labels} selected={selected} onSelect={select} className="w-full" /><NavigationTabs label="Rich" items={items} selected={() => String(selected())} onSelect={(id: string) => select(parseInt(id) as i32)} className="w-full" /></Show></View></View>;
}
ui.setAfterPaint(painted);
render(App, 0xffffff, null);
function watch(): void { drive(show, mount, select); }
ui.addWatcher(watch);
