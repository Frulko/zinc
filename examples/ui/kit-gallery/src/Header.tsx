import { createSignal } from 'zinc:ui/solid';
import { Button, Select, SelectOption, Switch, heading, leadText } from 'zinc:ui/kit';
import { darkMode, setDarkMode } from './state';

export function GalleryHeader(props: { sections: SelectOption[]; onJump: (id: string) => void }): i32 {
  const [section, setSection] = createSignal('');
  return <View className="flex-col gap-3 shrink-0 p-4 md:px-8">
    <View className="flex-row flex-wrap items-center justify-between gap-4">
      <View className="flex-1 min-w-0 flex-col gap-1">
        <Text className={heading(1)}>Zinc UI kit</Text>
        <Text className={leadText()}>Quiet components, live in one page.</Text>
      </View>
      <Switch checked={darkMode} onChange={setDarkMode} label="Dark" />
    </View>
    <Show when={props.sections.length > 0}>
      <View className="flex-row items-end gap-3">
        <View className="flex-1 min-w-0 max-w-[420px]">
          <Select label="Jump to a family" placeholder="Choose a family" items={props.sections} value={section} onChange={setSection} />
        </View>
        <Button label="Go" disabled={section() === ''} onClick={() => props.onJump(section())} />
        <Button label="Top" variant="outline" onClick={() => { setSection(''); props.onJump(''); }} />
      </View>
    </Show>
  </View>;
}
