import { createNodeRef, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { ClearRow, rowNode } from '../components/ClearRow';
import { EntryEditor } from '../components/EntryEditor';
import { visibleTasks, activeList, editingId, insertBefore, beginCreate, clearCompleted, showLists } from '../state';
import { rowColor } from '../themes';
import { Task } from '../model';
import { setScrollContainer } from '../keyboard';

export function TasksPage(): i32 {
  const scroll = createNodeRef();
  let pulled = false;
  let pinched = false;
  const content = <View className="grow min-h-0" dragAxis="y"
    onPinch={(event: ui.PointerEvent) => {
      if (event.phase === 0) pinched = false;
      if (event.phase !== 1 || pinched) return;
      if (event.scale < 0.72) {
        pinched = true;
        showLists();
      } else if (event.scale > 1.3) {
        pinched = true;
        let before = '';
        for (const task of visibleTasks()) {
          const node = rowNode(task.id);
          if (node >= 0 && ui.screenBox(node)[1] >= event.gy) { before = task.id; break; }
        }
        beginCreate('', before);
      }
    }}
    onDrag={(event: ui.PointerEvent) => {
      if (event.phase !== 2) return;
      if (event.dy > 85) beginCreate('', visibleTasks().length > 0 ? visibleTasks()[0].id : '');
      if (event.dy < -85) clearCompleted();
    }}>
    <ScrollView ref={scroll} dragToScroll={true} className="grow min-h-0 bg-[#161616]" keyContext="Tasks"
      onScroll={(event: ui.ResponderEvent, gesture: ui.GestureState) => {
        const y = event.nativeEvent.contentOffset.y;
        const maximum = Math.max(0, event.nativeEvent.contentSize.height - event.nativeEvent.layoutMeasurement.height);
        if (y >= 0 && y <= maximum) pulled = false;
        if (pulled) return;
        if (y < -65) {
          pulled = true;
          beginCreate('', visibleTasks().length > 0 ? visibleTasks()[0].id : '');
        } else if (y > maximum + 65) {
          pulled = true;
          clearCompleted();
        }
      }}>
    <View className="flex-col">
      {visibleTasks().map((task: Task, index: i32) => <View>
        {editingId() === 'new' && insertBefore() === task.id && <EntryEditor color={rowColor(activeList()?.theme ?? 'heat', index, visibleTasks().length)} />}
        <ClearRow id={task.id} title={task.title} completed={task.completed} index={index}
          color={rowColor(activeList()?.theme ?? 'heat', index, visibleTasks().filter((item: Task) => !item.completed).length)} />
      </View>)}
      {editingId() === 'new' && insertBefore() === '' && <EntryEditor color={rowColor(activeList()?.theme ?? 'heat', visibleTasks().length, visibleTasks().length + 1)} />}
      <Button onClick={() => beginCreate()} aria-label="Create an item" className="min-h-[160] grow bg-transparent items-center justify-start pt-8">
        {visibleTasks().length === 0 && editingId() === '' && <Text className="text-[15px] text-[#666666]">Click or type to add an item.</Text>}
      </Button>
    </View>
    </ScrollView>
  </View>;
  setScrollContainer(scroll.node);
  onCleanup(() => setScrollContainer(-1));
  return content;
}
