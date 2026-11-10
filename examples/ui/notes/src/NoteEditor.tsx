import { Button, Input, TagInput, Tabs, CodeEditor, MarkdownView, EmptyState, theme } from 'zinc:ui/kit';
import { Notes } from './state';

export function NoteEditor(p: { notes: Notes; onBack: () => void }): i32 {
  const s = p.notes;
  const editTitle = (title: string): void => {
    const note = s.current();
    if (note !== null) s.update(title, note.body, note.tags);
  };
  const editBody = (body: string): void => {
    const note = s.current();
    if (note !== null) s.update(note.title, body, note.tags);
  };
  const editTags = (tags: string[]): void => {
    const note = s.current();
    if (note !== null) s.update(note.title, note.body, tags);
  };
  return <View className={`flex flex-1 min-w-0 min-h-0 flex-col bg-${theme().card}`}>
    <Show when={s.current() !== null}>
      <View className={`flex-row flex-wrap items-center gap-2 p-4 border-b border-${theme().border} shrink-0`}>
        <Button label="All notes" variant="ghost" size="sm" onClick={p.onBack} className="md:hidden" />
        <View className="flex-1 min-w-0">
          <Tabs label="Note view" items={['Preview', 'Edit']} selected={s.preview} onSelect={s.setPreview} />
        </View>
        <Button label={s.current()?.pinned ? 'Unpin' : 'Pin'} pressed={s.current()?.pinned ?? false}
          variant="outline" size="sm" onClick={s.pin} />
        <Button label="Delete" variant="ghost" size="sm" onClick={() => s.setDeleting(true)} />
      </View>
      <ScrollView className="flex-1 min-h-0">
        <View className="flex-col gap-6 p-4 md:p-8 min-w-0">
          <Input label="Title" value={() => s.current()?.title ?? ''} onInput={editTitle} />
          <TagInput label="Tags" value={() => s.current()?.tags ?? []} onChange={editTags} placeholder="Add a tag, then Enter" />
          <Show when={s.preview() === 0}>
            <Show when={(s.current()?.body ?? '').trim() !== ''}>
              <MarkdownView source={s.current()?.body ?? ''}
                onTask={(body: string, offset: i32, checked: boolean) => editBody(body)} />
            </Show>
            <Show when={(s.current()?.body ?? '').trim() === ''}>
              <EmptyState title="A blank page" description="Switch to Edit and write your first line."
                action="Write a note" onAction={() => s.setPreview(1)} />
            </Show>
          </Show>
          <Show when={s.preview() === 1}>
            <CodeEditor label="Note body" title="Markdown" language="md" value={() => s.current()?.body ?? ''}
              onChange={editBody} height={330} wrap={true} />
          </Show>
          <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>
            Changes stay in this window. Closing it resets the sample notes.
          </Text>
        </View>
      </ScrollView>
    </Show>
    <Show when={s.current() === null}>
      <EmptyState title="Nothing selected" description="Create a note to start writing." action="Create a note" onAction={s.create} />
    </Show>
  </View>;
}
