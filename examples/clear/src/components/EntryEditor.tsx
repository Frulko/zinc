import { createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { draft, setDraft, commitEdit, setEditingId, editingId } from '../state';
import { ROW_HEIGHT } from '../themes';

export function EntryEditor(props: { color: string }): i32 {
  const input = createNodeRef();
  onMount(() => {
    ui.focusNode(input.node);
    const end = draft().length;
    ui.select(input.node, editingId() === 'new' ? end : 0, end);
  });

  return <View className={`w-full shrink-0 justify-center px-[15] bg-[${props.color}]`} style={{ height: ROW_HEIGHT }}>
    <Input ref={input} value={draft()} onInput={setDraft} onChange={() => commitEdit()} placeholder="New item…"
      aria-label="Item title" className={`w-full h-[42] bg-transparent text-[20px] font-medium p-0 ${props.color === '#f1f1f1' ? 'text-[#292929]' : 'text-white'}`}
      onKeyDown={(event: ui.KeyEvent) => {
        if (event.key === 'Enter') {
          commitEdit();
          event.preventDefault();
        }
        if (event.key === 'Escape') {
          setEditingId('');
          event.preventDefault();
        }
      }} />
  </View>;
}
