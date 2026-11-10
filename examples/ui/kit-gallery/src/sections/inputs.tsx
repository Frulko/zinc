import { createSignal } from 'zinc:ui/solid';
import { Input, PasswordField, SearchField, Textarea, NumberField, MoneyField, ScrubField, TagInput, OneTimeCode, Select, Combobox, MultiSelect, ShortcutRecorder, heading, theme } from 'zinc:ui/kit';

/** Every Inputs control changes caller-owned state; labels show useful real-world defaults. */
export function InputsSection(): i32 {
  const [name, setName] = createSignal('Fieldwork studio');
  const [password, setPassword] = createSignal('quiet-fields');
  const [query, setQuery] = createSignal('');
  const [note, setNote] = createSignal('Prototype the garden sensor before Friday.');
  const [seats, setSeats] = createSignal(4);
  const [amount, setAmount] = createSignal(1249.5);
  const [opacity, setOpacity] = createSignal(80);
  const [tags, setTags] = createSignal<string[]>(['Design', 'Hardware']);
  const [code, setCode] = createSignal('');
  const [country, setCountry] = createSignal('jp');
  const [language, setLanguage] = createSignal('ts');
  const [languages, setLanguages] = createSignal<string[]>(['ts', 'c']);
  const [shortcut, setShortcut] = createSignal('mod-k');
  const countries = [{ value: 'ca', label: 'Canada' }, { value: 'dk', label: 'Denmark' }, { value: 'jp', label: 'Japan' }, { value: 'ke', label: 'Kenya' }];
  const tools = [{ value: 'ts', label: 'TypeScript' }, { value: 'c', label: 'C' }, { value: 'cpp', label: 'C++' }, { value: 'rust', label: 'Rust' }, { value: 'zig', label: 'Zig' }];
  return <View className="flex-col gap-6">
    <Text className={heading(3)}>Inputs</Text>
    <View className="flex-row flex-wrap items-start gap-8">
      <View className="w-full max-w-[300px] flex-col gap-4">
        <Input label="Workspace" value={name} onInput={setName} hint="A name your team will recognise." clearable={true} />
        <PasswordField label="Password" value={password} onInput={setPassword} hint="Show or hide the saved value." />
        <SearchField label="Search projects" value={query} onInput={setQuery} />
        <Textarea label="Notes" value={note} onInput={setNote} rows={3} />
        <Input label="Project URL" value={() => 'fieldwork'} prefix="https://" suffix=".studio" readOnly={true} />
      </View>
      <View className="w-full max-w-[300px] flex-col gap-4">
        <NumberField label="Seats" value={seats} onChange={setSeats} min={1} max={100} step={1} decimals={0} />
        <MoneyField label="Budget" value={amount} onChange={setAmount} symbol="$" code="USD" min={0} hint="Grouped at rest, plain while editing." />
        <ScrubField label="Opacity" value={opacity} onChange={setOpacity} min={0} max={100} suffix="%" />
        <TagInput label="Project tags" value={tags} onChange={setTags} />
        <OneTimeCode label="Verification code" value={code} onChange={setCode} />
      </View>
      <View className="w-full max-w-[300px] flex-col gap-4">
        <Select label="Country" items={countries} value={country} onChange={setCountry} />
        <Combobox label="Language" items={tools} value={language} onChange={setLanguage} />
        <MultiSelect label="Toolchain" items={tools} value={languages} onChange={setLanguages} searchable={true} maxChips={2} />
        <Text className={`text-[13px] text-${theme().foreground}`}>Command palette shortcut</Text>
        <ShortcutRecorder value={shortcut} onChange={setShortcut} label="Command palette shortcut" />
        <Input label="Disabled field" placeholder="Workspace managed by your team" disabled={true} />
        <Input label="Error example" value={() => 'may'} error="Use at least four characters." />
      </View>
    </View>
  </View>;
}
