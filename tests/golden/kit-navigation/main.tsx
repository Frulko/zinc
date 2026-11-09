import * as ui from 'zinc:ui';
import { createNodeRef, createSignal, render } from 'zinc:ui/solid';
import { Tabs, Sidebar, Breadcrumb, Pagination, Stepper, TableOfContents, Dock, TabBar, useQuietTheme } from 'zinc:ui/kit';
import { pageItems } from '../../../lib/std/pagination';
import { pageItems as nuxtPages } from 'zinc:ui/nuxt';
useQuietTheme();
const root = createNodeRef(), scroll = createNodeRef(), first = createNodeRef(), last = createNodeRef();
const [tab, setTab] = createSignal<i32>(0), [page, setPage] = createSignal<i32>(0), [step, setStep] = createSignal<i32>(1);
const [side, setSide] = createSignal('a'), [mobile, setMobile] = createSignal('a'), [closed, setClosed] = createSignal<string[]>([]);
let action = '', ancestor = '', frame = 0;
function App(): i32 {
  return <View ref={root} className="w-[600px] gap-3 p-4">
    <Tabs label="Project tabs" className="w-[180px]" items={['Overview', 'Locked', 'A long final tab']} disabled={[1]} selected={tab} onSelect={setTab} />
    <Tabs label="Empty" items={[]} selected={() => -1} onSelect={(i: i32) => { throw new Error('empty tabs'); }} />
    <Sidebar label="Workspace" groups={[{ id: 'group', label: 'Projects', items: [{ id: 'a', label: 'Inbox', icon: 'mail' }, { id: 'b', label: 'Locked link', disabled: true }, { id: 'c', label: 'Files', icon: 'folder' }] }]} selected={side} onSelect={setSide} closedGroups={closed} onGroupToggle={(id: string) => setClosed(closed().length === 0 ? [id] : [])} />
    <Breadcrumb maxItems={2} items={[{ label: 'Home', onSelect: () => { ancestor = 'Home'; } }, { label: 'Studio', onSelect: () => { ancestor = 'Studio'; } }, { label: 'Collection' }]} />
    <Pagination page={page} pages={20} onChange={setPage} />
    <Stepper label="Release" items={[{ label: 'Prepare' }, { label: 'Review' }, { label: 'Publish' }]} current={step} onSelect={setStep} linear={true} />
    <View className="flex-row gap-4">
      <ScrollView ref={scroll} className="w-[280px] h-[80px]"><View><Text ref={first}>Start</Text><View className="h-[160px]" /><Text ref={last}>Finish</Text></View></ScrollView>
      <TableOfContents scroll={() => scroll.node} items={[{ label: 'Start section', anchor: () => first.node }, { label: 'Finish section', anchor: () => last.node, level: 1 }]} />
    </View>
    <Dock items={[{ id: 'files', label: 'Open files', icon: 'folder', running: true, badge: 2 }, { id: 'locked', label: 'Locked app', disabled: true }]} onSelect={(id: string) => { action = id; }} />
    <TabBar label="Mobile" items={[{ id: 'a', label: 'Library', icon: 'folder' }, { id: 'b', label: 'Search', icon: 'mail' }]} selected={mobile} onSelect={setMobile} />
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const result = find(child, label); if (result >= 0) return result; }
  return -1;
}
function control(label: string): i32 { const h = find(root.node, label); if (h < 0) throw new Error('missing ' + label); return h; }
function current(label: string): string { const n = ui.inspectNode(control(label)); if (n === null) return ''; const i = n.attrK.indexOf('aria-current'); return i < 0 ? '' : n.attrV[i]; }
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    if (pageItems(7, 20, 1).join(',') !== '1,0,6,7,8,0,20' || nuxtPages(1, 0, 1).length !== 0) throw new Error('shared page layout');
    ui.systemSignal('reducemotion 1');
    ui.keyDown(control('Overview'), 'ArrowRight');
    if (tab() !== 2 || ui.focused() !== control('A long final tab')) throw new Error('tabs disabled skip and focus');
  }
  if (frame === 3) {
    if (ui.scrollLeft(control('Project tabs')) <= 0) throw new Error('selected tab not revealed');
    ui.keyDown(control('A long final tab'), 'Home');
    ui.keyDown(control('Inbox'), 'ArrowDown');
    if (ui.focused() !== control('Files')) throw new Error('sidebar skip disabled');
    ui.keyDown(control('Files'), 'Enter');
  }
  if (frame === 4) {
    ui.keyUp('Enter');
    if (tab() !== 0 || side() !== 'c') throw new Error('tab home / sidebar keyboard activation');
    ui.click(control('Projects'));
    if (closed().length !== 1) throw new Error('sidebar disclosure');
    ui.keyDown(control('Page 1'), 'End');
    if (page() !== 19) throw new Error('pagination end');
    ui.click(control('Next'));
    if (page() !== 19) throw new Error('pagination boundary');
    ui.click(control('Publish'));
    if (step() !== 1) throw new Error('linear stepper advanced');
    ui.keyDown(control('Review'), 'Home');
    ui.keyDown(control('Prepare'), 'Enter');
  }
  if (frame === 5) {
    ui.keyUp('Enter');
    if (step() !== 0) throw new Error('stepper keyboard');
    ui.click(control('Finish section'));
    if (ui.scrollTop(scroll.node) <= 0) throw new Error('contents did not scroll');
    ui.keyDown(control('Open files'), 'Enter');

  }
  if (frame === 6) {
    ui.keyUp('Enter');
    if (action !== 'files') throw new Error('dock keyboard');
    ui.keyDown(control('Library'), 'ArrowRight');
    if (mobile() !== 'b') throw new Error('tabbar keyboard');
    if (current('Finish section') !== 'location') throw new Error('contents did not follow');
    const rail = ui.inspectNode(control('On this page'));
    if (rail === null || Math.abs(ui.getNumber(rail.children[0], 'height') - ui.screenBox(control('On this page'))[3]) > 1) throw new Error('contents progress did not fill');
    ui.click(control('Locked app'));
    if (action !== 'files') throw new Error('disabled dock');
    ui.scrollTo(scroll.node, 0, 0);
    ui.click(control('Earlier locations'));
  }
  if (frame === 7) {
    if (current('Start section') !== 'location') throw new Error('contents did not follow scroll back');
    // Menus live in their own layer, outside the component root.
    ui.keyDown(ui.focused(), 'Enter');
  }
  if (frame === 8) {
    ui.keyUp('Enter');
    if (ancestor !== 'Studio') throw new Error('hidden breadcrumb unreachable');
    console.log('navigation: ok');
  }
});
