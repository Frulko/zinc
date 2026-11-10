import * as ui from 'zinc:ui';
import { width } from 'zinc:gfx';
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Button, SearchField, Select, Tabs, Switch, Sheet, Separator, theme, setTheme, LIGHT, DARK } from 'zinc:ui/kit';
import { env } from 'zinc:sys';
import { createTracker } from './state';
import { priorities } from './data';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { CreateIssueDialog } from './components/CreateIssueDialog';
enum Overlay { Closed, Sidebar, Detail, Create }
export function App(): i32 {
  const model = createTracker();
  const [viewport, setViewport] = createSignal<number>(width());
  const [overlay, setOverlay] = createSignal<Overlay>(Overlay.Closed);
  const [dark, setDark] = createSignal(env('TRACKER_DARK') === '1');
  setTheme(dark() ? DARK : LIGHT);
  const transition = (next: Overlay): void => {
    if (overlay() !== Overlay.Closed && next !== Overlay.Closed) return;
    setOverlay(next);
  };
  const close = (): void => transition(Overlay.Closed);
  const openDetail = (): void => { if (viewport() < 1200) transition(Overlay.Detail); };
  const resize = (): void => {
    const current = width();
    if (current === viewport()) return;
    setViewport(current);
    if ((current >= 1200 && overlay() === Overlay.Detail) || (current >= 760 && overlay() === Overlay.Sidebar)) close();
  };
  ui.addWatcher(resize); onCleanup(() => ui.removeWatcher(resize));
  return <View className={`flex-row w-full h-full bg-${theme().background} text-${theme().foreground}`}>
    <Show when={viewport() >= 760}>
      <View className={`w-[240px] shrink-0 p-3 flex-col border-r border-${theme().border}`}><WorkspaceSidebar model={model} onNavigate={close} /></View>
    </Show>
    <View className={`flex-1 min-w-0 flex-col bg-${theme().card}`}>
      <View className="flex-row gap-3 items-center p-4 shrink-0">
        <Show when={viewport() < 760}><Button label="Menu" variant="outline" size="sm" onClick={() => transition(Overlay.Sidebar)} /></Show>
        <View className="grow min-w-0 flex-col gap-1">
          <Text className={`text-[17px] font-medium text-${theme().foreground}`}>{model.navigation() === 'all' ? 'All issues' : model.navigation() === 'mine' ? 'My issues' : model.navigation()}</Text>
          <Text className={`text-[12px] text-${theme().mutedForeground}`}>Survey launch · Fieldwork</Text>
        </View>
        <Button label="New issue" size="sm" onClick={() => transition(Overlay.Create)} />
      </View>
      <View className="px-4 pb-4 flex-col gap-3 shrink-0">
        <View className="flex-row flex-wrap items-center gap-3">
          <Tabs label="Issue views" items={['All issues', 'Active', 'Backlog']} selected={() => model.view() === 'active' ? 1 : model.view() === 'backlog' ? 2 : 0} onSelect={(index: i32) => model.setView(index === 1 ? 'active' : index === 2 ? 'backlog' : 'all')} />
          <View className="grow" />
          <Switch label="Dark" checked={dark} onChange={(value: boolean) => { setDark(value); setTheme(value ? DARK : LIGHT); }} />
        </View>
        <SearchField label="Search issues" placeholder="Search title, label or person…" value={model.query} onInput={model.setQuery} clearable={true} />
        <View className="flex-row flex-wrap gap-2 items-end">
          <Select label="Filter priority" items={[{ value: 'all', label: 'All priorities' }].concat(priorities.map((label: string) => ({ value: label, label })))} value={model.priority} onChange={model.setPriority} className="w-[145px]" />
          <Select label="Group by" items={[{ value: 'status', label: 'Status' }, { value: 'assignee', label: 'Assignee' }]} value={model.grouping} onChange={model.setGrouping} className="w-[130px]" />
          <Select label="Sort by" items={[{ value: 'priority', label: 'Priority' }, { value: 'title', label: 'Title' }]} value={model.sorting} onChange={model.setSorting} className="w-[120px]" />
        </View>
      </View>
      <Separator />
      <IssueList compact={viewport() < 760} model={model} onOpen={openDetail} />
      <View className={`shrink-0 px-4 py-2 flex-col gap-1 border-t border-${theme().border}`}>
        <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{String(model.visible().length) + ' issues · ' + model.notice()}</Text>
        <Text className={`text-[11px] text-${theme().mutedForeground}`}>Tab to controls · arrows in lists and menus · Enter to open · Escape to close</Text>
      </View>
    </View>
    <Show when={viewport() >= 1200}>
      <ScrollView className={`w-[360px] shrink-0 p-5 border-l border-${theme().border} bg-${theme().card}`}><IssueDetail model={model} /></ScrollView>
    </Show>
    <Sheet title="Fieldwork" side="left" size={280} open={() => overlay() === Overlay.Sidebar} onOpenChange={(open: boolean) => { if (!open) close(); }}><WorkspaceSidebar model={model} onNavigate={close} /></Sheet>
    <Sheet title="Issue details" size={Math.min(420, viewport())} open={() => overlay() === Overlay.Detail} onOpenChange={(open: boolean) => { if (!open) close(); }}><IssueDetail model={model} /></Sheet>
    <CreateIssueDialog width={Math.min(500, viewport() - 32)} model={model} open={() => overlay() === Overlay.Create} onClose={close} onCreated={openDetail} />
  </View>;
}
