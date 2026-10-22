import { createNodeRef, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { Task, assignment } from '../models';
import { openTask, moveTask, inColumn, draggedId, dropId, setDropId } from '../state';
import { STATUSES } from '../constants';

export function TaskCard(props: { task: Task }): i32 {
  const t = props.task, ref = createNodeRef();
  const node = <View className="h-[164] px-1 pb-3">
    <Button ref={ref} aria-label={t.id + ' ' + t.title} onClick={() => openTask(t.id)}
      onKeyDown={(e: ui.KeyEvent) => {
        if (e.shift && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          const siblings = inColumn(t.status), at = siblings.findIndex((x: Task) => x.id === t.id);
          const to = at + (e.key === 'ArrowUp' ? -1 : 1);
          if (to >= 0 && to < siblings.length) moveTask(t.id, t.status, siblings[to].id, to > at);
          e.preventDefault();
        }
        if (e.shift && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          const at = STATUSES.indexOf(t.status) + (e.key === 'ArrowLeft' ? -1 : 1);
          if (at >= 0 && at < STATUSES.length) moveTask(t.id, STATUSES[at]);
          e.preventDefault();
        }
      }}
      className={`flex-col items-start h-[152] p-4 gap-2 rounded-[12] border shadow-sm bg-[#ffffff] hover:bg-[#fdfcf9] focus:border-[#be7048] cursor-grab ${draggedId() === t.id ? 'opacity-40' : 'opacity-100'} ${dropId() === t.id ? 'border-[#be7048]' : 'border-[#e5e4df]'}`}>
      <View className="flex-row items-center w-full gap-2">
        <Text className="font-mono text-[11px] text-[#8c8c83] grow">{t.id}</Text>
        <Text className={`text-[10px] font-semibold ${t.priority === 'high' ? 'text-[#b26b46]' : 'text-[#93968e]'}`}>{t.priority === 'high' ? 'PRIORITÉ HAUTE' : t.milestone}</Text>
      </View>
      <Text className="text-[14px] leading-[19] font-semibold text-[#333c35] w-full" numberOfLines={2}>{t.title}</Text>
      <View className="flex-row gap-1 h-[19] items-center">
        {t.labels.slice(0, 2).map((label: string) => <View className="rounded-[4] bg-[#eef1e9] px-1.5 py-0.5"><Text className="text-[10px] text-[#627056]">{label}</Text></View>)}
      </View>
      <View className="flex-row items-center w-full gap-2 mt-auto">
        <Text className={`text-[11px] grow basis-0 min-w-0 ${t.assignees.length > 0 ? 'text-[#4b7564]' : 'text-[#969a93]'}`} numberOfLines={1}>{t.assignees.length > 0 ? '● ' + assignment(t) : '○ Non assignée'}</Text>
        <Text className="text-[11px] w-[26] shrink-0 font-mono text-[#92978f]">{t.completed + '/' + t.criteria}</Text>
      </View>
    </Button>
  </View>;
  onCleanup(dnd.draggable(ref.node, { data: t.id }));
  onCleanup(dnd.dropTarget(ref.node, { data: t.id, edges: dnd.EDGES_VERTICAL,
    onDrag: (d: dnd.DragInfo) => setDropId(t.id), onDragLeave: (d: dnd.DragInfo) => setDropId('') }));
  return node;
}
