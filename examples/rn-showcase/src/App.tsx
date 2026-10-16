// The shell: a header (title, back button), the current screen, a bottom tab bar and the toast host. Only the top of the stack is mounted: a screen
// starts fresh when it is opened again, and its timers and sockets stop when it is left (nav.ts onLeave).
import { useState } from 'zinc:ui/react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { theme, SP, T_HEADING, T_TINY } from './theme';
import { tr, language } from './i18n';
import { nav, TABS, TAB_ICONS, TAB_TITLES, SCREENS, SCREEN_TITLES, leaveScreen } from './nav';
import { ToastHost } from './parts';
import { HomeScreen } from './screens/Home';
import { ComponentsScreen } from './screens/Components';
import { FormsScreen } from './screens/Forms';
import { NetworkScreen, PostScreen } from './screens/Network';
import { MoreScreen } from './screens/More';
import { MediaScreen } from './screens/Media';
import { CameraScreen } from './screens/Camera';
import { MotionScreen } from './screens/Motion';
import { DataScreen } from './screens/Data';
import { PlatformScreen } from './screens/Platform';
import { AboutScreen } from './screens/About';

function renderScreen(id: string): i32 {
  if (id === 'components') return <ComponentsScreen />;
  if (id === 'forms') return <FormsScreen />;
  if (id === 'network') return <NetworkScreen />;
  if (id === 'more') return <MoreScreen />;
  if (id === 'media') return <MediaScreen />;
  if (id === 'camera') return <CameraScreen />;
  if (id === 'motion') return <MotionScreen />;
  if (id === 'data') return <DataScreen />;
  if (id === 'platform') return <PlatformScreen />;
  if (id === 'about') return <AboutScreen />;
  if (id === 'post') return <PostScreen />;
  return <HomeScreen />;
}

function Tab(p: { id: string; index: number; on: boolean; press: (id: string) => void }) {
  const c = theme();
  const col = p.on ? c.accent : c.muted;
  return <Pressable style={s.tab} onPress={() => p.press(p.id)} accessibilityLabel={tr(TAB_TITLES[p.index])}>
    <View style={[s.tabIcon, { backgroundColor: p.on ? c.accentSoft : c.surface }]}><Icon name={TAB_ICONS[p.index]} size={20} color={() => col} strokeWidth={p.on ? 2.3 : 1.8} /></View>
    <Text style={[s.tabText, { color: col, fontWeight: p.on ? '700' : '400' }]}>{tr(TAB_TITLES[p.index])}</Text>
  </Pressable>;
}

export function startRoute(tab: string, stack: string[]): void { startTab = tab; startStack = stack; }
let startTab = 'home', startStack: string[] = [];

export default function App() {
  useColorScheme();   // the whole tree renders again when the scheme changes: screens read theme()
  const c = theme();
  const [tab, setTab] = useState(startTab);
  const [stack, setStack] = useState<string[]>(startStack);
  const [, setLang] = useState(language());
  nav.goTab = (t: string): void => { leaveScreen(); setStack([]); setTab(t); };
  nav.push = (sc: string): void => { leaveScreen(); setStack(stack.concat([sc])); };
  nav.pop = (): void => { leaveScreen(); setStack(stack.slice(0, stack.length - 1)); };
  nav.relabel = (): void => setLang(language());
  const top = stack.length > 0 ? stack[stack.length - 1] : tab;
  const si = SCREENS.indexOf(top);
  const title = si >= 0 ? SCREEN_TITLES[si] : TAB_TITLES[TABS.indexOf(top)];
  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <View style={[s.header, { borderColor: c.line, backgroundColor: c.bg }]}>
      {stack.length > 0 && <Pressable style={s.back} onPress={() => nav.pop()} accessibilityLabel={tr('Back')}>
        <Icon name="chevron-left" size={22} color={() => theme().accent} /><Text style={{ color: c.accent, fontSize: 16 }}>{tr('Back')}</Text>
      </Pressable>}
      <Text style={[s.title, { color: c.ink }]}>{tr(title)}</Text>
    </View>
    <View style={{ flex: 1 }}>{renderScreen(top)}</View>
    <View style={[s.bar, { backgroundColor: c.surface, borderColor: c.line }]} role="tablist">
      {TABS.map((id: string, i: number) => <Tab id={id} index={i} on={tab === id} press={(t: string) => nav.goTab(t)} />)}
    </View>
    <ToastHost />
  </View>;
}

const s = StyleSheet.create({
  header: { height: 52, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1 },
  back: { position: 'absolute', left: SP * 2, top: 10, height: 32, flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: T_HEADING, fontWeight: '700' },
  bar: { flexDirection: 'row', height: 68, borderTopWidth: 1, paddingHorizontal: SP * 2, alignItems: 'center', justifyContent: 'space-around' },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: T_TINY },
});
