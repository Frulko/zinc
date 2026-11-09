import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Card, CardContent, Button, Tooltip, Input, theme, themeColor } from 'zinc:ui/kit';
import { notes, addNote, removeNote } from '../state';

const [draft, setDraft] = createSignal<string>('');

export function Notes(): i32 {
  const t = theme();
  return <View className="flex-col gap-4">
    <View className="flex-row gap-2">
      <Input className="grow" placeholder="Write a note" value={() => draft()} onInput={setDraft} />
      <Button label="Add note" onClick={() => { addNote(draft()); setDraft(''); }} />
    </View>
    <Card>
      <CardContent className="gap-2">
        <Text className={`text-[13px] text-${t.mutedForeground} ${notes().length === 0 ? '' : 'hidden'}`}>No notes yet.</Text>
        <For each={notes()}>{(n: string, i: i32) => <View className="flex-row items-center gap-2">
          <Text className={`grow text-[13px] text-${t.foreground}`}>{n}</Text>
          <Tooltip label="Delete the note"><Button variant="ghost" size="icon" onClick={() => removeNote(i)}>
            <Icon name="trash" size={16} strokeWidth={1.75} color={() => themeColor('mutedForeground')} />
          </Button></Tooltip>
        </View>}</For>
      </CardContent>
    </Card>
  </View>;
}
