// The zinc:ui scenes of the render suite (tools/zbench): what a screen of an app does, not the renderer's raw commands. Each one is deterministic: the
// gestures are injected by the program itself (ui.pointerAt, ui.wheelAt) at fixed frames, the tweens start at fixed frames, nothing reads the clock.
import { createNodeRef, createSignal, render, NodeRef, Show } from 'zinc:ui/solid';
import { closeSection } from './report';
import * as ui from 'zinc:ui';

const ROWS = 400;
const rows: i32[] = [];
for (let i = 0; i < ROWS; i++) rows.push(i);
const list = createNodeRef();

// a long list scrolled the way a finger does: a drag, a release, the inertia and the rubber band; back to the top at the end
function ScrollApp(): i32 {
  return <View className="flex-col h-full bg-white">
    <ScrollView ref={list} className="h-full">
      {rows.map((i: i32) => <View className={i % 2 === 0 ? 'h-[44] px-3 justify-center bg-white' : 'h-[44] px-3 justify-center bg-gray-100'}><Text>{`Row ${i} of a long list, with some text to lay out`}</Text></View>)}
    </ScrollView>
  </View>;
}
let sx = 0, sy = 0;
function scrollFling(f: number): void {
  const c = f % 100;
  if (c === 2) { ui.pointerAt(0, 0, false); const b = ui.screenBox(list.node); sx = b[0] + b[2] / 2; sy = b[1] + b[3] - 60; ui.pointerAt(sx, sy, true); }
  if (c >= 3 && c <= 9) { sy -= 40; ui.pointerAt(sx, sy, true); }
  if (c === 10) ui.pointerAt(sx, sy, false);                 // the release starts the inertia
  if (c === 99 && ui.scrollTop(list.node) > ROWS * 44 - 2000) ui.scrollTo(list.node, 0, 0);
}
function scrollWheel(f: number): void {
  if (f % 6 === 0) { const b = ui.screenBox(list.node); ui.wheelAt(b[0] + 40, b[1] + 40, -3); }   // a mouse notch every 6 frames: the eased scroll
  if (f % 600 === 599) ui.scrollTo(list.node, 0, 0);
}

// 150 views whose transform and opacity tween (paint only: no layout runs while they move)
const N_TW = 150;
const tws: i32[] = [];
for (let i = 0; i < N_TW; i++) tws.push(i);
const twRefs: NodeRef[] = [];
for (let i = 0; i < N_TW; i++) twRefs.push(createNodeRef());
function TransformApp(): i32 {
  return <View className="flex-row flex-wrap h-full bg-gray-900 p-2">
    {tws.map((i: i32) => <View ref={twRefs[i]} className="w-[70] h-[50] m-1 rounded-lg bg-blue-500" />)}
  </View>;
}
function animTransform(f: number): void {
  if (f % 40 === 1) for (let i = 0; i < N_TW; i++) {
    const n = twRefs[i].node;
    const dir = (Math.floor(f / 40) + i) % 2 === 0 ? 1 : -1;
    ui.animate(n, 'translateX', dir * 30, 600, 'ease-in-out', (i % 10) * 20);
    ui.animate(n, 'opacity', dir > 0 ? 0.4 : 1, 600, 'ease-in-out', (i % 10) * 20);
  }
}

// twelve bars whose width tweens: a length transition lays out on every frame
const bars: i32[] = [];
const barRefs: NodeRef[] = [];
for (let i = 0; i < 12; i++) { bars.push(i); barRefs.push(createNodeRef()); }
function LayoutApp(): i32 {
  return <View className="flex-col h-full bg-white p-4">
    {bars.map((i: i32) => <View className="flex-row items-center h-[40] mb-2"><View ref={barRefs[i]} className="h-[28] w-[100] rounded bg-green-500" /><Text className="ml-3">{`bar ${i}`}</Text></View>)}
  </View>;
}
function animLayout(f: number): void {
  if (f % 50 === 1) for (let i = 0; i < 12; i++) ui.animate(barRefs[i].node, 'width', (Math.floor(f / 50) + i) % 2 === 0 ? 600 : 100, 700, 'ease-in-out', i * 20);
}

// a reactive list: every frame all the values of 100 rows change
const sig: (() => number)[] = [];
const setters: ((v: number) => void)[] = [];
for (let i = 0; i < 100; i++) { const [g, s] = createSignal<number>(0); sig.push(g); setters.push(s); }
const items: i32[] = [];
for (let i = 0; i < 100; i++) items.push(i);
function UpdateApp(): i32 {
  return <View className="flex-col h-full bg-white">
    {items.map((i: i32) => <View className="h-[20] px-2"><Text>{`row ${i} value ${sig[i]()}`}</Text></View>)}
  </View>;
}
function listUpdate(f: number): void { for (let i = 0; i < 100; i++) setters[i](f * 7 + i); }

export function startUi(id: string): void {
  if (id === 'ui_scroll_fling') render(ScrollApp, 0xffffff, (dt: number) => { frame++; scrollFling(frame); });
  else if (id === 'ui_scroll_wheel') render(ScrollApp, 0xffffff, (dt: number) => { frame++; scrollWheel(frame); });
  else if (id === 'ui_anim_transform') render(TransformApp, 0x111827, (dt: number) => { frame++; animTransform(frame); });
  else if (id === 'ui_anim_layout') render(LayoutApp, 0xffffff, (dt: number) => { frame++; animLayout(frame); });
  else if (id === 'ui_list_update') render(UpdateApp, 0xffffff, (dt: number) => { frame++; listUpdate(frame); });
}
let frame = 0;

// All the toolkit scenes in one run (tools/zbench: one launch, one report): one root shows the scene named by a signal, the others are unmounted.
const [cur, setCur] = createSignal<number>(-1);
function AllApp(): i32 {
  return <View className="h-full bg-white">
    <Show when={cur() === 0 || cur() === 1}><ScrollApp /></Show>
    <Show when={cur() === 2}><TransformApp /></Show>
    <Show when={cur() === 3}><LayoutApp /></Show>
    <Show when={cur() === 4}><UpdateApp /></Show>
  </View>;
}
const UI_IDS: string[] = ['ui_scroll_fling', 'ui_scroll_wheel', 'ui_anim_transform', 'ui_anim_layout', 'ui_list_update'];
/** Runs the named scenes one after the other, `per` frames each (the warm-up included), closing a profile section after each; `done` runs after the last. */
export function startUiSequence(wanted: string[], per: number, maxs: number, done: () => void): void {
  const idx: number[] = [];
  for (let i = 0; i < wanted.length; i++) idx.push(UI_IDS.indexOf(wanted[i]));
  let k = 0;
  let f = 0;
  let el = 0;
  render(AllApp, 0xffffff, (dt: number) => {
    if (k >= idx.length) return;
    const sc = idx[k];
    if (f === 0) setCur(sc);
    if (f === 0) el = performance.now();
    f++;
    if (sc === 0) scrollFling(f);
    else if (sc === 1) scrollWheel(f);
    else if (sc === 2) animTransform(f);
    else if (sc === 3) animLayout(f);
    else listUpdate(f);
    if (f === per || (f >= 8 && performance.now() - el > maxs * 1000)) {
      closeSection(wanted[k], k + 1 >= idx.length);
      k++;
      f = 0;
      if (k >= idx.length) done();
    }
  });
}
