import { render, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { Sidebar } from './components/Sidebar';
import { TaskModal } from './components/TaskModal';
import { ActivityPanel } from './components/ActivityPanel';
import { Board, DragPreview, watchDrags } from './pages/board/Board';
import { BACKGROUND } from './constants';
import { tasks, query, setQuery, filtered, milestone, setMilestone, localCount, notice, connection, live, connect, resetBoard, selectedId, closeTask, activity, setActivityOpen } from './state';
import { Task } from './models';

const search = createNodeRef();
function App(): i32 {
  return <View className="flex-row w-full h-full bg-[#f7f8fa]">
    <Sidebar />
    <View className="grow min-w-0 flex-col">
      <View className="flex-row h-[48] shrink-0 items-center px-4 gap-3 border-b border-[#dfe3e8] bg-[#fafbfc]">
        <Text className="text-[14px] font-semibold text-[#394553]">Backlog</Text>
        <Text className="text-[11px] text-[#9aa2ad]">{tasks().length + ' tâches'}</Text>
        <View className="grow" />
        <Input ref={search} value={query()} onInput={(v: string) => setQuery(v)} placeholder="Rechercher…" aria-label="Rechercher dans le backlog" className="h-[32] w-[280] text-[12px] px-2 rounded-[5] bg-[#ffffff] border border-[#dce1e7] text-[#445160]" />
        {milestone() !== '' && <Button onClick={() => setMilestone('')} className="h-[32] px-2 rounded-[5] bg-[#e9edf2]"><Text className="text-[12px] text-[#637286]">{milestone() + ' ×'}</Text></Button>}
        <Button onClick={() => setActivityOpen(true)} className="h-[36] px-2 rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Text className="text-[12px] text-[#637286]">{'Activité' + (activity().length > 0 ? ' · ' + activity().length : '')}</Text></Button>
        <Button onClick={resetBoard} className="h-[36] px-2 rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Text className="text-[12px] text-[#637286]">{'Réinitialiser' + (localCount() > 0 ? ' · ' + localCount() : '')}</Text></Button>
        <Button onClick={connect} aria-label="Reconnecter le backlog" className="h-[36] w-[36] items-center justify-center rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Icon name="refresh-cw" size={15} color={() => 0x7b8795} /></Button>
      </View>
      <Board />
      <View className="h-[28] shrink-0 px-4 flex-row items-center gap-3 border-t border-[#e1e5eb] bg-[#fafbfc]">
        <Text className={`text-[10px] ${live() ? 'text-[#658675]' : 'text-[#bd8059]'}`}>{live() ? '●' : '○'}</Text>
        <Text className="text-[10px] text-[#8794a3] grow" numberOfLines={1}>{live() ? notice() : connection()}</Text>
        <Text className="text-[10px] text-[#8794a3]" numberOfLines={1}>{filtered().length + ' affichées · ' + tasks().filter((t: Task) => t.status === 'Done').length + ' terminées'}</Text>
      </View>
    </View>
    <DragPreview /><TaskModal /><ActivityPanel />
  </View>;
}
ui.onKey((e: ui.KeyEvent) => {
  if (e.primary && e.key === 'k') { ui.focusNode(search.node); e.preventDefault(); }
  if (e.key === 'Escape' && selectedId() !== '') { closeTask(); e.preventDefault(); }
});
watchDrags(); connect(); render(App, BACKGROUND, null);
