// A modern app styled the React Native way (ZN-356): StyleSheet.create and style={{...}} objects only (no class strings, no kit), laid out by Yoga
// ("ui": {"layout": "rn"} in zinc.json), with its own visual language in a light and a dark scheme. Four screens and a bottom sheet; switches and the sheet
// ease every frame. SHOWCASE_SCREEN=discover|detail|stats|settings|sheet and SHOWCASE_SCHEME=light|dark open a given state (screenshots and goldens).
//   zinc run examples/rn-showcase
import { createSignal, createNodeRef, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { t, setDark, isDark } from './theme';
import { styles } from './parts';
import { Icon } from 'zinc:icons';
import * as A from 'zinc:ui/animated';
import { Discover, Story, STORIES } from './screens/Discover';
import { Detail } from './screens/Detail';
import { Stats } from './screens/Stats';
import { Settings, Sheet, Toggle } from './screens/Settings';

const tabStyles = StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, bottom: 18, height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 24 },
  tab: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: 76, height: 50, borderRadius: 16 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

const DISCOVER = 0, DETAIL = 1, STATS = 2, SETTINGS = 3;
const [screen, setScreen] = createSignal<i32>(DISCOVER);
const [story, setStory] = createSignal<Story>(STORIES[0]);
const sheetAt = new A.Value(0);   // the sheet: 0 hidden .. 1 open (Animated)
const [textSize, setTextSize] = createSignal<string>('Comfortable');
const toggles: Toggle[] = [new Toggle('Download for offline', true), new Toggle('Daily digest', false), new Toggle('Autoplay audio', true)];
const darkPos = new A.Value(0);
const SPRING: A.SpringConfig = { toValue: 0, bounciness: 6, speed: 16 };
function springTo(v: A.Value, to: number): void { A.spring(v, { toValue: to, bounciness: SPRING.bounciness, speed: SPRING.speed }).start(); }
function openSheet(): void { A.spring(sheetAt, { toValue: 1, bounciness: 4, speed: 14 }).start(); }
function closeSheet(): void { A.timing(sheetAt, { toValue: 0, duration: 220, easing: A.Easing.out(A.Easing.cubic) }).start(); }
const scroller = createNodeRef();

function Tab(p: { label: string; id: i32; icon: string }): i32 {
  const on = (): boolean => screen() === p.id || (p.id === DISCOVER && screen() === DETAIL);
  return <view style={[tabStyles.tab, { backgroundColor: on() ? t().accentSoft : t().surface }]} onClick={() => setScreen(p.id)}>
    <Icon name={p.icon} size={22} color={() => on() ? t().accent : t().muted} strokeWidth={on() ? 2.2 : 1.8} />
    <text style={[styles.tiny, { color: on() ? t().accent : t().muted }, on() && styles.bold]}>{p.label}</text>
  </view>;
}

function App(): i32 {
  return <view style={{ flexDirection: 'column', width: '100%', height: '100%', backgroundColor: t().bg }}>
    <view ref={scroller} style={{ flexDirection: 'column', flex: 1, overflow: 'scroll', paddingBottom: 100 }}>
      <Show when={screen() === DISCOVER}>{Discover((s: Story) => { setStory(s); setScreen(DETAIL); })}</Show>
      <Show when={screen() === DETAIL}>{Detail(story, () => setScreen(DISCOVER))}</Show>
      <Show when={screen() === STATS}>{Stats()}</Show>
      <Show when={screen() === SETTINGS}>{Settings(toggles, (i: i32) => toggles[i].pos.get(), (i: i32) => { toggles[i].on = !toggles[i].on; springTo(toggles[i].pos, toggles[i].on ? 1 : 0); }, openSheet, () => darkPos.get(), () => { setDark(!isDark()); springTo(darkPos, isDark() ? 1 : 0); })}</Show>
    </view>
    <view style={[tabStyles.bar, { backgroundColor: t().surface, borderWidth: 1, borderColor: t().line }]}>
      <Tab label="Discover" id={DISCOVER} icon="compass" />
      <Tab label="Stats" id={STATS} icon="chart-column" />
      <Tab label="Settings" id={SETTINGS} icon="settings" />
    </view>
    <Sheet at={() => sheetAt.get()} close={closeSheet} choose={(s: string) => { setTextSize(s); closeSheet(); }} current={textSize} />
  </view>;
}


// test hooks: start on a given screen and scheme, with the sheet open
const start = env('SHOWCASE_SCREEN'), scheme = env('SHOWCASE_SCHEME'), scrollTo = env('SHOWCASE_SCROLL');
let frames = 0;
if (scheme === 'dark') { setDark(true); darkPos.setValue(1); }
if (start === 'detail') { setStory(STORIES[2]); setScreen(DETAIL); }
if (start === 'stats') setScreen(STATS);
if (start === 'settings' || start === 'sheet') setScreen(SETTINGS);
if (start === 'sheet') sheetAt.setValue(1);

render(App, 0xF6F3EE, (dt: number) => {
  if (++frames === 2 && scrollTo !== '') ui.scrollTo(scroller.node, 0, parseFloat(scrollTo));   // SHOWCASE_SCROLL=400: the content scrolled (screenshots)
});   // switches, the sheet and the scheme move with zinc:ui/animated (springs and timing): nothing to step here
