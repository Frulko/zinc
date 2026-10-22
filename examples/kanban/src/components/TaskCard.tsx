import { createNodeRef, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { Task, assignment } from '../models';
import { openTask, moveTask, inColumn, draggedId, dropId } from '../state';
import { STATUSES } from '../constants';

const cards = new Map<string, i32>();
export function cardNode(id: string): i32 { return cards.get(id) ?? -1; }
let pressedCard = '', gripX: number = 0, gripY: number = 0;
export function cardGrip(id: string): number[] { return pressedCard === id ? [gripX, gripY] : []; }

export function CardContent(props: { task: Task }): i32 {
  const t = props.task;
  return <View className="flex-col gap-2 grow min-w-0 w-full">
    <View className="flex-row items-center w-full gap-2">
      <Text className="font-mono text-[11px] text-[#88909a] grow">{t.id}</Text>
      <Text className={`text-[10px] ${t.priority === 'high' ? 'text-[#bd6641]' : 'text-[#9a9fa6]'}`}>{t.priority === 'high' ? 'Haute' : t.milestone}</Text>
    </View>
    <Text className="text-[13px] leading-[18] font-semibold text-[#303943] w-full" numberOfLines={2}>{t.title}</Text>
    <View className="flex-row gap-1 h-[17] items-center">
      {t.labels.slice(0, 2).map((label: string) => <View className="rounded-[3] bg-[#f0f2f5] px-1.5 py-0.5"><Text className="text-[10px] text-[#74808f]">{label}</Text></View>)}
    </View>
    <View className="flex-row items-center w-full gap-2 mt-auto">
      <Text className={`text-[11px] grow basis-0 min-w-0 ${t.assignees.length > 0 ? 'text-[#527760]' : 'text-[#9a9fa6]'}`} numberOfLines={1}>{t.assignees.length > 0 ? assignment(t) : 'Non assignée'}</Text>
      <Text className="text-[11px] w-[26] shrink-0 font-mono text-[#88909a]">{t.completed + '/' + t.criteria}</Text>
    </View>
  </View>;
}
export function TaskCard(props: { task: Task }): i32 {
  const t = props.task, ref = createNodeRef();
  const node = <View className="h-[144] px-1 pb-2">
    <Button ref={ref} aria-label={t.id + ' ' + t.title} onClick={() => openTask(t.id)}
      onPointerDown={(e: ui.PointerEvent) => { pressedCard = t.id; gripX = e.x; gripY = e.y; }}
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
      className={`flex-col items-start h-[136] p-3 rounded-[6] border bg-[#ffffff] hover:bg-[#fafbfc] focus:border-[#5587bc] cursor-grab ${draggedId() === t.id ? 'opacity-30' : 'opacity-100'} ${dropId() === t.id ? 'border-[#5587bc]' : 'border-[#dfe3e8]'}`}>
      <CardContent task={t} />
    </Button>
  </View>;
  cards.set(t.id, ref.node);
  const undrag = dnd.draggable(ref.node, { data: t.id });
  const undrop = dnd.dropTarget(ref.node, { data: t.id, edges: dnd.EDGES_VERTICAL });
  onCleanup(() => { if (cards.get(t.id) === ref.node) cards.delete(t.id); undrag(); undrop(); });
  return node;
}
