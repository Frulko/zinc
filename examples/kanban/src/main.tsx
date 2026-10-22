import { render, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Sidebar } from './components/Sidebar';
import { TaskModal } from './components/TaskModal';
import { ActivityPanel } from './components/ActivityPanel';
import { Board, DragPreview, watchDrags } from './pages/board/Board';
import { BACKGROUND } from './constants';
import { tasks, query, setQuery, filtered, milestone, setMilestone, localCount, notice, connection, live, connect, resetBoard, selectedId, closeTask, activity, setActivityOpen } from './state';
import { Task } from './models';

const search = createNodeRef();
function App(): i32 {
  return <View className="flex-row w-full h-full bg-[#f6f5f1]">
    <Sidebar />
    <View className="grow min-w-0 flex-col">
      <View className="flex-row h-[58] items-center px-7 gap-2 border-b border-[#e5e5dc]">
        <Text className="text-[12px] text-[#989d91]">ESPACE ZINC</Text><Text className="text-[12px] text-[#c2c5b8]"> / </Text>
        <Text className="text-[12px] text-[#56634f] grow">Développement du moteur</Text>
        <Text className={`text-[11px] ${live() ? 'text-[#6e8b61]' : 'text-[#b47a4d]'}`} numberOfLines={1}>{connection()}</Text>
        <Button onClick={connect} className="h-[40] px-3 rounded-lg bg-transparent hover:bg-[#eaece1]"><Text className="text-[12px] text-[#6b785f]">Reconnecter</Text></Button>
      </View>
      <View className="flex-row items-center px-7 pt-6 pb-5 gap-5">
        <View className="grow flex-col gap-1.5"><Text className="text-[30px] font-bold text-[#334333]">Le chantier Zinc</Text>
          <Text className="text-[13px] text-[#909782]">{'Un moteur, mille idées. Le backlog prend forme.'}</Text></View>
        <View className="flex-col items-end gap-1"><Text className="text-[25px] font-mono text-[#526548]">{tasks().filter((t: Task) => t.status === 'Done').length + '/' + tasks().length}</Text><Text className="text-[11px] text-[#959b89]">tâches terminées</Text></View>
      </View>
      <View className="flex-row items-center px-6 pb-4 gap-3">
        <View className="bg-[#e4e8da] rounded-lg h-[40] px-4 justify-center"><Text className="text-[12px] font-semibold text-[#526348]">Tableau Kanban</Text></View>
        <Input ref={search} value={query()} onInput={(v: string) => setQuery(v)} placeholder="Rechercher une tâche, un agent, un label…" aria-label="Rechercher dans le backlog" className="h-[40] w-[340] text-[13px] px-3 rounded-lg bg-[#ffffff] border border-[#e0e3d6] text-[#44533c]" />
        <Text className="text-[11px] text-[#929a86] grow">{filtered().length + ' tâches affichées'}</Text>
        <Button onClick={() => setActivityOpen(true)} className="h-[40] px-3 rounded-lg bg-transparent hover:bg-[#eaece1]"><Text className="text-[12px] text-[#6b785f]">{'Activité (' + activity().length + ')'}</Text></Button>
        {milestone() !== '' && <Button onClick={() => setMilestone('')} className="h-[40] px-3 rounded-lg bg-[#e7e9df]"><Text className="text-[12px] text-[#6b785f]">{milestone() + ' ×'}</Text></Button>}
        <Button onClick={resetBoard} className="h-[40] px-3 rounded-lg border border-[#dfe2d3] bg-[#f9faf4]"><Text className="text-[12px] text-[#6b785f]">{'Réinitialiser' + (localCount() > 0 ? ' (' + localCount() + ')' : '')}</Text></Button>
      </View>
      <Board />
      <View className="h-[46] px-7 flex-row items-center gap-4 border-t border-[#e5e5dc] bg-[#f9f9f3]">
        <Text className="text-[11px] text-[#b57b52] font-semibold">DÉMO LOCALE</Text>
        <Text className="text-[11px] text-[#8a947b] grow" numberOfLines={1}>{notice()}</Text>
        <Text className="text-[11px] text-[#8a947b]" numberOfLines={1}>{activity().length > 0 ? activity()[0] : '⌘K rechercher · ⇧← / ⇧→ déplacer'}</Text>
      </View>
    </View>
    <DragPreview />
    <TaskModal />
    <ActivityPanel />
  </View>;
}
ui.onKey((e: ui.KeyEvent) => {
  if (e.primary && e.key === 'k') { ui.focusNode(search.node); e.preventDefault(); }
  if (e.key === 'Escape' && selectedId() !== '') { closeTask(); e.preventDefault(); }
});
watchDrags();
connect();
render(App, BACKGROUND, null);
