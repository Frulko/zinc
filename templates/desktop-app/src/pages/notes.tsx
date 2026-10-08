import { createSignal } from 'zinc:ui/solid';
import { theme, hex, Card, Button, Input } from 'zinc:ui/nuxt';
import { notes, addNote, removeNote } from '../state';

const [draft, setDraft] = createSignal<string>('');

export function Notes(): i32 {
  return <View class="flex-col gap-4">
    <View class="flex-row gap-2">
      <Input class="grow" placeholder="Write a note" modelValue={draft} onUpdate={setDraft} />
      <Button label="Add" icon="plus" color="primary" onClick={() => { addNote(draft()); setDraft(''); }} />
    </View>
    <Card>
      <View class="flex-col gap-2">
        <Text class={`text-sm text-${hex(theme().textMuted)} ${notes().length === 0 ? '' : 'hidden'}`}>No notes yet.</Text>
        <For each={notes()}>{(n: string, i: i32) => <View class="flex-row items-center gap-2">
          <Text class={`grow text-${hex(theme().text)}`}>{n}</Text>
          <Button icon="trash-2" color="neutral" variant="ghost" size="sm" onClick={() => removeNote(i)} />
        </View>}</For>
      </View>
    </Card>
  </View>;
}
