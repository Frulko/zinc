// The sheet that asks a new folder's name: a field, Cancel (Escape) and Create (Return). `onDone` gets the name, '' when cancelled.
import { PushButton } from 'zinc:appkit';
import { createSignal } from 'zinc:ui/solid';

export interface NewFolderSheetProps { onDone: (name: string) => void }

export function NewFolderSheet(props: NewFolderSheetProps): i32 {
  const [name, setName] = createSignal<string>('untitled folder');
  return <View className="flex-col gap-3 w-[320px]">
    <Text className="text-[13px] font-bold">New Folder</Text>
    <Input className="h-[22px] px-[6px] text-[13px] rounded-[5px] bg-[#ffffff] border border-[#c8c8c8]" value={name()} onInput={setName} aria-label="Folder name" />
    <View className="flex-row justify-end gap-2">
      <PushButton title="Cancel" keyEquivalent="Escape" onPress={() => { props.onDone(''); }} />
      <PushButton title="Create" keyEquivalent="Enter" onPress={() => { props.onDone(name().trim()); }} />
    </View>
  </View>;
}
