import { createNodeRef, createSignal, onCleanup, VirtualList } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { TaskCard } from '../../components/TaskCard';
import { STATUSES, COLUMN_NAMES, COLUMN_COLORS, CARD_HEIGHT } from '../../constants';
import { inColumn, taskOf, moveTask, draggedId, setDraggedId, setDropId, dropId, selectedId } from '../../state';

const [dragX, setDragX] = createSignal<number>(0), [dragY, setDragY] = createSignal<number>(0);

function Column(props: { index: i32 }): i32 {
  const at = props.index, status = STATUSES[at], ref = createNodeRef();
  const list = <VirtualList count={inColumn(status).length} itemHeight={CARD_HEIGHT} className="grow min-h-0">
    {(i: i32) => <TaskCard task={inColumn(status)[i]} />}
  </VirtualList>;
  const node = <View ref={ref} className={`flex-col grow shrink-0 min-w-[240] basis-0 rounded-[14] p-2 ${dropId() === 'column:' + status ? 'bg-[#e6e9dd]' : 'bg-[#eeeee8]'}`}>
    <View className="flex-row items-center h-[48] px-2 gap-2.5">
      <View className={`w-[8] h-[8] rounded-full bg-[${COLUMN_COLORS[at]}]`} />
      <Text className="text-[13px] font-semibold text-[#424a41] grow">{COLUMN_NAMES[at]}</Text>
      <Text className="text-[12px] font-mono text-[#8b9187]">{inColumn(status).length}</Text>
    </View>
    {inColumn(status).length === 0 && <View className="h-[120] items-center justify-center gap-2">
      <Text className="text-[13px] text-[#92998b]">Aucune tâche</Text>
      <Text className="text-[11px] text-[#92998b]">Déposez une carte ici</Text>
    </View>}
  </View>;
  ui.insert(ref.node, list, 1);
  onCleanup(dnd.dropTarget(ref.node, { data: 'column:' + status,
    onDragEnter: (d: dnd.DragInfo) => setDropId('column:' + status), onDragLeave: (d: dnd.DragInfo) => setDropId('') }));
  onCleanup(dnd.autoScroll(list));
  return node;
}
export function watchDrags(): void {
  dnd.monitor({ onDragStart: (d: dnd.DragInfo) => { setDraggedId(d.data); setDragX(d.x); setDragY(d.y); },
    onDrag: (d: dnd.DragInfo) => { setDragX(d.x); setDragY(d.y); },
    onDrop: (d: dnd.DragInfo) => {
      setDraggedId(''); setDropId('');
      if (d.targets.length === 0 || selectedId() !== '') return;
      const target = d.targets[0];
      if (target.data.startsWith('column:')) moveTask(d.data, target.data.slice(7));
      else { const onto = taskOf(target.data); if (onto !== null) moveTask(d.data, onto.status, onto.id, target.edge === dnd.EDGE_BOTTOM); }
    }
  });
}
export function DragPreview(): i32 {
  return <View className="absolute pointer-events-none w-[220] p-4 rounded-[12] bg-[#fffaf0] border border-[#c9875b] shadow-lg gap-2"
    hidden={draggedId() === '' ? 1 : 0} style={{ left: dragX() + 12, top: dragY() + 12 }}>
    <Text className="text-[11px] font-mono text-[#ab744c]">{draggedId()}</Text>
    <Text className="text-[14px] font-semibold text-[#42513c]" numberOfLines={2}>{taskOf(draggedId())?.title ?? ''}</Text>
  </View>;
}
export function Board(): i32 {
  return <View className="grow min-h-0 px-6 pb-5 overflow-x-auto">
    <View className="flex-row gap-3 grow min-h-0 min-w-[1248]">
      {STATUSES.map((status: string, i: i32) => <Column index={i} />)}
    </View>
  </View>;
}
