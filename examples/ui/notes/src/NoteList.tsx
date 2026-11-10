import { Button, ListItem, SearchField, Select, EmptyState, theme, heading } from 'zinc:ui/kit';
import { Notes, Note } from './state';

export function NoteList(p: { notes: Notes; onSelect: (id: i32) => void; onCreate: () => void }): i32 {
  const s = p.notes;
  return <View className={`flex flex-col flex-1 min-h-0 border-r border-${theme().border} bg-${theme().background}`}>
    <View className="flex-col gap-4 p-4 shrink-0">
      <View className="flex-row items-center justify-between gap-3"><Text className={heading(3)}>Notes</Text><Button label="New note" size="sm" onClick={p.onCreate} /></View>
      <SearchField value={s.query} onInput={s.setQuery} placeholder="Search notes" />
      <Select label="Filter by tag" value={s.tag} onChange={s.setTag} items={[{ value: '', label: 'All tags' }].concat(s.tags().map((tag: string) => ({ value: tag, label: tag })))} />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{String(s.visible().length) + ' notes'}</Text>
    </View>
    <ScrollView className="flex-1 min-h-0"><View className="flex-col gap-1 px-2 pb-4">
      {s.visible().map((note: Note) => <ListItem title={(note.pinned ? 'Pinned · ' : '') + (note.title.trim() || 'Untitled note')}
        description={(note.tags.length > 0 ? note.tags.join(' · ') + ' — ' : '') + (note.body.replaceAll('\n', ' ').slice(0, 72) || 'No content yet')} selected={() => s.selected() === note.id} onClick={() => p.onSelect(note.id)} />)}
      <Show when={s.visible().length === 0}><EmptyState title={s.notes().length === 0 ? 'Your first note' : 'No matching notes'} description={s.notes().length === 0 ? 'Start with a thought worth keeping.' : 'Try another search or clear the tag filter.'} action={s.notes().length === 0 ? 'Create a note' : 'Clear filters'} onAction={() => {
        if (s.notes().length === 0) p.onCreate(); else { s.setQuery(''); s.setTag(''); }
      }} /></Show>
    </View></ScrollView>
  </View>;
}
