import { createNodeRef, onCleanup } from 'zinc:ui/solid';
import { setScrollContainer } from '../keyboard';
import { ClearRow } from '../components/ClearRow';
import { EntryEditor } from '../components/EntryEditor';
import { currentDocument, editingId, beginCreate } from '../state';
import { TodoList } from '../model';
import { rowColor } from '../themes';

export function ListsPage(): i32 {
  const scroll = createNodeRef();
  const content = <ScrollView ref={scroll} dragToScroll={true} className="grow min-h-0 bg-[#161616]">
    <View className="flex-col">
      {currentDocument().lists.map((list: TodoList, index: i32) =>
        <ClearRow id={list.id} title={list.title} completed={false} index={index}
          color={rowColor('ocean', index, currentDocument().lists.length)} />)}
      {editingId() === 'new' && <EntryEditor color="#10aaf7" />}
      <Button onClick={() => beginCreate()} aria-label="Create a list" className="min-h-[200] bg-transparent items-center justify-start pt-8">
        {currentDocument().lists.length === 0 && <Text className="text-[15px] text-[#666666]">Click or type to create a list.</Text>}
      </Button>
    </View>
  </ScrollView>;
  setScrollContainer(scroll.node);
  onCleanup(() => setScrollContainer(-1));
  return content;
}
