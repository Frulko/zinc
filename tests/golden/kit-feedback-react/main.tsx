import * as ui from 'zinc:ui';
import { render, useState, MutableRef } from 'zinc:ui/react';
import { Svg } from 'zinc:svg';
import { componentEffect } from '../../../lib/std/kit/host';
import { Alert, Banner, ProgressRing, Spinner, Skeleton, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = new MutableRef<i32>(-1);
let update: (n: number) => void = (n: number) => {};
let effects: i32 = 0, frame: i32 = 0;
let resource: Svg | null = null, old: Svg | null = null;
function Probe(): i32 {
  componentEffect(() => {
    effects++;
    const image = new Svg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>');
    resource = image;
    return () => { image.dispose(); effects--; };
  });
  return <View />;
}
function App(): i32 {
  const [revision, setRevision] = useState(0);
  update = setRevision;
  return <View ref={root} className="p-4 flex-col gap-3">
    <Banner title="Update" dismissible={true} />
    <Alert title="Notice" dismissible={true} dismissLabel="Hide notice" />
    {revision < 2 ? <View>
      <Probe /><Spinner label="Working" /><Skeleton width={100} />
      <ProgressRing value={() => revision * 30} label="Ring" size={48} />
    </View> : null}
  </View>;
}
function find(h: i32, text: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === text) return h;
  if (n.tag === ui.TEXT && n.text === text) {
    for (let p = n.parent; p >= 0; p = ui.parentOf(p)) { const parent = ui.inspectNode(p); if (parent !== null && parent.tag === ui.BUTTON) return p; }
    return h;
  }
  for (const child of n.children) { const result = find(child, text); if (result >= 0) return result; }
  return -1;
}
function visible(h: i32): boolean {
  if (h < 0) return false;
  for (let p = h; p >= 0; p = ui.parentOf(p)) { const n = ui.inspectNode(p); if (n === null || n.hidden) return false; }
  return true;
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    ui.systemSignal('reducemotion 1');
    ui.click(find(root.current, 'Hide notice'));
    old = resource; update(1);
  }
  if (frame === 3) {
    if (effects !== 1 || old === null || (old as Svg).items() !== 0) throw new Error('React replacement retained effect/Svg');
    if (visible(find(root.current, 'Notice'))) throw new Error('React rerender reopened dismissed alert');
    ui.tick(1);
    if (ui.getNumber(find(root.current, 'Working'), 'rotate') !== 0) throw new Error('React reduced motion');
    old = resource; update(2);
  }
  if (frame === 4) {
    if (effects !== 0 || old === null || (old as Svg).items() !== 0) throw new Error('React unmount retained effect/Svg');
    ui.tick(2000); ui.systemSignal('reducemotion 0'); ui.tick(1);
    console.log('feedback react: ok');
  }
});
