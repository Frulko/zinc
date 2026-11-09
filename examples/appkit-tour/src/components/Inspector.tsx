// The inspector pane, Finder's Get Info as a form: the selected file's name, a lock switch, a tag, a rating and its date, saved with Save
// (Return). Under the AppKit host each control is the native one (NSTextField, NSSwitch, NSPopUpButton, NSSlider, NSDatePicker, NSButton), named
// for VoiceOver; drawn, the kits' controls with the same names.
import { Switch, PopUpButton, Slider, DatePicker, PushButton } from 'zinc:appkit';
import { createSignal, createEffect } from 'zinc:ui/solid';
import { inspected, saveFile } from '../state';
import { FormRow } from './FormRow';

const TAGS: string[] = ['None', 'Red', 'Orange', 'Green', 'Blue', 'Purple'];

export function Inspector(): i32 {
  const [name, setName] = createSignal<string>('');
  const [locked, setLocked] = createSignal<boolean>(false);
  const [tag, setTag] = createSignal<string>('None');
  const [rating, setRating] = createSignal<number>(0);
  const [modified, setModified] = createSignal<string>('2026-01-01');
  createEffect(() => {   // a new file in the inspector: its values replace the unsaved ones
    const f = inspected();
    if (f === null) return;
    setName(f.name); setLocked(f.locked); setTag(f.tag); setRating(f.rating); setModified(f.modified);
  });
  const save = (): void => {
    const f = inspected();
    if (f !== null && name().trim() !== '') saveFile(f.id, name().trim(), locked(), tag(), rating(), modified());
  };
  return <View className="flex-col w-[260px] p-4 gap-3">
    <Text className="text-[13px] font-bold">{inspected() === null ? 'No Selection' : 'Info'}</Text>
    <FormRow label="Name">
      <Input className="flex-1 h-[22px] px-[6px] text-[13px] rounded-[5px] bg-[#ffffff] border border-[#c8c8c8]" value={name()} onInput={setName} aria-label="Name" />
    </FormRow>
    <FormRow label="Locked">
      <Switch value={locked} onValueChange={setLocked} accessibilityLabel="Locked" />
    </FormRow>
    <FormRow label="Tag">
      <PopUpButton items={TAGS} value={tag} onValueChange={setTag} className="w-[120px]" accessibilityLabel="Tag" />
    </FormRow>
    <FormRow label="Rating">
      <Slider value={rating} onValueChange={setRating} max={5} step={1} className="w-[120px]" accessibilityLabel="Rating" />
    </FormRow>
    <FormRow label="Modified">
      <DatePicker value={modified} onValueChange={setModified} accessibilityLabel="Date modified" />
    </FormRow>
    <View className="flex-row justify-end">
      <PushButton title="Save" keyEquivalent="Enter" onPress={save} />
    </View>
  </View>;
}
