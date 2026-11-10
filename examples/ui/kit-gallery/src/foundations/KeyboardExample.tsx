import { createSignal } from 'zinc:ui/solid';
import { Input, Keyboard, heading, captionText } from 'zinc:ui/kit';

export function KeyboardExample(): i32 {
  const [note, setNote] = createSignal('');
  const [lastKey, setLastKey] = createSignal('Focus the note, then tap a key.');
  return <View className="flex-col gap-3 w-full max-w-[720px] min-w-0">
    <Text className={heading(4)}>On-screen keyboard</Text>
    <Input label="Touch note" value={note} onInput={setNote} placeholder="Try the keyboard below" />
    <Keyboard mode="always" layouts={['en', 'fr']} keyHeight={32} gap={2} labelClass="text-[13px]" specialLabelClass="text-[11px]"
      onKey={(key: string) => setLastKey('Last key: ' + key)} />
    <Text role="status" className={captionText()}>{lastKey()}</Text>
  </View>;
}
