import * as ui from 'zinc:ui';
import { render, useState, MutableRef } from 'zinc:ui/react';
import { NavigationTabs, Sidebar, TableOfContents, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = new MutableRef<i32>(-1), scroll = new MutableRef<i32>(-1), first = new MutableRef<i32>(-1), last = new MutableRef<i32>(-1);
let current = '', frame = 0;
function App(): i32 {
  const [tab, setTab] = useState('a');
  current = tab;
  return <View ref={root} className="w-[500px] p-4 gap-4">
    <NavigationTabs label="React tabs" items={[{ id: 'a', label: 'Overview', icon: 'folder' }, { id: 'b', label: 'Files', icon: 'mail' }]} selected={() => tab} onSelect={setTab} />
    <Sidebar label="Workspace" selected={() => tab} onSelect={setTab} groups={[{ id: 'workspace', label: 'Workspace', items: [{ id: 'a', label: 'Inbox' }, { id: 'b', label: 'Collection' }] }]} />
    <View className="flex-row gap-4"><ScrollView ref={scroll} className="w-[220px] h-[80px]"><View><Text ref={first}>First</Text><View className="h-[160px]" /><Text ref={last}>Last</Text></View></ScrollView><TableOfContents scroll={() => scroll.current} items={[{ label: 'First section', anchor: () => first.current }, { label: 'Last section', anchor: () => last.current }]} /></View>
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const found = find(child, label); if (found >= 0) return found; }
  return -1;
}
function control(label: string): i32 { const h = find(root.current, label); if (h < 0) throw new Error('missing ' + label); return h; }
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) { ui.systemSignal('reducemotion 1'); ui.keyDown(control('Overview'), 'ArrowRight'); }
  if (frame === 3) {
    if (current !== 'b') throw new Error('React tab state');
    ui.keyDown(control('Files'), 'Home');
  }
  if (frame === 4) {
    if (current !== 'a') throw new Error('React tab key after rerender');
    ui.click(control('Collection'));
  }
  if (frame === 5) {
    if (current !== 'b') throw new Error('React sidebar after rerender');
    ui.click(control('Last section'));
    if (ui.scrollTop(scroll.current) <= 0) throw new Error('React contents after rerender');
  }
  if (frame === 6) {
    const n = ui.inspectNode(control('Last section'));
    if (n === null || n.attrK.indexOf('aria-current') < 0 || n.attrV[n.attrK.indexOf('aria-current')] !== 'location') throw new Error('React contents follow');
    console.log('navigation react: ok');
  }
});
