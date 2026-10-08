// A modern app styled the React Native way (ZN-356): StyleSheet.create and style={{...}} objects only (no class strings, no kit), laid out by Yoga
// ("ui": {"layout": "rn"} in zinc.json), with its own visual language in a light and a dark scheme. Four screens and a bottom sheet; switches and the sheet
// ease every frame. SHOWCASE_SCREEN=discover|detail|stats|settings|sheet and SHOWCASE_SCHEME=light|dark open a given state (screenshots and goldens).
//   zinc run examples/rn-showcase
import { createSignal, Show } from 'zinc:ui/solid';
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { t, setDark, isDark } from './theme';
import { styles } from './parts';
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
const [sheetTarget, setSheetTarget] = createSignal<number>(0);
const [sheetAt, setSheetAt] = createSignal<number>(0);
const [textSize, setTextSize] = createSignal<string>('Comfortable');
const toggles: Toggle[] = [new Toggle('Download for offline', true), new Toggle('Daily digest', false), new Toggle('Autoplay audio', true)];
const [tick, setTick] = createSignal<i32>(0);   // bumped when a knob moved: the switches read their positions through it
const [darkPos, setDarkPos] = createSignal<number>(0);

function Tab(p: { label: string; id: i32 }): i32 {
  const on = (): boolean => screen() === p.id || (p.id === DISCOVER && screen() === DETAIL);
  return <view style={[tabStyles.tab, { backgroundColor: on() ? t().accentSoft : t().surface }]} onClick={() => setScreen(p.id)}>
    <view style={[tabStyles.dot, { backgroundColor: on() ? t().accent : t().faint }]} />
    <text style={[styles.tiny, { color: on() ? t().accent : t().muted }, on() && styles.bold]}>{p.label}</text>
  </view>;
}

function App(): i32 {
  return <view style={{ flexDirection: 'column', width: '100%', height: '100%', backgroundColor: t().bg }}>
    <view style={{ flexDirection: 'column', flexGrow: 1, overflow: 'scroll', paddingBottom: 100 }}>
      <Show when={screen() === DISCOVER}>{Discover((s: Story) => { setStory(s); setScreen(DETAIL); })}</Show>
      <Show when={screen() === DETAIL}>{Detail(story, () => setScreen(DISCOVER))}</Show>
      <Show when={screen() === STATS}>{Stats()}</Show>
      <Show when={screen() === SETTINGS}>{Settings(toggles, (i: i32) => { tick(); return toggles[i].pos; }, (i: i32) => { toggles[i].on = !toggles[i].on; }, () => setSheetTarget(1), darkPos, () => setDark(!isDark()))}</Show>
    </view>
    <view style={[tabStyles.bar, { backgroundColor: t().surface, borderWidth: 1, borderColor: t().line }]}>
      <Tab label="Discover" id={DISCOVER} />
      <Tab label="Stats" id={STATS} />
      <Tab label="Settings" id={SETTINGS} />
    </view>
    <Sheet at={sheetAt} close={() => setSheetTarget(0)} choose={(s: string) => { setTextSize(s); setSheetTarget(0); }} current={textSize} />
  </view>;
}

/** Eases `v` towards `to` (critically damped feel at 60 fps). */
function ease(v: number, to: number, dt: number): number { const k = Math.min(1, dt * 14); const n = v + (to - v) * k; return Math.abs(to - n) < 0.002 ? to : n; }

// test hooks: start on a given screen and scheme, with the sheet open
const start = env('SHOWCASE_SCREEN'), scheme = env('SHOWCASE_SCHEME');
if (scheme === 'dark') { setDark(true); setDarkPos(1); }
if (start === 'detail') { setStory(STORIES[2]); setScreen(DETAIL); }
if (start === 'stats') setScreen(STATS);
if (start === 'settings' || start === 'sheet') setScreen(SETTINGS);
if (start === 'sheet') { setSheetTarget(1); setSheetAt(1); }

render(App, 0xF6F3EE, (dt: number) => {
  let moved = false;
  for (const g of toggles) { const p = ease(g.pos, g.on ? 1 : 0, dt); if (p !== g.pos) { g.pos = p; moved = true; } }
  if (moved) setTick(tick() + 1);
  const d = ease(darkPos(), isDark() ? 1 : 0, dt);
  if (d !== darkPos()) setDarkPos(d);
  const a = ease(sheetAt(), sheetTarget(), dt);
  if (a !== sheetAt()) setSheetAt(a);
});
