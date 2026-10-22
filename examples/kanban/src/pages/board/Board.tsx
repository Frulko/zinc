import { createNodeRef, createSignal, onCleanup, VirtualList, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { TaskCard, CardContent, cardGrip } from '../../components/TaskCard';
import { STATUSES, COLUMN_NAMES, COLUMN_COLORS, CARD_HEIGHT } from '../../constants';
import { inColumn, taskOf, moveTask, draggedId, setDraggedId, setDropId, dropId, selectedId } from '../../state';

const [dragBox, setDragBox] = createSignal<number[]>([0, 0, 0, 0]);
const [dropLine, setDropLine] = createSignal<number[]>([]);
const scrollers = new Map<string, i32>();
let gripX: number = 0, gripY: number = 0;
export function columnScroller(status: string): i32 { return scrollers.get(status) ?? -1; }
export function previewBox(): number[] { return dragBox(); }

function Column(props: { index: i32 }): i32 {
  const at = props.index, status = STATUSES[at], ref = createNodeRef();
  // Virtual rows need a host box: a component fragment loses its position when layout flattens it.
  const list = <VirtualList count={inColumn(status).length} itemHeight={CARD_HEIGHT} className="grow min-h-0">
    {(i: i32) => <View><TaskCard task={inColumn(status)[i]} /></View>}
  </VirtualList>;
  const node = <View ref={ref} className={`flex-col grow shrink-0 min-w-[240] basis-0 rounded-[6] p-1 ${dropId() === 'column:' + status ? 'bg-[#e1eaf3]' : 'bg-[#eff1f4]'}`}>
    <View className="flex-row items-center h-[36] px-2 gap-2">
      <View className={`w-[6] h-[6] rounded-full bg-[${COLUMN_COLORS[at]}]`} />
      <Text className="text-[12px] font-semibold text-[#535d69] grow">{COLUMN_NAMES[at]}</Text>
      <Text className="text-[11px] font-mono text-[#939ba6]">{inColumn(status).length}</Text>
    </View>
    {inColumn(status).length === 0 && <View className="h-[80] items-center justify-center"><Text className="text-[12px] text-[#9ba4af]">Déposer une carte</Text></View>}
  </View>;
  ui.insert(ref.node, list, 1);
  scrollers.set(status, list);
  onCleanup(() => scrollers.delete(status));
  onCleanup(dnd.dropTarget(ref.node, { data: 'column:' + status }));
  onCleanup(dnd.autoScroll(list));
  return node;
}
function positionDrag(d: dnd.DragInfo): void {
  const b = dragBox(); setDragBox([d.x - gripX, d.y - gripY, b[2], b[3]]);
  if (d.targets.length === 0) { setDropId(''); setDropLine([]); return; }
  const target = d.targets[0];
  setDropId(target.data);
  if (target.data.startsWith('column:') || target.data === d.data) { setDropLine([]); return; }
  const box = ui.screenBox(target.node);
  setDropLine([box[0], target.edge === dnd.EDGE_BOTTOM ? box[1] + box[3] + 3 : box[1] - 3, box[2]]);
}
export function watchDrags(): void {
  dnd.monitor({ onDragStart: (d: dnd.DragInfo) => {
      const b = ui.screenBox(d.source), grip = cardGrip(d.data);
      gripX = grip.length > 0 ? grip[0] : d.x - b[0]; gripY = grip.length > 0 ? grip[1] : d.y - b[1];
      batch(() => { setDragBox([d.x - gripX, d.y - gripY, b[2], b[3]]); setDraggedId(d.data); });
    }, onDrag: positionDrag,
    onDrop: (d: dnd.DragInfo) => {
      setDraggedId(''); setDropId(''); setDropLine([]);
      if (d.targets.length === 0 || selectedId() !== '') return;
      const target = d.targets[0];
      if (target.data.startsWith('column:')) moveTask(d.data, target.data.slice(7));
      else { const onto = taskOf(target.data); if (onto !== null) moveTask(d.data, onto.status, onto.id, target.edge === dnd.EDGE_BOTTOM); }
    }
  });
}
export function DragPreview(): i32 {
  const preview = createNodeRef(), line = createNodeRef();
  const node = <View className="pointer-events-none">
    <View ref={preview} className="absolute pointer-events-none flex-col p-3 rounded-[6] bg-[#ffffff] border border-[#5587bc] shadow-lg"
      hidden={draggedId() === '' ? 1 : 0} style={{ left: dragBox()[0], top: dragBox()[1], width: dragBox()[2], height: dragBox()[3] }}>
      {draggedId() !== '' && taskOf(draggedId()) !== null && <CardContent task={taskOf(draggedId())!} />}
    </View>
    <View ref={line} className="absolute pointer-events-none h-[3] bg-[#5587bc] rounded-full" hidden={dropLine().length === 0 ? 1 : 0}
      style={{ left: dropLine().length > 0 ? dropLine()[0] : 0, top: dropLine().length > 0 ? dropLine()[1] : 0, width: dropLine().length > 0 ? dropLine()[2] : 0 }} />
  </View>;
  ui.openLayer(preview.node, { priority: 100 }); ui.openLayer(line.node, { priority: 101 });
  return node;
}
export function Board(): i32 {
  return <View className="grow min-h-0 px-3 pb-3 pt-2 overflow-x-auto">
    <View className="flex-row gap-2 grow min-h-0 min-w-[1232]">
      {STATUSES.map((status: string, i: i32) => <Column index={i} />)}
    </View>
  </View>;
}
