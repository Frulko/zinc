import { createNodeRef, createSignal, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { EntryEditor } from './EntryEditor';
import { ROW_HEIGHT } from '../themes';
import { selectedId, selectEntry, editingId, editEntry, toggleTask, deleteEntry, moveEntry, keyboardSelection, screen } from '../state';

const rows = new Map<string, i32>();
export function rowNode(id: string): i32 { return rows.get(id) ?? -1; }

export interface RowProps {
  id: string;
  title: string;
  color: string;
  index: number;
  completed: boolean;
}

export function ClearRow(props: RowProps): i32 {
  const row = createNodeRef();
  const [offsetX, setOffsetX] = createSignal(0);
  const [offsetY, setOffsetY] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  const [reordering, setReordering] = createSignal(false);

  function finishGesture(): void {
    setDragging(false);
    setReordering(false);
    setOffsetX(0);
    setOffsetY(0);
    ui.setNumber(row.node, 'dragAxis', 1);
  }

  function drag(event: ui.PointerEvent): void {
    if (event.phase === 3) {
      finishGesture();
      return;
    }
    if (event.phase === 0) {
      selectEntry(props.id);
      setDragging(true);
    }
    if (reordering()) {
      setOffsetY(event.dy);
      if (event.phase === 2) {
        const destination = props.index + event.dy / ROW_HEIGHT;
        finishGesture();
        moveEntry(props.id, destination);
      }
      return;
    }
    setOffsetX(event.dx);
    if (event.phase !== 2) return;
    const displacement = event.dx;
    finishGesture();
    if (displacement > 80) toggleTask(props.id);
    if (displacement < -80) deleteEntry(props.id);
  }

  const node = <View ref={row} className={`relative w-full shrink-0 ${reordering() ? 'z-20' : 'overflow-hidden'}`}
    style={{ height: ROW_HEIGHT }} dragAxis="x" onDrag={drag}
    onTap={() => editEntry(props.id)}
    onContextMenu={() => { selectEntry(props.id); toggleTask(props.id); }}
    onPointerDown={() => selectEntry(props.id)}
    onLongPress={() => {
      selectEntry(props.id);
      setReordering(true);
      ui.setNumber(row.node, 'dragAxis', 3);
    }}
    onPointerUp={() => { if (!dragging()) finishGesture(); }}
    onPointerCancel={() => { if (!dragging()) finishGesture(); }}>
    <View className={`absolute inset-0 flex-row items-center justify-between px-5 ${offsetX() < 0 ? 'bg-[#d62a26]' : 'bg-[#42b84f]'}`} >
      <Icon name={screen() === 'lists' ? 'chevron-right' : 'check'} size={24} color={() => 0xffffff} />
      <Icon name="x" size={24} color={() => 0xffffff} />
    </View>
    {editingId() === props.id ? <EntryEditor color={props.color} /> :
      <View className={`w-full justify-center px-[15] ${dragging() ? '' : 'transition-transform duration-150 ease-out'} ${reordering() ? 'shadow-xl' : ''} bg-[${props.completed ? '#171717' : props.color}]`}
        style={{ height: ROW_HEIGHT, translateX: offsetX(), translateY: offsetY() }}>
        <Text className={`text-[20px] font-medium select-none ${props.completed ? 'text-[#545454] line-through' : 'text-white'}`}
          numberOfLines={1}>{props.title}</Text>
        {keyboardSelection() && selectedId() === props.id && <View className="absolute left-0 top-0 bottom-0 w-[3] bg-white opacity-70" />}
      </View>}
  </View>;
  rows.set(props.id, row.node);
  onCleanup(() => {
    if (rows.get(props.id) === row.node) rows.delete(props.id);
  });
  return node;
}
