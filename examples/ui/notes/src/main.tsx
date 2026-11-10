import { env } from 'zinc:sys';
import { render, createNodeRef, createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Button, Dialog, Switch, useQuietTheme, setTheme, DARK, LIGHT, theme } from 'zinc:ui/kit';
import { createNotes, Pane } from './state';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';

useQuietTheme();
if (env('NOTES_DARK') === '1') setTheme(DARK);

function focusFirst(root: i32): boolean {
  const node = ui.inspectNode(root);
  if (node === null || node.hidden || ui.isDisabled(root)) return false;
  if (node.focusable) {
    ui.focusNode(root);
    return true;
  }
  for (const child of node.children) if (focusFirst(child)) return true;
  return false;
}

function App(): i32 {
  const notes = createNotes(), list = createNodeRef(), editor = createNodeRef();
  const [dark, setDark] = createSignal(env('NOTES_DARK') === '1');
  const select = (id: i32): void => {
    notes.select(id);
    queueMicrotask(() => focusFirst(editor.node));
  };
  const create = (): void => {
    notes.create();
    queueMicrotask(() => focusFirst(editor.node));
  };
  const back = (): void => {
    notes.setPane(Pane.List);
    queueMicrotask(() => focusFirst(list.node));
  };
  return <View className={`h-full flex-col bg-${theme().background}`}>
    <View className={`flex-row items-center justify-between gap-3 px-4 py-3 border-b border-${theme().border} shrink-0`}>
      <Text className={`text-[13px] text-${theme().mutedForeground}`}>Fieldnotes · In memory</Text>
      <Switch label="Dark" checked={dark} onChange={(on: boolean) => { setDark(on); setTheme(on ? DARK : LIGHT); }} />
    </View>
    <View className="flex-row flex-1 min-h-0 min-w-0">
      <View ref={list} className={`${notes.pane() === Pane.List ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-[300px] shrink-0 min-h-0`}>
        <NoteList notes={notes} onSelect={select} onCreate={create} />
      </View>
      <View ref={editor} className={`${notes.pane() === Pane.Detail ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 min-h-0`}>
        <NoteEditor notes={notes} onBack={back} />
      </View>
    </View>
    <Dialog open={notes.deleting} onOpenChange={notes.setDeleting}
      title="Delete this note?" description={'“' + ((notes.current()?.title ?? '').trim() || 'Untitled note') + '” will be removed from this window. This cannot be undone.'}
      closeButton={false} footer={() => <View className="flex-row gap-2">
      <Button label="Cancel" variant="outline" onClick={() => notes.setDeleting(false)} />
      <Button label="Delete note" variant="destructive" onClick={notes.remove} />
    </View>} />
  </View>;
}
render(App, 0xf2f2f2, null);
